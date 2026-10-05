/**
 * Tín hiệu máy chủ (lát B3 phần hai, 29/09): what the server saw go wrong, counted per day for /gov. Vercel Hobby keeps
 * its log one hour and a VPS rotates it; a count in the database stays 30 days (migration 033). Never personal data, and
 * never text a request chose: a signal is a kind and a code this file builds from short lists, so no sender can fill the
 * table with rows of their own making.
 */
export type SignalKind = 'unexpected' | 'csp' | 'guest_refused';
export type Signal = { kind: SignalKind; code: string };

const DIRECTIVES = new Set(['default-src', 'script-src', 'script-src-elem', 'script-src-attr', 'style-src', 'style-src-elem', 'style-src-attr',
  'img-src', 'media-src', 'font-src', 'connect-src', 'frame-src', 'frame-ancestors', 'form-action', 'object-src', 'base-uri', 'manifest-src',
  'worker-src', 'child-src']);
const KEYWORDS = new Set(['inline', 'eval', 'wasm-eval', 'trusted-types-policy', 'trusted-types-sink']);

/**
 * A report of what the Content-Security-Policy blocked: which rule, and what kind of thing -- this site's own, another
 * site's, inline, eval, data:, blob: -- never the address itself, which whoever sends the report chooses.
 */
export function cspSignal(directive: unknown, blocked: unknown, appOrigin: string | undefined): Signal {
  const rule = typeof directive === 'string' && DIRECTIVES.has(directive.toLowerCase()) ? directive.toLowerCase() : 'other';
  let what = 'unknown';
  if (typeof blocked === 'string' && blocked) {
    if (KEYWORDS.has(blocked)) what = blocked;
    else if (/^(data|blob):/i.test(blocked)) what = blocked.slice(0, blocked.indexOf(':')).toLowerCase();
    else { try { const url = new URL(blocked); what = /^https?:$/.test(url.protocol) ? (url.origin === appOrigin ? 'self' : 'external') : 'other'; } catch { what = 'other'; } }
  }
  return { kind: 'csp', code: `${rule} ${what}` };
}

/** A guest write that was refused: the operation, the answer and the browser family, the same short lists the log keeps. */
export function refusedSignal(operation: string, status: number, code: string, browser: string): Signal {
  const safe = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || '?';
  return { kind: 'guest_refused', code: `${safe(operation)} ${Number.isInteger(status) ? status : 0} ${safe(code)} ${safe(browser)}` };
}

/**
 * An error nobody planned for, and where: its name, and a PostgreSQL error's five-character code (08006 connection lost,
 * 53300 too many connections...). Never its message, which can carry values from the request.
 */
export function unexpectedSignal(where: 'owner' | 'admin' | 'google' | 'http' | 'guest', error: unknown): Signal {
  const name = error instanceof Error ? error.name.replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) || 'Error' : 'NotAnError';
  const sqlState = (error as { code?: unknown } | null)?.code;
  return { kind: 'unexpected', code: `${where} ${name}${typeof sqlState === 'string' && /^[0-9A-Z]{5}$/.test(sqlState) ? ` ${sqlState}` : ''}` };
}

export type SignalRow = { kind: SignalKind; code: string; count: number; first: Date; last: Date };
type Options = { windowMs?: number; maxKeys?: number; clock?: () => number; defer?: (task: () => Promise<void>) => void };

/**
 * Signals gathered in memory and written together, at most once per `windowMs` per instance: a flood of refused requests is
 * one write every few seconds, not one per request. The first signal after a quiet spell is written at once; what comes
 * during the window waits for its end. `defer` runs the write after the response (Next's `after`), so no request waits for
 * it. A write that fails is dropped: watching the platform must never break it. At most `maxKeys` distinct signals wait.
 */
export class SignalBuffer {
  private pending = new Map<string, SignalRow>();
  private lastWrite = Number.NEGATIVE_INFINITY;
  private scheduled = false;
  private readonly windowMs: number; private readonly maxKeys: number;
  private readonly clock: () => number; private readonly defer: (task: () => Promise<void>) => void;
  constructor(private write: (rows: SignalRow[]) => Promise<void>, options: Options = {}) {
    this.windowMs = options.windowMs ?? 5000; this.maxKeys = options.maxKeys ?? 500;
    this.clock = options.clock ?? Date.now; this.defer = options.defer ?? (task => { void task(); });
  }

  add(signal: Signal) {
    const key = `${signal.kind}\0${signal.code}`, now = new Date(this.clock()), seen = this.pending.get(key);
    if (seen) { seen.count++; seen.last = now; }
    else if (this.pending.size < this.maxKeys) this.pending.set(key, { ...signal, count: 1, first: now, last: now });
    this.schedule();
  }

  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    this.defer(async () => {
      const wait = this.lastWrite + this.windowMs - this.clock();
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      this.scheduled = false;
      await this.flush();
    });
  }

  /** Writes whatever waits, now. */
  async flush() {
    if (!this.pending.size) return;
    const rows = [...this.pending.values()];
    this.pending.clear(); this.lastWrite = this.clock();
    try { await this.write(rows); } catch { /* dropped: see above */ }
  }
}

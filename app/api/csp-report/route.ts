/**
 * Where browsers report what the Content-Security-Policy blocked (lát H1): one log line per report, so a policy that breaks
 * something on a real phone shows up in the server log instead of silently. Never the page's query or anything a guest
 * typed: the directive, the blocked thing's origin (or "inline"/"eval"), the page's path. At most 60 lines a minute per
 * instance, so it cannot be used to flood the log.
 */
let budget = { start: 0, lines: 0 };
const originOrKind = (value: unknown) => {
  if (typeof value !== 'string' || !value) return 'unknown';
  if (!value.includes(':')) return value.slice(0, 20).replace(/[^a-z-]/gi, '');
  try { return new URL(value).origin.slice(0, 120); } catch { return value.split(':')[0].slice(0, 20); }
};
const pathOf = (value: unknown) => { try { return new URL(String(value)).pathname.slice(0, 120); } catch { return 'unknown'; } };

export async function POST(request: Request) {
  const type = request.headers.get('content-type') ?? '';
  if (!/^application\/(csp-report|reports\+json|json)/.test(type)) return new Response(null, { status: 415 });
  const text = await request.text().catch(() => '');
  if (text.length > 16384) return new Response(null, { status: 413 });
  let reports: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(text);
    // The old format is {"csp-report": {...}}; the Reporting API sends [{type, body: {...}}].
    reports = Array.isArray(parsed) ? parsed.filter(item => item?.type === 'csp-violation').map(item => item.body ?? {}) : [parsed?.['csp-report'] ?? {}];
  } catch { return new Response(null, { status: 400 }); }
  const now = Date.now();
  if (now - budget.start > 60_000) budget = { start: now, lines: 0 };
  for (const report of reports.slice(0, 5)) {
    if (budget.lines >= 60) break;
    budget.lines++;
    console.warn('CSP_VIOLATION', JSON.stringify({
      directive: String(report['effective-directive'] ?? report.effectiveDirective ?? report['violated-directive'] ?? 'unknown').slice(0, 40),
      blocked: originOrKind(report['blocked-uri'] ?? report.blockedURL),
      page: pathOf(report['document-uri'] ?? report.documentURL),
    }));
  }
  return new Response(null, { status: 204 });
}

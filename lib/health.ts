/**
 * Is the platform up? What /api/health answers (roadmap B3: something outside watches it and warns Tài). The database is
 * asked at most once per `freshMs` per instance however often the address is called, and never waited on longer than
 * `timeoutMs`: a flood of checks is never a flood of queries, and a database that hangs answers "down", not nothing.
 */
export function healthProbe(ask: () => Promise<unknown>, { freshMs = 5000, timeoutMs = 3000, clock = () => Date.now() } = {}) {
  let last: { at: number; up: boolean } | null = null, pending: Promise<boolean> | null = null;
  const once = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // `ask` may throw before it returns a promise (no database configured): that is down too.
      return await Promise.race([Promise.resolve().then(ask).then(() => true, () => false),
        new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })]);
    } finally { clearTimeout(timer); }
  };
  return async () => {
    if (last && clock() - last.at < freshMs) return last.up;
    pending ??= once().then(up => { last = { at: clock(), up }; pending = null; return up; });
    return pending;
  };
}

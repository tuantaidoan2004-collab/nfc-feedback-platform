/**
 * The pg driver treats sslmode prefer, require and verify-ca as verify-full today, and says on every start that a
 * future major version will not. Naming verify-full outright keeps exactly today's certificate checking and ends
 * the warning, which platforms log at error level and which would otherwise bury real errors. Anything else,
 * including an unset value or a string that is not a URL, passes through untouched.
 */
export function explicitSslMode<T extends string | undefined>(connectionString: T): T {
  if (connectionString === undefined) return connectionString;
  let url: URL;
  try { url = new URL(connectionString); } catch { return connectionString; }
  const mode = url.searchParams.get('sslmode');
  if (!mode || !['prefer', 'require', 'verify-ca'].includes(mode)) return connectionString;
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString() as T;
}

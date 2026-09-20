/**
 * Where to find a real Google Chrome. On Tài's Mac it is the installed app; on CI it is the `chrome` channel that
 * `playwright install --with-deps chrome` puts in place; `CHROME_PATH` overrides both (lát A4, 2026-09-20).
 */
export function realChrome() {
  if (process.env.CHROME_PATH) return { launchOptions: { executablePath: process.env.CHROME_PATH } };
  if (process.env.CI) return { channel: 'chrome' as const };
  return { launchOptions: { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } };
}

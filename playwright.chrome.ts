import type { LaunchOptions } from '@playwright/test';

/**
 * Where to find a real Google Chrome. On Tài's Mac it is the installed app; on CI it is the `chrome` channel that
 * `playwright install --with-deps chrome` puts in place; `CHROME_PATH` overrides both (lát A4, 2026-09-20).
 * `extra` carries flags a suite needs, such as keeping the back/forward cache on.
 */
export function realChromeLaunch(extra: LaunchOptions = {}): LaunchOptions {
  if (process.env.CHROME_PATH) return { ...extra, executablePath: process.env.CHROME_PATH };
  if (process.env.CI) return { ...extra, channel: 'chrome' };
  return { ...extra, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' };
}
/** The same, shaped for `use` in a config or a spec. */
export const realChrome = (extra: LaunchOptions = {}) => ({ launchOptions: realChromeLaunch(extra) });

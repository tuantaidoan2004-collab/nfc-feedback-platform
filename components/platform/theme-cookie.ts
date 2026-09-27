/** Shared by the server shell and the client toggle; a plain module, so the server reads the real string. */
export type Theme = 'dark' | 'light' | 'system';
export const THEME_COOKIE = 'qs_theme';

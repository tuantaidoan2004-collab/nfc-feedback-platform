import { test, expect } from '@playwright/test';
import { defaultConfig, validateConfig, PublishingError } from '../../lib/publishing/config';
import { assertPublishable, thanksProblem } from '../../lib/publishing/policy';
import { DEFAULT_THANKS, ownThanks } from '../../lib/publishing/thanks';

/** Lát M2b: the shop's own thank-you line, before Google. What a page may carry, and what it may never say. */
const page = (thanks?: unknown) => ({ ...defaultConfig('Quán Một'), ...(thanks === undefined ? {} : { thanks }) });
const code = (run: () => unknown) => { try { run(); return 'ok'; } catch (error) { return error instanceof PublishingError ? error.code : String(error); } };

test('a page may carry its own line in both languages, only from version 3, and never an empty or long one', () => {
  expect(validateConfig(page({ vi: 'Cảm ơn bạn đã ghé!', en: 'Thanks for coming!' })).thanks).toEqual({ vi: 'Cảm ơn bạn đã ghé!', en: 'Thanks for coming!' });
  expect(validateConfig(page()).thanks).toBeUndefined();
  for (const bad of [{ vi: 'Chỉ một thứ tiếng' }, { vi: '', en: 'x' }, { vi: 'x'.repeat(121), en: 'x' }, { vi: 'a <b>', en: 'x' }, 'text'])
    expect(code(() => validateConfig(page(bad))), JSON.stringify(bad)).toBe('INVALID_CONFIG');
  expect(code(() => validateConfig({ ...page({ vi: 'a', en: 'b' }), schemaVersion: 2, sections: undefined }))).toBe('INVALID_CONFIG');
});

test('the line never asks for stars or ties the review to a gift; ordinary thanks pass', () => {
  for (const words of ['Cho quán 5 sao nhé!', 'Nhớ chấm điểm 10 cho quán', 'Rate us five stars', 'Cảm ơn ★★★★★', 'Đánh giá quán để nhận quà nhé'])
    expect(thanksProblem(words), words).not.toBeNull();
  for (const words of ['Cảm ơn bạn đã ghé, hẹn gặp lại!', 'Merci beaucoup, see you soon!', 'Quán rất vui được phục vụ bạn'])
    expect(thanksProblem(words), words).toBeNull();
  expect(code(() => assertPublishable(validateConfig(page({ vi: 'Cho quán 5 sao nhé', en: 'Thanks' }))))).toBe('POLICY_THANKS_RATING');
  expect(code(() => assertPublishable(validateConfig(page({ vi: 'Đánh giá để nhận quà', en: 'Thanks' }))))).toBe('POLICY_GOOGLE_EXCHANGE');
});

test('the platform\'s own words count as no line of the shop\'s: nothing to review', () => {
  expect(ownThanks(validateConfig(page({ ...DEFAULT_THANKS })))).toBeNull();
  expect(ownThanks(validateConfig(page()))).toBeNull();
  expect(ownThanks(validateConfig(page({ vi: DEFAULT_THANKS.vi, en: 'Thanks, friend!' })))).toEqual({ vi: DEFAULT_THANKS.vi, en: 'Thanks, friend!' });
});

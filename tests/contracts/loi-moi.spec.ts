import { test, expect } from '@playwright/test';
import { freeTextProblem } from '../../lib/publishing/policy';
import lines from '../../lib/canvas/loi-moi.json' with { type: 'json' };

/**
 * Câu mời theo ngành (Tài 07/10): the line near the Google button fits the shop's trade, and every one of them stays inside
 * docs/google-policy.md — no reward, no naming staff (the trip-wire), and none of what the trip-wire cannot see: no asking first
 * whether the guest was pleased (gating, mục 1 và 3), no "five stars", no words to write, no "right now".
 */
const GATING = ['hài lòng', 'ưng', 'thích', 'vui chứ', 'satisfied', 'happy with', 'enjoyed', '5 sao', 'năm sao', 'five star', 'ngay bây giờ', 'right now', 'nhắc tên', 'hãy viết'];
test('every invitation line is neutral and passes the trip-wire, in both languages', () => {
  const all = Object.entries(lines).flatMap(([key, trade]) => [...trade.above, ...trade.below, ...('photo' in trade ? trade.photo : [])].flatMap(line => [[key, line.vi], [key, line.en]]));
  expect(all.length).toBeGreaterThan(40);
  for (const [key, text] of all) {
    expect(freeTextProblem(text), `${key}: ${text}`).toBeNull();
    for (const word of GATING) expect(text.toLowerCase().includes(word), `${key}: "${text}" chứa "${word}"`).toBe(false);
  }
});

import { expect, test } from '@playwright/test';
import { relativeTime } from '../../lib/relative-time';

test('relative time reads like YouTube, in Vietnamese, with no exact date', () => {
  const now = Date.parse('2026-09-19T12:00:00Z'), ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();
  expect([0, 59, 60, 3599, 3600, 86399, 86400, 6 * 86400, 7 * 86400, 29 * 86400, 30 * 86400, 364 * 86400, 365 * 86400, 800 * 86400].map(s => relativeTime(ago(s), now)))
    .toEqual(['vài giây trước', 'vài giây trước', '1 phút trước', '59 phút trước', '1 giờ trước', '23 giờ trước', '1 ngày trước', '6 ngày trước',
      '1 tuần trước', '4 tuần trước', '1 tháng trước', '12 tháng trước', '1 năm trước', '2 năm trước']);
  // A clock slightly ahead of the server never shows "in the future".
  expect(relativeTime(new Date(now + 5000).toISOString(), now)).toBe('vài giây trước');
});

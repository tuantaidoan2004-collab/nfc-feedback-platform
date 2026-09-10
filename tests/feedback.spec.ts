import { test, expect } from '@playwright/test';

test('low ratings pulse without changing Google access; changing stars updates one experience', async ({ page }) => {
  await page.goto('/t/demo');
  const google = page.getByRole('button', { name: /Google Maps/ });
  const invitation = page.locator('.google-invitation');
  const googlePosition = await google.boundingBox();
  const original = await invitation.innerText();
  await page.getByRole('button', { name: '5 sao', exact: true }).click();
  await page.getByRole('button', { name: '2 sao', exact: true }).click();
  await expect(page.locator('#private-feedback')).toHaveClass(/needs-attention/);
  await expect(page.locator('.pulse-fill')).toHaveCSS('animation-name','feedback-breathe');
  await expect(page.locator('#private-form')).toBeVisible();
  expect(await invitation.innerText()).toBe(original);
  expect(await google.boundingBox()).toEqual(googlePosition);
  await page.getByRole('button', { name: '4 sao', exact: true }).click();
  await expect(page.locator('#private-feedback')).not.toHaveClass(/needs-attention/);
  await page.getByRole('button', { name: '3 sao', exact: true }).click();
  await page.getByLabel('Góp ý của bạn', { exact: true }).fill('Chờ lâu, mong được báo trước.');
  await page.getByRole('button', { name: 'Gửi góp ý', exact: true }).click();
  await page.getByRole('link', { name: /dashboard/ }).click();
  await expect(page.getByTestId('rating-count')).toHaveText('4');
  await expect(page.getByTestId('record-THỬ01').locator('.score')).toHaveText('3/5');
  await expect(page.getByTestId('record-THỬ01')).toContainText('Chờ lâu, mong được báo trước.');
  await page.reload();
  await expect(page.getByTestId('rating-count')).toHaveText('4');
  const row = page.getByTestId('record-THỬ01');
  await row.getByRole('button', { name: /Xem & xử lý/ }).click();
  await row.getByLabel('Trạng thái').selectOption('resolved');
  await expect(page.getByTestId('pending-count')).toHaveText('2');
  await row.getByLabel('Ghi chú nội bộ').fill('Điều chỉnh lịch hẹn.');
  await page.reload();
  await page.getByTestId('record-THỬ01').getByRole('button', { name: /Xem & xử lý/ }).click();
  await expect(page.getByLabel('Ghi chú nội bộ')).toHaveValue('Điều chỉnh lịch hẹn.');
});

test('manual English, reduced motion and no horizontal overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/t/demo');
  await expect(page.getByLabel(/Language/)).toHaveValue('vi');
  await page.getByLabel(/Language/).selectOption('en');
  await page.getByRole('button', { name: '1 stars', exact: true }).click();
  await expect(page.getByRole('button', { name: /Send private feedback/ })).toBeVisible();
  await expect(page.locator('.pulse-fill')).toHaveCSS('animation-name','none');
  await expect(page.getByRole('button', { name: /Google Maps/ })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel(/Language/).selectOption('vi');
  await expect(page.getByRole('button', { name: /Gửi góp ý riêng/ })).toBeVisible();
});

test('storage failure is not reported as saved; broken saved data recovers', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('blocked'); }; });
  await page.goto('/t/demo');
  await page.getByRole('button', { name: '5 sao', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /Chưa lưu được/ })).toBeVisible();
  await expect(page.locator('.rating-receipt')).not.toContainText('5/5');
});

test('corrupt browser data cannot crash the dashboard', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nfc-feedback:demo:v1', '{broken'));
  await page.goto('/demo/dashboard');
  await expect(page.getByTestId('rating-count')).toHaveText('3');
});

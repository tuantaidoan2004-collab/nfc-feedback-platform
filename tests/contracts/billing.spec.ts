import { test, expect } from '@playwright/test';
import { BillingError, readPayment, readPaymentSettings, transferMemo, QR_MAX_CHARS } from '../../lib/billing/rules';

/** Lát P5b-lite: what the operator may type in /gov for receiving money and recording it. Test values only. */
const settings = { bank: 'Ngân hàng Thử', holder: 'NGUYEN VAN THU', account: '0123 456 789', zalo: '+84 912 345 678', qr: 'data:image/png;base64,iVBORw0KGgo=' };
const code = (run: () => unknown) => { try { run(); return 'ok'; } catch (error) { return error instanceof BillingError ? error.code : String(error); } };
const shopId = '00000000-0000-4000-8000-000000000001';

test('payment settings: cleaned numbers, a small picture of a known kind, nothing else', () => {
  expect(readPaymentSettings(settings)).toEqual({ ...settings, account: '0123456789', zalo: '0912345678' });
  expect(readPaymentSettings({ ...settings, qr: null }).qr).toBeNull();
  for (const bad of [{ account: '12345' }, { account: '12a45678' }, { zalo: '0912' }, { bank: '' }, { holder: 'x'.repeat(61) }, { bank: 'Bank <b>' },
    { qr: 'data:image/svg+xml;base64,PHN2Zz4=' }, { qr: 'https://example.com/qr.png' }, { qr: `data:image/png;base64,${'A'.repeat(QR_MAX_CHARS)}` }, { extra: 1 }])
    expect(code(() => readPaymentSettings({ ...settings, ...bad })), JSON.stringify(bad).slice(0, 60)).toBe('INVALID_SETTINGS');
});

test('a record: a payment with an amount, a trial at zero, a real calendar day, an optional short note', () => {
  expect(readPayment({ shopId, kind: 'payment', amountVnd: 30000, coversUntil: '2026-10-31', note: ' Biên lai Zalo ' }))
    .toEqual({ shopId, kind: 'payment', amountVnd: 30000, coversUntil: '2026-10-31', note: 'Biên lai Zalo' });
  expect(readPayment({ shopId, kind: 'trial', amountVnd: 0, coversUntil: '2026-10-15' }).note).toBeNull();
  for (const bad of [{ kind: 'trial', amountVnd: 1000 }, { amountVnd: -1 }, { amountVnd: 1.5 }, { amountVnd: 100_000_001 }, { coversUntil: '2026-02-30' },
    { coversUntil: '31/10/2026' }, { kind: 'refund' }, { shopId: 'one' }, { note: 'x'.repeat(201) }, { note: 'a <b>' }])
    expect(code(() => readPayment({ shopId, kind: 'payment', amountVnd: 30000, coversUntil: '2026-10-31', ...bad })), JSON.stringify(bad)).toBe('INVALID_PAYMENT');
});

test('the transfer content is the shop\'s own code, short enough for any bank app', () => {
  expect(transferMemo('k4u27')).toBe('QS K4U27');
});

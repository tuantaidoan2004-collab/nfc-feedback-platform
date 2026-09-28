'use client';
/* eslint-disable @next/next/no-img-element -- the QR is a data URL the operator uploaded; next/image has nothing to optimise */
import { useState } from 'react';
import styles from './admin.module.css';
import { buttonClass } from './platform/ui';
import { vnd } from '@/lib/publishing/pricing';
import { QR_MAX_CHARS, type PaymentSettings } from '@/lib/billing/rules';
import type { DueShop } from '@/lib/admin/billing';

type Shop = { id: string; slug: string; name: string; monthly: number };
type Latest = Record<string, { kind: 'trial' | 'payment'; coversUntil: string }>;
const day = (iso: string) => iso.split('-').reverse().join('/');
const failed = (code: string) => code === 'INVALID_SETTINGS' ? 'Kiểm tra lại: ngân hàng và chủ tài khoản (tối đa 60 ký tự), số tài khoản 6–20 chữ số, Zalo 8–15 chữ số, ảnh QR JPG/PNG/WebP.'
  : code === 'INVALID_PAYMENT' ? 'Kiểm tra lại số tiền (0–100 triệu, dùng thử là 0đ), ngày và ghi chú (tối đa 200 ký tự).'
  : code === 'BODY_TOO_LARGE' ? 'Ảnh QR quá lớn. Cắt gọn quanh mã rồi tải lại.' : 'Không lưu được. Vui lòng thử lại.';

/** A picture from the phone, shrunk in the browser to at most 1000px and a JPEG, so the whole setting stays small. */
async function readQr(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file), scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d')!; context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

/**
 * Tab Thanh toán, the operator's side (lát P5b-lite, migration 031). Where shops send money -- typed here by Tài, kept in
 * the database, never in the code -- then each payment or free trial as it is received, and the shops to remind on Zalo.
 */
export default function AdminBilling({ initial, shops, latest: initialLatest, due }: { initial: PaymentSettings | null; shops: Shop[]; latest: Latest; due: DueShop[] }) {
  const [settings, setSettings] = useState(initial), [qr, setQr] = useState(initial?.qr ?? null);
  const [latest, setLatest] = useState(initialLatest), [kind, setKind] = useState<'payment' | 'trial'>('payment');
  const [busy, setBusy] = useState(false), [note, setNote] = useState('');
  const send = async (url: string, method: string, body: unknown) => {
    setBusy(true); setNote('');
    try {
      const response = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setNote(failed(data.error)); return null; }
      return data;
    } catch { setNote('Không thể kết nối. Vui lòng thử lại.'); return null; } finally { setBusy(false); }
  };
  return <section className={styles.panel} data-billing>
    <h2>Thanh toán</h2>
    <p className={styles.muted}>Chủ quán chuyển khoản theo thông tin dưới đây, gửi biên lai qua Zalo; bạn ghi nhận ở đây. Chưa có gì tự tạm ngừng khi quá hạn.</p>

    <h3>Thông tin nhận thanh toán</h3>
    <form className={styles.form} data-payment-settings onSubmit={async event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      const body = { bank: form.get('bank'), holder: form.get('holder'), account: form.get('account'), zalo: form.get('zalo'), qr };
      const saved = await send('/gov/api/payment-settings', 'PUT', body);
      if (saved) { setSettings(saved.settings); setNote('Đã lưu thông tin nhận thanh toán. Chủ quán thấy ngay ở tab Thanh toán.'); }
    }}>
      <label>Ngân hàng<input name="bank" required maxLength={60} defaultValue={settings?.bank ?? ''} placeholder="Tên ngân hàng"/></label>
      <label>Chủ tài khoản<input name="holder" required maxLength={60} defaultValue={settings?.holder ?? ''} placeholder="Tên in hoa không dấu"/></label>
      <label>Số tài khoản<input name="account" required inputMode="numeric" maxLength={24} defaultValue={settings?.account ?? ''}/></label>
      <label>Zalo nhận biên lai<input name="zalo" required inputMode="tel" maxLength={20} defaultValue={settings?.zalo ?? ''}/></label>
      <label>Ảnh mã QR của ngân hàng<input type="file" accept="image/png,image/jpeg,image/webp" data-qr-file onChange={async event => {
        const file = event.target.files?.[0]; if (!file) return;
        try { const data = await readQr(file); if (data.length > QR_MAX_CHARS) setNote(failed('BODY_TOO_LARGE')); else setQr(data); }
        catch { setNote('Không đọc được ảnh này.'); }
      }}/></label>
      {qr && <p><img src={qr} alt="Mã QR nhận thanh toán" className={styles.mediaThumb} data-qr-preview/>{' '}
        <button type="button" className={buttonClass('quiet')} onClick={() => setQr(null)}>Bỏ ảnh QR</button></p>}
      <button className={buttonClass('primary')} disabled={busy}>Lưu thông tin</button>
    </form>

    <h3>Ghi nhận thanh toán</h3>
    <form className={styles.form} data-record-payment onSubmit={async event => {
      event.preventDefault(); const form = new FormData(event.currentTarget), element = event.currentTarget;
      const shopId = String(form.get('shopId'));
      const body = { shopId, kind, amountVnd: kind === 'trial' ? 0 : Number(form.get('amountVnd')), coversUntil: form.get('coversUntil'), note: form.get('note') };
      const saved = await send('/gov/api/payments', 'POST', body);
      if (saved) {
        const shop = shops.find(item => item.id === shopId);
        setLatest(current => ({ ...current, [shopId]: { kind, coversUntil: saved.payment.coversUntil } }));
        setNote(`Đã ghi nhận: ${shop?.name ?? ''} ${kind === 'trial' ? 'dùng thử' : 'đã trả'} tới ${day(saved.payment.coversUntil)}.`); element.reset(); setKind('payment');
      }
    }}>
      <label>Quán<select name="shopId" required>{shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name} ({shop.slug}) · {vnd(shop.monthly)}/tháng</option>)}</select></label>
      <label>Loại<select name="kind" value={kind} onChange={event => setKind(event.target.value as 'payment' | 'trial')}>
        <option value="payment">Đã nhận tiền</option><option value="trial">Cho dùng thử miễn phí</option></select></label>
      {kind === 'payment' && <label>Số tiền đã nhận (đồng)<input name="amountVnd" type="number" required min={0} max={100000000} step={1000}/></label>}
      <label>{kind === 'trial' ? 'Dùng thử tới hết ngày' : 'Đã trả tới hết ngày'}<input name="coversUntil" type="date" required/></label>
      <label>Ghi chú (không bắt buộc)<input name="note" maxLength={200} placeholder="Biên lai Zalo 28/09"/></label>
      <button className={buttonClass('primary')} disabled={busy || !shops.length}>Ghi nhận</button>
    </form>
    {note && <p role="status" className={styles.muted} data-billing-note>{note}</p>}

    <h3>Sắp tới hạn hoặc đã quá hạn {due.length > 0 && <span>({due.length})</span>}</h3>
    {due.length === 0 ? <p className={styles.muted} data-due-empty>Không quán nào tới hạn trong 7 ngày.</p> :
      <ul className={styles.items}>{due.map(row => <li key={row.shop_id} data-due={row.slug}>
        <strong>{row.name}</strong> · /{row.slug} · {row.kind === 'trial' ? 'dùng thử' : 'đã trả'} tới {day(row.covers_until)} ·{' '}
        {row.days_left < 0 ? `quá hạn ${-row.days_left} ngày` : row.days_left === 0 ? 'hết hạn hôm nay' : `còn ${row.days_left} ngày`}
      </li>)}</ul>}
    <details><summary>Mọi quán ({shops.length})</summary>
      <ul className={styles.items}>{shops.map(shop => <li key={shop.id} data-billing-shop={shop.slug}>{shop.name} · {vnd(shop.monthly)}/tháng ·{' '}
        {latest[shop.id] ? `${latest[shop.id].kind === 'trial' ? 'dùng thử' : 'đã trả'} tới ${day(latest[shop.id].coversUntil)}` : 'chưa ghi nhận gì'}</li>)}</ul>
    </details>
  </section>;
}

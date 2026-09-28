'use client';
/* eslint-disable @next/next/no-img-element -- the operator's QR is a data URL from the settings; next/image has nothing to optimise */
import { useEffect, useState } from 'react';
import styles from './owner-app.module.css';
import { buttonClass } from './platform/ui';
import { FREE_PAGES, vnd } from '@/lib/publishing/pricing';
import type { OwnerBillingView } from '@/lib/owner/billing';

const day = (iso: string) => iso.split('-').reverse().join('/');

/**
 * The shop's billing tab (lát P5b-lite; ui-ux-nguon-tham-khao.md mục 5H, Tài 27/09: no gateway). What a month costs today,
 * how far the shop has paid or may try, and how to pay: the operator's QR and account, the transfer's content, and where
 * to send the receipt. It says only what is true: nothing pauses by itself when a date passes.
 */
export default function BillingPanel({ endpoint }: { endpoint: string }) {
  const [view, setView] = useState<OwnerBillingView | null>(null), [error, setError] = useState(''), [copied, setCopied] = useState('');
  useEffect(() => {
    let live = true;
    fetch(`${endpoint}/billing`, { cache: 'no-store' }).then(async response => {
      const body = await response.json().catch(() => ({}));
      if (!live) return;
      if (response.ok) setView(body);
      else setError(body.error === 'OWNER_ROLE_REQUIRED' ? 'Chỉ chủ quán xem được phần thanh toán.' : 'Chưa tải được phần thanh toán.');
    }, () => { if (live) setError('Không thể kết nối. Vui lòng thử lại.'); });
    return () => { live = false; };
  }, [endpoint]);
  const copy = (label: string, text: string) => { void navigator.clipboard?.writeText(text).then(() => setCopied(label), () => setCopied('')); };
  if (!view) return <section className={styles.panel} aria-label="Thanh toán" data-panel="billing"><h2>Thanh toán</h2><p className={styles.hint}>{error || 'Đang tải…'}</p></section>;
  const { status, transfer } = view;
  return <section aria-label="Thanh toán" data-panel="billing">
    <div className={styles.panel} data-billing-status={status.kind === 'none' ? 'none' : status.daysLeft < 0 ? 'overdue' : status.kind}>
      <h2>Phí và hạn thanh toán</h2>
      <p data-billing-monthly>Phí hằng tháng hiện tại: <strong>{view.monthly ? `${vnd(view.monthly)}/tháng` : 'miễn phí'}</strong>
        {!view.monthly && <> ({FREE_PAGES} trang có phí đầu tiên được miễn; template 6 miễn phí)</>}</p>
      <p data-billing-state style={{ marginTop: 10 }}>{status.kind === 'none'
        ? 'Chưa có kỳ thanh toán nào. Chúng tôi báo qua Zalo trước khi bắt đầu thu phí.'
        : status.daysLeft < 0 ? <>Đã quá hạn {-status.daysLeft} ngày (hết hạn {day(status.coversUntil)}). Chuyển khoản theo hướng dẫn dưới đây để tiếp tục.</>
        : <>{status.kind === 'trial' ? 'Đang dùng thử miễn phí' : 'Đã thanh toán'} tới hết ngày <strong>{day(status.coversUntil)}</strong>
          {status.daysLeft === 0 ? ' — hết hạn hôm nay.' : ` — còn ${status.daysLeft} ngày.`} Chúng tôi nhắc qua Zalo trước khi tới hạn.</>}</p>
    </div>

    <div className={styles.panel} data-billing-transfer>
      <h2>Cách thanh toán</h2>
      {!transfer ? <p className={styles.hint}>Thông tin chuyển khoản sẽ có ở đây khi nền tảng bắt đầu thu phí.</p> : <>
        <p className={styles.hint}>1. Quét mã bằng ứng dụng ngân hàng, hoặc chuyển khoản theo số tài khoản. 2. Ghi đúng nội dung chuyển khoản.
          3. Chụp biên lai gửi qua Zalo. Chúng tôi ghi nhận và cập nhật ngày ở trên.</p>
        {transfer.qr && <img src={transfer.qr} alt="Mã QR chuyển khoản" data-billing-qr style={{ display: 'block', width: 'min(260px, 100%)', height: 'auto', margin: '12px 0', borderRadius: 12 }} />}
        <dl className={styles.grid2}>
          <div><dt className={styles.hint}>Ngân hàng</dt><dd>{transfer.bank}</dd></div>
          <div><dt className={styles.hint}>Chủ tài khoản</dt><dd>{transfer.holder}</dd></div>
          <div><dt className={styles.hint}>Số tài khoản</dt><dd><strong data-billing-account>{transfer.account}</strong></dd></div>
          <div><dt className={styles.hint}>Nội dung chuyển khoản</dt><dd><strong data-billing-memo>{transfer.memo}</strong></dd></div>
        </dl>
        <div className={styles.actions}>
          <button type="button" className={buttonClass('secondary')} onClick={() => copy('account', transfer.account)}>{copied === 'account' ? 'Đã chép số tài khoản ✓' : 'Chép số tài khoản'}</button>
          <button type="button" className={buttonClass('secondary')} onClick={() => copy('memo', transfer.memo)}>{copied === 'memo' ? 'Đã chép nội dung ✓' : 'Chép nội dung'}</button>
          <a className={buttonClass('primary')} href={`https://zalo.me/${transfer.zalo}`} target="_blank" rel="noreferrer" data-billing-zalo>Gửi biên lai qua Zalo</a>
        </div>
      </>}
    </div>

    {view.history.length > 0 && <div className={styles.panel} data-billing-history>
      <h2>Đã ghi nhận</h2>
      <ul className={styles.hint}>{view.history.map((row, i) => <li key={i}>
        {new Date(row.recordedAt).toLocaleDateString('vi-VN')} · {row.kind === 'trial' ? 'Dùng thử' : `Đã nhận ${vnd(row.amountVnd)}`} · tới {day(row.coversUntil)}</li>)}</ul>
    </div>}
  </section>;
}

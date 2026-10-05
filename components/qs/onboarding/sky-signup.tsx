'use client';
/**
 * Bước đầu của onboarding, pha trời xanh (kịch bản mục 4, mẫu Jitter): chào mừng → bạn tên gì → quán của bạn là gì → tạo
 * tài khoản. Mỗi màn một câu hỏi; tài khoản chỉ được tạo ở màn cuối, cùng lúc với quán (lib/account/signup.ts).
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './sky.module.css';
import Journey from './journey';
import Icon from '../icons';

const KINDS: [string, string, string][] = [['cafe', 'Cà phê', '☕'], ['restaurant', 'Nhà hàng', '🍜'], ['tea', 'Trà sữa & bánh', '🧋'],
  ['beauty', 'Spa & làm đẹp', '💅'], ['retail', 'Cửa hàng', '🛍️'], ['other', 'Khác', '✨']];
const EMOJIS = ['👋', '🧑‍💼', '🏪', '🔐', '🎉'];
const ERRORS: Record<string, string> = {
  INVALID_USERNAME: 'Tên đăng nhập 3–64 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.', INVALID_EMAIL: 'Email chưa đúng.',
  WEAK_PASSWORD: 'Mật khẩu cần ít nhất 12 ký tự.', OWNER_ALREADY_EXISTS: 'Tên đăng nhập hoặc email này đã có tài khoản. Hãy đăng nhập.',
  GOOGLE_ALREADY_LINKED: 'Tài khoản Google này đã có tài khoản. Hãy đăng nhập.', TOO_MANY_ATTEMPTS: 'Có quá nhiều lượt đăng ký lúc này. Thử lại sau ít phút.',
  CANCELLED: 'Bạn đã huỷ đăng nhập Google.', GOOGLE_EMAIL_UNVERIFIED: 'Email Google này chưa được xác minh.',
};
/** "Đoàn Tuấn Tài" → "doantuantai": a starting @handle the owner can change. */
const handleFrom = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);

export default function SkySignup({ google, notice }: { google: boolean; notice: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState(notice ? 3 : 0), [name, setName] = useState(''), [kind, setKind] = useState<string | null>(null);
  const [handle, setHandle] = useState(''), [handleTouched, setHandleTouched] = useState(false);
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(notice ? ERRORS[notice] ?? '' : ''), [busy, setBusy] = useState(false), [help, setHelp] = useState(false);
  const suggested = useMemo(() => { const h = handleFrom(name); return h.length >= 3 ? h : ''; }, [name]);
  const at = handleTouched ? handle : suggested;
  useEffect(() => { if (step !== 0) return; const timer = window.setTimeout(() => setStep(1), 2600); return () => window.clearTimeout(timer); }, [step]);
  const next = () => { setError(''); setStep(s => Math.min(3, s + 1)); };
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/start/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: at.replace(/^@/, '').toLowerCase(), email, password, displayName: name.trim() || undefined, kind: kind ?? undefined }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(ERRORS[body.error] ?? 'Chưa tạo được tài khoản. Thử lại.'); return; }
      router.push(body.next);
    } catch { setError('Không thể kết nối. Thử lại.'); } finally { setBusy(false); }
  };
  return <div className={styles.sky} onClick={() => step === 0 && setStep(1)}>
    <div className={styles.glow} />
    <header className={styles.top}>
      <Link href="/" className={styles.brand}>Quite Sensational</Link>
      <div className={styles.dots} aria-label={`Bước ${step + 1} trên 4`}>{[0, 1, 2, 3].map(i => <span key={i} data-on={i === step} />)}</div>
    </header>
    <div className={styles.stage}>
      {step === 0 && <section className={styles.screen} key="0">
        <h1 className={styles.title}>Chào mừng<br />đối tác</h1>
        <p className={styles.lead}>Trang của quán, mở ra từ một lần chạm thẻ.</p>
      </section>}
      {step === 1 && <section className={styles.screen} key="1">
        <h1 className={`${styles.title} ${styles.mid}`}>Bạn tên gì?</h1>
        <form className={styles.form} onSubmit={event => { event.preventDefault(); if (name.trim()) next(); }}>
          <input className={styles.input} autoFocus maxLength={60} placeholder="Tên của bạn" value={name} onChange={event => setName(event.target.value)} aria-label="Tên của bạn" />
          <button className={styles.go} disabled={!name.trim()}>Tiếp tục</button>
        </form>
      </section>}
      {step === 2 && <section className={styles.screen} key="2">
        <h1 className={`${styles.title} ${styles.mid}`}>Quán của bạn là…</h1>
        <div className={styles.choices} role="group" aria-label="Loại quán">{KINDS.map(([value, label, emoji]) =>
          <button key={value} type="button" className={styles.choice} aria-pressed={kind === value}
            onClick={() => { setKind(value); window.setTimeout(next, 320); }}><span style={{ fontSize: 26 }}>{emoji}</span>{label}</button>)}</div>
      </section>}
      {step === 3 && <section className={styles.screen} key="3">
        <h1 className={`${styles.title} ${styles.mid}`}>Tạo tài khoản</h1>
        <p className={styles.lead}>Chỉ cần vài bước là bạn có thể sử dụng được rồi.</p>
        <div className={styles.form}>
          {google && <form method="post" action="/api/owner/v2/google/start" className={styles.form}>
            <input type="hidden" name="intent" value="signup" /><input type="hidden" name="username" value={at} />
            <input type="hidden" name="displayName" value={name.trim()} /><input type="hidden" name="kind" value={kind ?? ''} />
            <button className={`${styles.go} ${styles.google}`} disabled={at.length < 3}><Icon name="google" size={22} /> Tiếp tục với Google</button>
          </form>}
          {google && <div className={styles.or}>hoặc dùng email</div>}
          <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit(); }}>
            <div className={styles.handle}><span>@</span><input className={styles.input} autoCapitalize="none" spellCheck={false} autoComplete="username" required minLength={3} maxLength={64}
              placeholder="tên đăng nhập" value={at} onChange={event => { setHandleTouched(true); setHandle(event.target.value.toLowerCase().replace(/\s/g, '')); }} aria-label="Tên đăng nhập" /></div>
            <input className={styles.input} type="email" autoComplete="email" required placeholder="Email" value={email} onChange={event => setEmail(event.target.value)} aria-label="Email" />
            <input className={styles.input} type="password" autoComplete="new-password" required minLength={12} placeholder="Mật khẩu (ít nhất 12 ký tự)" value={password}
              onChange={event => setPassword(event.target.value)} aria-label="Mật khẩu" />
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button className={styles.go} disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
          </form>
          <p className={styles.small}>Đã có tài khoản? <Link href="/owner/login">Đăng nhập</Link></p>
        </div>
      </section>}
    </div>
    {step > 0 && <button type="button" className={styles.back} onClick={event => { event.stopPropagation(); setError(''); setStep(s => Math.max(0, s - 1)); }}>← Quay lại</button>}
    <Journey emojis={EMOJIS} current={step} />
    <button type="button" className={styles.help} aria-label="Trợ giúp" aria-expanded={help} onClick={event => { event.stopPropagation(); setHelp(h => !h); }}>?</button>
    {help && <div className={styles.helpCard} role="dialog" aria-label="Trợ giúp" onClick={event => event.stopPropagation()}>
      <strong>Cần giúp?</strong>
      <span>Bước nào chưa chắc thì cứ đi tiếp — mọi thứ sửa lại được trong giao diện chính. Đội ngũ Quite Sensational cũng có thể dựng trang giúp bạn (Library → More).</span>
      <Link href="/owner/login">Đã có tài khoản? Đăng nhập</Link>
    </div>}
  </div>;
}

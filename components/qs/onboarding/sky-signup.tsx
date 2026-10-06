'use client';
/**
 * Bước đầu của onboarding, pha trời xanh (kịch bản mục 1 bước 5 và mục 4, mẫu Jitter): chào mừng → **bạn là…** → (chủ quán
 * lần đầu) bạn tên gì → quán của bạn là gì → tạo tài khoản. Mỗi màn một câu hỏi; tài khoản chỉ được tạo ở màn cuối, cùng lúc
 * với quán (lib/account/signup.ts). Quán Admin Tài đã tạo sẵn: nhắn Zalo nhận link đặt mật khẩu dùng một lần. Nhân viên (G3):
 * gõ @chủ quán hay link trang của quán cùng tài khoản của mình → yêu cầu chờ chủ duyệt; có link mời thì bấm link đó.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './sky.module.css';
import Journey from './journey';
import Icon from '../icons';
import { ZALO } from '@/lib/contact';
import { JOIN_ERRORS } from './join-wait';

const KINDS: [string, string, string][] = [['cafe', 'Cà phê', '☕'], ['restaurant', 'Nhà hàng', '🍜'], ['tea', 'Trà sữa & bánh', '🧋'],
  ['beauty', 'Spa & làm đẹp', '💅'], ['retail', 'Cửa hàng', '🛍️'], ['other', 'Khác', '✨']];
type Who = 'new' | 'prepared' | 'staff';
const WHO: [Who, string, string, string][] = [['new', 'Chủ quán, lần đầu', 'Tạo tài khoản và quán ngay', '🏪'],
  ['prepared', 'Chủ quán, Admin Tài đã tạo sẵn', 'Nhận link đặt mật khẩu qua Zalo', '💬'], ['staff', 'Nhân viên của quán', 'Vào quán nơi bạn làm', '🤝']];
const EMOJIS: Record<Who, string[]> = { new: ['👋', '👀', '🧑‍💼', '🏪', '🔐'], prepared: ['👋', '👀', '💬'], staff: ['👋', '👀', '🤝'] };
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
  const [step, setStep] = useState(notice ? 4 : 0), [who, setWho] = useState<Who | null>(notice ? 'new' : null), [name, setName] = useState(''), [kind, setKind] = useState<string | null>(null);
  const path = who ?? 'new', last = path === 'new' ? 4 : 2;
  const [handle, setHandle] = useState(''), [handleTouched, setHandleTouched] = useState(false);
  const [joinShop, setJoinShop] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(notice ? ERRORS[notice] ?? '' : ''), [busy, setBusy] = useState(false), [help, setHelp] = useState(false);
  const suggested = useMemo(() => { const h = handleFrom(name); return h.length >= 3 ? h : ''; }, [name]);
  const at = handleTouched ? handle : suggested;
  useEffect(() => { if (step !== 0) return; const timer = window.setTimeout(() => setStep(1), 2600); return () => window.clearTimeout(timer); }, [step]);
  const next = () => { setError(''); setStep(s => Math.min(last, s + 1)); };
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/start/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: at.replace(/^@/, '').toLowerCase(), email, password, displayName: name.trim() || undefined,
          ...(who === 'staff' ? { join: joinShop } : { kind: kind ?? undefined }) }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(ERRORS[body.error] ?? JOIN_ERRORS[body.error] ?? 'Chưa tạo được tài khoản. Thử lại.'); return; }
      router.push(body.next);
    } catch { setError('Không thể kết nối. Thử lại.'); } finally { setBusy(false); }
  };
  return <div className={styles.sky} onClick={() => step === 0 && setStep(1)}>
    <div className={styles.glow} />
    <header className={styles.top}>
      <Link href="/" className={styles.brand}>Quite Sensational</Link>
      <div className={styles.dots} aria-label={`Bước ${step + 1} trên ${last + 1}`}>{EMOJIS[path].map((_, i) => <span key={i} data-on={i === step} />)}</div>
    </header>
    <div className={styles.stage}>
      {step === 0 && <section className={styles.screen} key="0">
        <h1 className={styles.title}>Chào mừng<br />đối tác</h1>
        <p className={styles.lead}>Trang của quán, mở ra từ một lần chạm thẻ.</p>
      </section>}
      {step === 1 && <section className={styles.screen} key="1">
        <h1 className={`${styles.title} ${styles.mid}`}>Bạn là…</h1>
        <div className={styles.choices} role="group" aria-label="Bạn là">{WHO.map(([value, label, hint, emoji]) =>
          <button key={value} type="button" className={styles.choice} aria-pressed={who === value} data-who={value}
            onClick={() => { setWho(value); setError(''); window.setTimeout(() => setStep(2), 320); }}>
            <span style={{ fontSize: 26 }}>{emoji}</span>{label}<small>{hint}</small></button>)}</div>
      </section>}
      {step === 2 && who === 'prepared' && <section className={styles.screen} key="prepared" data-who-screen="prepared">
        <h1 className={`${styles.title} ${styles.mid}`}>Quán của bạn đã sẵn sàng</h1>
        <p className={styles.lead}>Admin Tài đã tạo sẵn tài khoản và trang cho quán. Nhắn Zalo cho Admin Tài: bạn nhận một link để tự đặt mật khẩu
          (chỉ bạn biết), bấm vào là vào thẳng quán của mình.</p>
        <div className={styles.form}>
          <a className={styles.go} href={ZALO.url} target="_blank" rel="noopener noreferrer" style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>Nhắn Admin Tài qua Zalo</a>
          <p className={styles.small}>Zalo {ZALO.number} · Đã đặt mật khẩu rồi? <Link href="/owner/login">Đăng nhập</Link></p>
        </div>
      </section>}
      {step === 2 && who === 'staff' && <section className={styles.screen} key="staff" data-who-screen="staff">
        <h1 className={`${styles.title} ${styles.mid}`}>Vào quán nơi bạn làm</h1>
        <p className={styles.lead}>Gõ @tài khoản của chủ quán hoặc dán link trang của quán, rồi tạo tài khoản của bạn. Chủ quán duyệt là bạn vào được.</p>
        <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit(); }}>
          <input className={styles.input} required maxLength={300} placeholder="@chủ quán, hoặc link trang của quán" value={joinShop}
            onChange={event => setJoinShop(event.target.value)} aria-label="Quán" autoCapitalize="none" spellCheck={false} />
          <input className={styles.input} maxLength={60} placeholder="Tên của bạn" value={name} onChange={event => setName(event.target.value)} aria-label="Tên của bạn" />
          <div className={styles.handle}><span>@</span><input className={styles.input} autoCapitalize="none" spellCheck={false} autoComplete="username" required minLength={3} maxLength={64}
            placeholder="tên đăng nhập của bạn" value={at} onChange={event => { setHandleTouched(true); setHandle(event.target.value.toLowerCase().replace(/\s/g, '')); }} aria-label="Tên đăng nhập" /></div>
          <input className={styles.input} type="email" autoComplete="email" required placeholder="Email" value={email} onChange={event => setEmail(event.target.value)} aria-label="Email" />
          <input className={styles.input} type="password" autoComplete="new-password" required minLength={12} placeholder="Mật khẩu (ít nhất 12 ký tự)" value={password}
            onChange={event => setPassword(event.target.value)} aria-label="Mật khẩu" />
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.go} disabled={busy}>{busy ? 'Đang gửi…' : 'Tạo tài khoản và xin vào quán'}</button>
        </form>
        <p className={styles.small}>Có link mời từ chủ quán? Bấm link đó là vào thẳng. Đã có tài khoản? <Link href="/owner/login">Đăng nhập</Link></p>
      </section>}
      {step === 2 && who === 'new' && <section className={styles.screen} key="2">
        <h1 className={`${styles.title} ${styles.mid}`}>Bạn tên gì?</h1>
        <form className={styles.form} onSubmit={event => { event.preventDefault(); if (name.trim()) next(); }}>
          <input className={styles.input} autoFocus maxLength={60} placeholder="Tên của bạn" value={name} onChange={event => setName(event.target.value)} aria-label="Tên của bạn" />
          <button className={styles.go} disabled={!name.trim()}>Tiếp tục</button>
        </form>
      </section>}
      {step === 3 && who === 'new' && <section className={styles.screen} key="3">
        <h1 className={`${styles.title} ${styles.mid}`}>Quán của bạn là…</h1>
        <div className={styles.choices} role="group" aria-label="Loại quán">{KINDS.map(([value, label, emoji]) =>
          <button key={value} type="button" className={styles.choice} aria-pressed={kind === value}
            onClick={() => { setKind(value); window.setTimeout(next, 320); }}><span style={{ fontSize: 26 }}>{emoji}</span>{label}</button>)}</div>
      </section>}
      {step === 4 && who === 'new' && <section className={styles.screen} key="4">
        <h1 className={`${styles.title} ${styles.mid}`}>Tạo tài khoản</h1>
        <p className={styles.lead}>Chỉ cần vài bước là bạn có thể sử dụng được rồi. Dùng thử miễn phí, sau đó kích hoạt bằng 10.000đ.</p>
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
    <Journey emojis={EMOJIS[path]} current={step} />
    <button type="button" className={styles.help} aria-label="Trợ giúp" aria-expanded={help} onClick={event => { event.stopPropagation(); setHelp(h => !h); }}>?</button>
    {help && <div className={styles.helpCard} role="dialog" aria-label="Trợ giúp" onClick={event => event.stopPropagation()}>
      <strong>Cần giúp?</strong>
      <span>Bước nào chưa chắc thì cứ đi tiếp — mọi thứ sửa lại được trong giao diện chính. Trang của quán do Admin Tài dựng sau khi bạn chọn mẫu; cần hỏi gì cứ nhắn Zalo {ZALO.number}.</span>
      <Link href="/owner/login">Đã có tài khoản? Đăng nhập</Link>
    </div>}
  </div>;
}

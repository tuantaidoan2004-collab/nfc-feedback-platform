import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminAuth, AdminError } from '@/lib/admin/auth';
import { BRUSHES, STICKERS, type ShapeKey } from '@/lib/canvas/doc';
import { database } from '@/server/db';
import { adminEnabled, adminSessionToken } from '@/server/admin';
import Shape from '@/components/canvas/shapes';
import Powder from '@/components/canvas/powder';
import CanvasIcon from '@/components/canvas/icons';
import styles from '@/components/admin.module.css';
import { Eyebrow } from '@/components/platform/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kho chi tiết', robots: { index: false, follow: false } };

const ICON_SHOW = ['google', 'google-tron', 'google-net', 'maps', 'maps-mau', 'maps-net', 'maps-giay', 'instagram', 'instagram-dac', 'instagram-net',
  'tiktok', 'tiktok-vuong', 'tiktok-net', 'web', 'web-tro', 'globe', 'link', 'zalo', 'facebook'] as const;
const GROUPS: [string, string][] = [['sao', 'Sao lấp lánh'], ['tim', 'Tim'], ['cuoi', 'Mặt cười'], ['dau', 'Dấu vẽ tay'], ['quan', 'Quán: cây, đèn, ly, ghế, mái']];
/** Each sticker as a page would use it: plain, turned, roughened with crayon; in three of the mockups' colours. */
const LOOKS = [{ color: '#ff4fb4', r: 0, grain: false }, { color: '#b59cff', r: -14, grain: false }, { color: '#f1ece0', r: 10, grain: true }];
/** Brush stamps laid like make-up powder: a wide thin spray, a cloud, a stroke, a dab, then loose grain over all (nền kiểu Sentry). */
const STAMPS = [[-80, 20, 420, 340, 'bot-xit'], [120, -60, 340, 300, 'bot-may'], [20, 190, 300, 200, 'bot-vet'], [230, 170, 170, 150, 'bot-cham'], [0, 0, 460, 360, 'bot-hat']] as const;

/** Kho chi tiết (Tài 07/10): every sticker of lib/canvas/stickers.json and the dust brush, for choosing and for checking them by eye. */
export default async function Page() {
  if (!adminEnabled()) notFound();
  try {
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    if (!principal.twoFactor) redirect('/gov');
  } catch (error) { if (error instanceof AdminError) redirect('/gov/login'); throw error; }
  const entries = Object.entries(STICKERS);
  return <main className={styles.shell}>
    <header className={styles.top}><div><Eyebrow><Link href="/gov">← Quản trị</Link> · Kho chi tiết</Eyebrow><h1>Kho chi tiết</h1>
      <p className={styles.muted}>{entries.length} hình trong <code>lib/canvas/stickers.json</code>, đổi màu theo quán, xoay (<code>r</code>), làm kiểu sáp màu (<code>grain</code>). Dùng trong trang: <code>{'{"t":"shape","shape":"<khoá>"}'}</code>.</p></div></header>
    <section style={{ display: 'grid', gap: 12 }}>
      <h2>Icon thương hiệu và biến thể</h2>
      <p className={styles.muted}>Màu thật · nét (theo màu chữ) · đặc · tròn/vuông. Nút Google chọn dấu bằng <code>{'"mark"'}</code>; link website luôn gạch chân.</p>
      {['#f6f2ea', '#1d1529'].map(bg => <div key={bg} style={{ display: 'flex', flexWrap: 'wrap', gap: 18, padding: 16, borderRadius: 16, background: bg, color: bg === '#1d1529' ? '#f1ece0' : '#1d1529' }}>
        {ICON_SHOW.map(icon => <div key={icon} style={{ display: 'grid', justifyItems: 'center', gap: 6, width: 78 }}>
          <div style={{ width: 34, height: 34 }}><CanvasIcon icon={icon} id={`kho-i-${bg.slice(1)}-${icon}`} /></div><code style={{ fontSize: 11, opacity: .75 }}>{icon}</code></div>)}
      </div>)}
    </section>
    {GROUPS.map(([group, title]) => <section key={group} style={{ display: 'grid', gap: 12 }}>
      <h2>{title}</h2>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {entries.filter(([, s]) => s.group === group).map(([key, s]) => <div key={key} data-sticker={key}
          style={{ background: '#1d1529', borderRadius: 16, padding: 14, display: 'grid', gap: 8, color: '#e9e3f5' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', height: 72 }}>
            {LOOKS.map((look, i) => <div key={i} style={{ width: 60, height: 60, rotate: `${look.r}deg` }}>
              <Shape shape={key as ShapeKey} fill={look.color} id={`kho-${key}-${i}`} w={60} grain={look.grain} /></div>)}
          </div>
          <strong>{s.name}</strong><code style={{ fontSize: 12, opacity: .7 }}>{key}</code>
        </div>)}
      </div>
    </section>)}
    <section style={{ display: 'grid', gap: 12 }}>
      <h2>Cọ bột phấn</h2>
      <p className={styles.muted}>Kho chỉ lưu thông số của cọ (<code>lib/canvas/brushes.json</code>): độ dày hạt, cỡ hạt, độ toả, độ cụm, lớp mờ. Màu là của quán. Mỗi ô: một lần chấm, rồi chồng nhiều lần chấm to nhỏ như lớp phấn.</p>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {Object.entries(BRUSHES).map(([key, brush]) => <div key={key} data-brush={key} style={{ background: '#1b1230', borderRadius: 16, padding: 14, display: 'grid', gap: 8, color: '#e9e3f5' }}>
          <div style={{ position: 'relative', height: 200, overflow: 'hidden', borderRadius: 10 }}>
            <div style={{ position: 'absolute', inset: '10px 40px', rotate: key === 'bot-vet' ? '-8deg' : undefined }}><Powder brush={key} color="#8f5ce6" id={`kho-${key}`} /></div></div>
          <strong>{brush.name}</strong><code style={{ fontSize: 12, opacity: .7 }}>{key}</code><span style={{ fontSize: 13, opacity: .8 }}>{brush.about}</span>
        </div>)}
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {[['#1b1230', ['#5b2fb0', '#7b45d6', '#9a63ee', '#6a3cc8', '#b48cff']], ['#1c1d15', ['#6e6633', '#b08f58', '#47421c', '#d2c6a4', '#8ea6c8']]].map(([bg, colors], k) =>
          <div key={k} style={{ position: 'relative', height: 360, overflow: 'hidden', borderRadius: 16, background: bg as string }}>
            {STAMPS.map(([x, y, w, h, brush], i) => <div key={i} style={{ position: 'absolute', left: x, top: y, width: w, height: h }}>
              <Powder brush={brush} color={(colors as string[])[i]} id={`kho-lop-${k}-${i}`} /></div>)}
          </div>)}
      </div>
    </section>
    <section style={{ display: 'grid', gap: 12 }}>
      <h2>Ánh sáng</h2>
      <p className={styles.muted}>Đặt với <code>{'"blend": "screen"'}</code>: chỉ làm sáng thêm, như đèn thật. Đèn ấm là <code>glow</code> màu của quán; cầu vồng sắc nét, mảnh, thêm <code>blur</code> khi muốn mờ.</p>
      <div style={{ position: 'relative', height: 420, overflow: 'hidden', borderRadius: 16, background: 'linear-gradient(160deg, #2a2622, #121110)' }}>
        <div style={{ position: 'absolute', left: -70, top: -70, width: 280, height: 280, mixBlendMode: 'screen' }}><Shape shape="glow" fill="#ff7a2e" id="kho-den-1" /></div>
        <div style={{ position: 'absolute', left: 20, top: 30, width: 300, height: 200, mixBlendMode: 'screen' }}><Shape shape="cau-vong" id="kho-den-3" /></div>
        <div style={{ position: 'absolute', left: 330, top: 60, width: 220, height: 300, mixBlendMode: 'screen', filter: 'blur(3px)' }}><Shape shape="cau-vong-xoan" id="kho-den-4" /></div>
        <div style={{ position: 'absolute', left: 560, top: 120, width: 200, height: 240, mixBlendMode: 'screen' }}><Shape shape="cau-vong-xoan" id="kho-den-6" /></div>
        <div style={{ position: 'absolute', left: 80, top: 270, width: 320, height: 12, rotate: '-10deg', mixBlendMode: 'screen' }}><Shape shape="vet-sang" fill="#ffffff" id="kho-den-5" /></div>
        <p style={{ position: 'absolute', left: 24, bottom: 20, color: '#f1ece0', opacity: .8, fontSize: 13 }}>glow (cam, screen) · cau-vong (sắc) · cau-vong-xoan (làm mờ / sắc) · vet-sang</p>
      </div>
    </section>
  </main>;
}

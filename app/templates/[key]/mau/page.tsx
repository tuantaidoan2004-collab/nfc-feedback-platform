import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { canvasTemplate } from '@/lib/canvas/templates';
import PageThumb from '@/components/canvas/thumb';
import '@/components/qs/qs.css';

/**
 * Bảng màu của một mẫu (kịch bản 9b): mọi phiên bản màu đánh số, mang sẵn tên quán (`?ten=`), để Admin Tài gửi một link qua
 * Zalo và khách chỉ cần trả lời một con số. Bấm một phiên bản là xem nó như trang thật.
 */
export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const template = canvasTemplate((await params).key);
  return template ? { title: `${template.name} · Bảng màu`, description: 'Chọn một màu cho trang của quán.' } : {};
}
export default async function Page({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ ten?: string }> }) {
  const template = canvasTemplate((await params).key), query = await searchParams;
  if (!template?.knobs) notFound();
  const name = typeof query.ten === 'string' ? query.ten.trim().slice(0, 60).replace(/[\u0000-\u001f<>]/g, '') : '';
  const href = (i: number, still = false) => `/templates/${template.key}?mau=${i + 1}${name ? `&ten=${encodeURIComponent(name)}` : ''}${still ? '&anh=1' : ''}`;
  return <div className="qs" data-theme="light" style={{ minHeight: '100dvh', padding: '28px 16px 40px', display: 'grid', gap: 22, alignContent: 'start', justifyItems: 'center' }}>
    <div style={{ textAlign: 'center', display: 'grid', gap: 6, maxWidth: 560 }}>
      <h1 style={{ fontSize: 'clamp(26px, 6vw, 40px)', letterSpacing: '-.04em' }}>{name || template.name} · chọn màu</h1>
      <p className="qs-muted">Mẫu “{template.name}”. Bạn thích màu nào, chỉ cần nhắn lại số đó. Bấm vào một màu để xem như trang thật.</p>
    </div>
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', width: 'min(900px, 100%)' }}>
      {template.knobs.palettes.map((palette, i) => <a key={palette.name} href={href(i)} style={{ display: 'grid', gap: 8, textDecoration: 'none' }} data-palette={i + 1}>
        <div style={{ aspectRatio: '9 / 16', borderRadius: 22, overflow: 'hidden', position: 'relative', boxShadow: 'var(--qs-shadow)', background: palette.colors[0] }}>
          <PageThumb src={href(i, true)} title={`Màu ${i + 1} · ${palette.name}`} />
          <span style={{ position: 'absolute', top: 10, left: 10, width: 34, height: 34, borderRadius: 999, display: 'grid', placeItems: 'center', fontWeight: 800,
            background: palette.colors[1], color: palette.colors[0], boxShadow: '0 2px 8px rgba(0,0,0,.2)' }}>{i + 1}</span></div>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ display: 'flex' }}>{palette.colors.map(c => <i key={c} style={{ width: 12, height: 12, borderRadius: 99, background: c, marginLeft: -3, border: '1px solid rgba(0,0,0,.12)' }} />)}</span>
          <strong>{i + 1}. {palette.name}</strong></span></a>)}
    </div>
  </div>;
}

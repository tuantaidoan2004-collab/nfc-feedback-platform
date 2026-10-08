/* eslint-disable @next/next/no-img-element -- page images are shop uploads (https, passed the image review) or files shipped with the app. */
/**
 * Vẽ một trang canvas (lib/canvas/doc.ts) — phần tĩnh vẽ ngay trên máy chủ, các phần cần chạm (nút Google, góp ý riêng, ngôn
 * ngữ, thẻ bài, wifi) là thành phần trình duyệt nhỏ trong live.tsx. Một trang khách nhận đúng HTML này: vị trí, cỡ chữ, hiệu
 * ứng vào đều là CSS (canvas.css), nên trang hiện đủ và đúng chỗ trước khi JavaScript kịp chạy.
 */
import { memo, type CSSProperties, type ReactNode } from 'react';
import { BRUSHES, type IconKey, type LinksEl, type Background, type El, type Kid, type Leaf, type PageDoc, type RowEl, type Section, type StackEl, type Words, type DeckEl, type Edge } from '@/lib/canvas/doc';
import { firstColor, paint } from '@/lib/canvas/paint';
import { walk } from '@/lib/canvas/validate';
import { FONT_STACK, fontVariables } from './fonts';
import Art from './art';
import Shape from './shapes';
import Powder from './powder';
import CanvasIcon from './icons';
import GuestCore, { LegalLine, type GuestMode } from '../guest/core';
import type { RenderBinding } from '@/lib/client/visit-fetch-transport';
import { Arrow, DeckCards, EventSpot, FlipCard, FlipMedia, SoundToggle, FeedbackPlane, GoogleButton, LangSwitch, LegalSpot, ScrollHint, SectionWatch, WifiButton } from './live';
import { WordsView } from './words';
import './canvas.css';

type Vars = CSSProperties & Record<`--${string}`, string | number | undefined>;
const deg = (n?: number) => n ? `${n}deg` : undefined;
const shadow = (s?: { x: number; y: number; blur: number; color: string }) => s ? `calc(${s.x} * var(--u)) calc(${s.y} * var(--u)) calc(${s.blur} * var(--u)) ${s.color}` : undefined;

function ArcText({ words, w, h, size, radius, color, font, weight, spacing, id }: { words: Words; w: number; h: number; size: number; radius: number; color: string;
  font: string; weight?: number; spacing?: number; id: string }) {
  const R = Math.abs(radius), up = radius > 0, half = Math.min(w / 2 - 2, R * .995), theta = Math.asin(half / R);
  const dx = R * Math.sin(theta), dy = R * Math.cos(theta), cx = w / 2;
  // Over a circle (text bowing up): baseline apex near the top. Under one (a smile): apex near the bottom.
  const d = up ? `M ${cx - dx} ${size * 1.05 + R - dy} A ${R} ${R} 0 0 1 ${cx + dx} ${size * 1.05 + R - dy}`
    : `M ${cx - dx} ${h - size * .3 - R + dy} A ${R} ${R} 0 0 0 ${cx + dx} ${h - size * .3 - R + dy}`;
  const line = (text: string, cls?: string) => <text className={cls} fill={color} fontSize={size} fontFamily={font} fontWeight={weight} letterSpacing={spacing ? `${spacing / 100}em` : undefined}>
    <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{text}</textPath></text>;
  return <svg className="cv-arc" viewBox={`0 0 ${w} ${h}`} aria-label={words.vi}><defs><path id={id} d={d} /></defs>
    {words.en?.trim() ? <>{line(words.vi, 'cv-vi')}{line(words.en, 'cv-en')}</> : line(words.vi)}</svg>;
}

export function Media({ src, fit = 'cover', focus, id, gray, top }: { src: string; fit?: 'cover' | 'contain'; focus?: [number, number]; id: string; gray?: boolean; top?: boolean }) {
  if (src.startsWith('art:')) return <div className={`cv-media ${gray ? 'cv-gray' : ''}`}><Art art={src.slice(4) as never} id={id} top={top} /></div>;
  const style = { objectFit: fit, objectPosition: focus ? `${focus[0]}% ${focus[1]}%` : undefined };
  // A shop's clip (an upload ending .mp4): plays silently on a loop wherever a picture could stand, as a poster video does.
  if (/\.mp4$/i.test(src)) return <video className={`cv-media ${gray ? 'cv-gray' : ''}`} src={src} autoPlay muted loop playsInline preload="metadata" style={style} />;
  return <img className={`cv-media ${gray ? 'cv-gray' : ''}`} src={src} alt="" loading="lazy" decoding="async" style={style} />;
}

const BackgroundView = memo(function BackgroundView({ bg, id, className, haze }: { bg: Background; id: string; className: string; haze?: boolean }) {
  // A picture shorter than its section: sharp at its own shape on top, the rest continued in a blurred copy (doc.ts `extend`).
  const extended = !haze && bg.src && bg.extend === 'blur' && <>
    <div className="cv-extend-blur"><Media src={bg.src} id={`${id}-blur`} gray={bg.gray} /></div>
    <div className="cv-extend-top"><Media src={bg.src} fit="contain" focus={[50, 0]} id={id} gray={bg.gray} top /></div></>;
  const picture = extended || bg.src && <div className={haze ? 'cv-haze' : undefined} style={haze ? undefined : { position: 'absolute', inset: 0, filter: bg.blur ? `blur(${bg.blur}px)` : undefined }}>
    <Media src={bg.src} fit={bg.fit} focus={bg.focus ?? (haze ? undefined : [50, 0])} id={haze ? `${id}-haze` : id} gray={bg.gray} top={!haze} /></div>;
  return <div className={className} style={{ background: bg.fill ? paint(bg.fill) : undefined }} aria-hidden="true">
    {picture}
    {!!bg.dim && <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${bg.dim})` }} />}
  </div>;
});
/** A section's picture inside the column, sharp and aligned to the design (its colour is drawn by the full-width layer). */
const ArtBackground = memo(function ArtBackground({ bg, id }: { bg: Background; id: string }) {
  return <BackgroundView bg={{ ...bg, fill: undefined, dim: bg.dim }} id={id} className="cv-art-bg" />;
});

const edgeStyle = (edge: Edge | undefined, fill: string | undefined): Vars => {
  if (!edge) return { background: fill };
  if (typeof edge.color === 'string') return { background: fill, border: `calc(${edge.w} * var(--u)) solid ${edge.color}` };
  // A gradient edge is drawn as a ring over the element (canvas.css `.cv-edge`), so a see-through fill (glass) never shows the gradient through it.
  return { background: fill, '--ew': edge.w, '--edge': paint(edge.color) } as Vars;
};

function LeafView({ el }: { el: Leaf | Extract<Kid, { t: Leaf['t'] }> }): ReactNode {
  const w = 'w' in el && el.w ? el.w : 0;
  switch (el.t) {
    case 'text': {
      const style: Vars = { '--fs': el.size, fontFamily: FONT_STACK[el.font], fontWeight: el.weight, color: el.color, textAlign: el.align ?? 'center',
        letterSpacing: el.spacing ? `${el.spacing / 100}em` : undefined, lineHeight: el.line, fontStyle: el.italic ? 'italic' : undefined,
        textTransform: el.caps ? 'uppercase' : undefined, textShadow: shadow(el.shadow), textDecoration: el.underline || el.slot === 'website' ? 'underline' : 'none',
        WebkitTextStroke: el.stroke ? `calc(${el.stroke.w} * var(--u)) ${el.stroke.color}` : undefined,
        alignItems: el.align === 'left' ? 'flex-start' : el.align === 'right' ? 'flex-end' : 'center' };
      if (el.disc) Object.assign(style, { borderRadius: '50%', ...edgeStyle(el.disc.edge, paint(el.disc.fill)) });
      if (el.paint) Object.assign(style, { backgroundImage: paint(el.paint), WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' });
      const body = el.arc ? <ArcText words={el.words} w={w || 300} h={el.h} size={el.size} radius={el.arc} color={el.color} font={FONT_STACK[el.font]} weight={el.weight}
        spacing={el.spacing} id={`arc-${el.id}`} /> : <span><WordsView words={el.words} colors={el.colors} /></span>;
      return el.link ? <a className="cv-text" style={style} href={el.link} target="_blank" rel="noopener noreferrer">{body}</a> : <div className="cv-text" style={style}>{body}</div>;
    }
    case 'image': {
      const frame = el.frame === 'polaroid' ? 'cv-polaroid' : el.frame === 'gilded' ? 'cv-gilded' : '';
      const inner = <div className={`cv-img cv-mask-${el.mask ?? 'none'}${el.edge && typeof el.edge.color !== 'string' ? ' cv-edge' : ''}`} style={{ '--radius': el.radius, ...edgeStyle(el.edge, undefined), boxShadow: frame ? undefined : shadow(el.shadow) } as Vars}>
        {el.flip ? <FlipMedia srcs={[el.src, ...el.flip]} fit={el.fit} focus={el.focus} gray={el.gray} /> : <Media src={el.src} fit={el.fit} focus={el.focus} id={el.id} gray={el.gray} />}</div>;
      const framed = frame ? <div className={`cv-img ${frame}`} style={{ boxShadow: shadow(el.shadow) }}>{inner}
        {el.caption && <span className="cv-caption"><WordsView words={el.caption} /></span>}</div> : inner;
      const turning = el.flip ? <FlipCard>{framed}</FlipCard> : framed;
      return el.link ? <a className="cv-icon-link" href={el.link} target="_blank" rel="noopener noreferrer">{turning}</a> : turning;
    }
    case 'shape': {
      if (el.shape === 'rect' || el.shape === 'circle' || el.shape === 'line') {
        const fill = el.fill ? paint(el.fill) : undefined, gradientEdge = el.edge && typeof el.edge.color !== 'string';
        const style: Vars = { '--radius': el.radius, '--blur': el.glass?.blur, boxShadow: shadow(el.shadow), ...edgeStyle(el.edge, el.glass ? el.glass.tint : fill) };
        if (el.blur) style.filter = `blur(calc(${el.blur} * var(--u)))`;
        return <div className={`cv-shape ${el.glass ? 'cv-glass' : ''} ${gradientEdge ? 'cv-edge' : ''}`} data-shape={el.shape} style={style} />;
      }
      if (BRUSHES[el.shape]) return <Powder brush={el.shape} color={el.fill ? firstColor(el.fill) : '#fff'} id={el.id} />;
      const drawn = <Shape shape={el.shape} fill={el.fill} stroke={el.edge && typeof el.edge.color === 'string' ? { w: el.edge.w, color: el.edge.color } : undefined} id={el.id}
        w={w || el.h} grain={el.grain} />;
      return el.blur ? <div className="cv-fill" style={{ filter: `blur(calc(${el.blur} * var(--u)))` }}>{drawn}</div> : drawn;
    }
    case 'icon': {
      const icon = <CanvasIcon icon={el.icon} color={el.color} id={el.id} />;
      return el.link ? <a className="cv-icon-link" href={el.link} target="_blank" rel="noopener noreferrer" aria-label={el.icon}>{icon}</a> : icon;
    }
    case 'button': {
      const style: Vars = { '--bg': el.bg ? paint(el.bg) : undefined, '--fg': el.fg, '--fs': el.size, '--fw': el.weight, '--ls': el.spacing ? `${el.spacing / 100}em` : undefined,
        '--edge': el.edge ? paint(el.edge.color) : undefined, '--ew': el.edge?.w, fontFamily: el.font ? FONT_STACK[el.font] : undefined, boxShadow: shadow(el.shadow), '--h': el.h };
      const content = <>
        {el.look === 'tag' && <span className="cv-tag"><WordsView words={el.tag ?? { vi: 'Click here' }} /></span>}
        {el.icon && el.look !== 'note' && <span className="cv-btn-icon"><CanvasIcon icon={el.icon} id={`${el.id}-i`} /></span>}
        <span className="cv-btn-label"><WordsView words={el.label} /></span>
        {el.icon && el.look === 'note' && <span className="cv-btn-icon" style={{ '--is': 18 } as Vars}><CanvasIcon icon={el.icon} id={`${el.id}-i`} /></span>}
        {(el.look === 'row') && <Arrow />}
        {el.look === 'tag' && <span className="cv-tag-cursor" aria-hidden="true"><CanvasIcon icon="cursor" id={`${el.id}-c`} /></span>}
      </>;
      if (el.wifi) return <WifiButton className={`cv-btn cv-btn-${el.look}`} style={style} wifi={el.wifi}>{content}</WifiButton>;
      const link = <a className={`cv-btn cv-btn-${el.look}${el.slot === 'website' ? ' cv-web' : ''}`} style={style} href={el.link} target={el.link?.startsWith('tel:') ? undefined : '_blank'} rel="noopener noreferrer">{content}</a>;
      if (el.look !== 'popout') return link;
      // uiverse.io dexter-st/itchy-wolverine-84 (MIT): the two cards and the four corner marks around the button.
      return <div className="cv-pop" style={{ '--pc': el.edge ? paint(el.edge.color) : undefined } as Vars}>
        {el.pop && <><span className="cv-pop-card cv-pop-up" aria-hidden="true"><WordsView words={el.pop[0]} /></span>
          <span className="cv-pop-card cv-pop-down" aria-hidden="true"><WordsView words={el.pop[1]} /></span></>}
        {link}
        {[0, 1, 2, 3].map(i => <svg key={i} className="cv-pop-corner" viewBox="-1 1 32 32" aria-hidden="true"><path d="M32,32C14.355,32,0,17.645,0,0h.985c0,17.102,13.913,31.015,31.015,31.015v.985Z" /></svg>)}
      </div>;
    }
    case 'google': return <GoogleButton el={el} />;
    case 'lang': return <LangSwitch el={el} />;
    case 'legal': return <LegalSpot el={el} />;
  }
}

const motionVars = (el: { motion?: { in?: string; at?: number } }): Vars => el.motion?.in ? { '--in': `cv-${el.motion.in}`, '--at': `${el.motion.at ?? 0}ms` } : {};
const motionClass = (el: { motion?: { in?: string } }) => el.motion?.in ? ' cv-in' : '';
const Loop = ({ el, children }: { el: { motion?: { loop?: string }; o?: number }; children: ReactNode }) =>
  <div className={`cv-fill${el.motion?.loop ? ` cv-loop-${el.motion.loop}` : ''}`} style={el.o !== undefined ? { '--o': el.o } as Vars : undefined}>{children}</div>;

function KidView({ kid, gap, mode, reveal, index }: { kid: Kid; gap: number; mode: GuestMode; reveal?: number; index: number }) {
  if (kid.hide) return null;
  // In a revealing stack a picture is there from the start: it is the ground the buttons push down (mẫu Dynamic movement).
  const appears = reveal && kid.t !== 'image';
  const base: Vars = { '--h': kid.h, '--gap': gap, ...(appears ? { '--at': `${300 + index * reveal}ms` } : {}) };
  if (kid.t === 'row') return <RowView row={kid} base={base} />;
  const style: Vars = { ...base, '--w': kid.w, '--r': deg(kid.r), ...(reveal ? {} : motionVars(kid)) };
  return <div className={`cv-kid${reveal ? '' : motionClass(kid)}`} data-w={kid.w ? '' : undefined} data-id={kid.id} data-stay={reveal && !appears ? '' : undefined} style={style}>
    <Loop el={kid}><LeafView el={kid} /></Loop></div>;
}
function RowView({ row, base }: { row: RowEl; base: Vars }) {
  return <div className="cv-kid cv-row" data-id={row.id} data-w={row.w ? '' : undefined} style={{ ...base, '--w': row.w, '--rgap': row.gap } as Vars}>
    {row.kids.filter(k => !k.hide).map(k => <div key={k.id} className={`cv-kid${motionClass(k)}`} data-w="" data-id={k.id} style={{ '--h': k.h, '--w': k.w, '--r': deg(k.r), ...motionVars(k) } as Vars}>
      <Loop el={k}><LeafView el={k} /></Loop></div>)}
  </div>;
}

function PanelView({ panel }: { panel?: StackEl['panel'] }) {
  if (!panel) return null;
  const fill = panel.glass ? panel.glass.tint : panel.fill ? paint(panel.fill) : undefined, gradientEdge = panel.edge && typeof panel.edge.color !== 'string';
  return <div className={`cv-panel ${panel.glass ? 'cv-glass' : ''} ${gradientEdge ? 'cv-edge' : ''}`}
    style={{ '--radius': panel.radius, '--blur': panel.glass?.blur, top: panel.top ? `calc(${panel.top} * var(--u))` : undefined, boxShadow: shadow(panel.shadow),
      ...edgeStyle(panel.edge, fill) } as Vars} aria-hidden="true" />;
}

const holdsGoogle = (el: El) => el.t === 'google' || ((el.t === 'stack' || el.t === 'deck') && (el.t === 'stack' ? el.kids : el.front.kids).some(k => k.t === 'google' || (k.t === 'row' && k.kids.some(c => c.t === 'google'))));

const ElementView = memo(function ElementView({ el, z, mode }: { el: El; z: number; mode: GuestMode }) {
  if (el.hide) return null;
  const top = holdsGoogle(el);
  // An event's sign is tapped, so it lies over the page's decoration (glitter, light) wherever it stands in the list; under the Google button.
  const box: Vars = { '--x': el.x, '--y': el.y, '--w': el.w, '--h': el.h, '--r': deg(el.r), zIndex: top ? undefined : el.t === 'event' ? 900 : z, ...motionVars(el),
    // Blending works against what lies under the element in the section, so it is set on the element's own box (doc.ts `blend`).
    mixBlendMode: el.t === 'shape' ? el.blend : undefined };
  const cls = `cv-el${motionClass(el)}${top ? ' cv-top' : ''}`;
  // The paper plane floats over the whole page, drawn once by the page (FeedbackPlane), never in a section's layout.
  if (el.t === 'feedback') return null;
  if (el.t === 'stack') return <div className={`${cls} cv-stack`} data-id={el.id} data-reveal={el.reveal ? '' : undefined}
    style={{ ...box, '--pad': el.pad ?? 0, '--align': el.align === 'start' ? 'flex-start' : el.align === 'end' ? 'flex-end' : el.align === 'stretch' ? 'stretch' : 'center' } as Vars}>
    <PanelView panel={el.panel} />
    {el.kids.map((kid, i) => <KidView key={kid.id} kid={kid} gap={el.gap} mode={mode} reveal={el.reveal} index={i} />)}
  </div>;
  if (el.t === 'deck') return <DeckView el={el} cls={cls} box={box} mode={mode} />;
  if (el.t === 'links') return <div className={cls} data-id={el.id} style={box}><LinksView el={el} /></div>;
  if (el.t === 'event') return <div className={cls} data-id={el.id} style={box}><Loop el={el}><EventSpot el={el} /></Loop></div>;
  return <div className={cls} data-id={el.id} style={box}><Loop el={el}><LeafView el={el} /></Loop></div>;
});

function DeckView({ el, cls, box, mode }: { el: DeckEl; cls: string; box: Vars; mode: GuestMode }) {
  return <div className={`${cls} cv-deck`} data-id={el.id} data-look={el.look} style={box}>
    <DeckCards cards={el.cards.filter(card => !card.hide)} />
    <div className="cv-front" style={{ '--pad': el.front.pad ?? 0, '--tilt': deg(el.front.tilt) } as Vars}>
      <PanelView panel={el.front.panel} />
      {el.front.kids.map((kid, i) => <KidView key={kid.id} kid={kid} gap={el.front.gap} mode={mode} index={i} />)}
    </div>
  </div>;
}

export const SectionView = memo(function SectionView({ section, index, mode }: { section: Section; index: number; mode: GuestMode }) {
  // The first section fills the first screen: its background runs to the bottom of the phone, whatever its height in units.
  return <section className="cv-sec" data-section={section.id} data-wait={index > 0 ? '' : undefined} data-first={index === 0 ? '' : undefined} aria-label={section.name}>
    {section.bg && <BackgroundView bg={section.bg} id={`bg-${section.id}`} className="cv-sec-bg" haze={!!section.bg.src} />}
    <div className="cv-col"><div className="cv-art" style={{ '--sec-h': section.h } as Vars}>
      {section.bg?.src && <ArtBackground bg={section.bg} id={`art-${section.id}`} />}
      {section.els.map((el, i) => <ElementView key={el.id} el={el} z={i + 1} mode={mode} />)}
    </div></div>
  </section>;
});

/** The colour the page continues in below its last section (under the footer line): that section's own, or near-black under a picture. */
function pageColor(doc: PageDoc) {
  const last = doc.sections[doc.sections.length - 1]?.bg?.fill ?? doc.backdrop?.fill;
  return !last ? '#0b0b0c' : typeof last === 'string' ? last : last.stops[last.stops.length - 1][0];
}
/** Light or dark under the platform's footer line. */
function footerTone(doc: PageDoc): 'light' | 'dark' {
  const color = pageColor(doc);
  const hex = color.length === 4 ? color.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : color.slice(0, 7);
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return .2126 * r + .7152 * g + .0722 * b > .6 ? 'dark' : 'light';
}

type PageProps = { doc: PageDoc; mode: GuestMode; slug: string; googleUrl: string | null; render?: RenderBinding;
  /** What stands between the first section and the rest: the shop's events (khúc B, kịch bản mục 8). */
  afterFirst?: ReactNode };
export default function CanvasPage({ doc, mode, slug, googleUrl, render, afterFirst }: PageProps) {
  const all = [...walk(doc)];
  const legal = all.some(el => el.t === 'legal'), lang = all.some(el => el.t === 'lang');
  const plane = doc.sections.flatMap(s => s.els).find((el): el is Extract<El, { t: 'feedback' }> => el.t === 'feedback' && !el.hide);
  return <GuestCore mode={mode} slug={slug} render={render} googleUrl={googleUrl} thanksSeconds={doc.fx?.thanks ?? 0} layout="canvas"
    className={fontVariables}
    style={{ background: doc.backdrop ? 'transparent' : pageColor(doc) }}>
    {doc.fonts && <style>{[doc.fonts.chinh && `@font-face{font-family:'cv-rieng-chinh';src:url("${doc.fonts.chinh}");font-display:swap}`,
      doc.fonts.dacBiet && `@font-face{font-family:'cv-rieng-dac-biet';src:url("${doc.fonts.dacBiet}");font-display:swap}`].filter(Boolean).join('')}</style>}
    {doc.sound && mode !== 'still' && <SoundToggle src={doc.sound.src} volume={doc.sound.volume ?? .6} />}
    {doc.backdrop && <BackgroundView bg={doc.backdrop} id="backdrop" className="cv-backdrop" />}
    {doc.band && <div className="cv-band-layer" aria-hidden="true"><div className="cv-col"><div className="cv-band-u">
      <div className="cv-band" style={{ '--x': doc.band.x, '--w': doc.band.w, background: paint(doc.band.fill),
        backdropFilter: doc.band.blur ? `blur(${doc.band.blur}px)` : undefined, WebkitBackdropFilter: doc.band.blur ? `blur(${doc.band.blur}px)` : undefined } as Vars} /></div></div></div>}
    {doc.sections.map((section, index) => <div key={section.id} style={{ display: 'contents' }}>
      <SectionView section={section} index={index} mode={mode} />
      {index === 0 && afterFirst}
    </div>)}
    {!legal && <footer className="cv-footer" data-tone={footerTone(doc)}><LegalLine withLanguage={!lang} /></footer>}
    {/* Room for the paper plane at the foot of the page, so it never lies over the last of the page (canvas.css `.cv-floor`). */}
    <div className="cv-floor" aria-hidden="true" />
    {plane && <FeedbackPlane el={plane} />}
    {doc.fx?.hint && doc.sections.length > 1 && mode !== 'still' && <ScrollHint after={doc.fx.hint} />}
    <SectionWatch />
  </GuestCore>;
}

/** Các nút của quán (doc.ts LinksEl): one per link the shop has, in its brand mark or a line in the page's colour. */
const LINK_MARKS: Record<string, [IconKey, IconKey, string]> = {
  zalo: ['zalo-oa', 'zalo-net', 'Zalo'], facebook: ['facebook', 'facebook-net', 'Facebook'], instagram: ['instagram', 'instagram-net', 'Instagram'],
  tiktok: ['tiktok', 'tiktok-net', 'TikTok'], youtube: ['youtube', 'youtube-net', 'YouTube'], website: ['web', 'globe', 'Website'], menu: ['menu', 'menu', 'Menu'],
  booking: ['calendar', 'calendar', 'Đặt chỗ'], maps: ['maps', 'maps-net', 'Chỉ đường'], email: ['mail', 'mail', 'Email'], phone: ['phone', 'phone', 'Gọi'],
};
function LinksView({ el }: { el: LinksEl }) {
  const style: Vars = { '--lg': el.gap ?? 14, '--ls': el.size ?? 26, color: el.color, '--lbg': el.bg ? paint(el.bg) : undefined };
  return <div className={`cv-links cv-links-${el.look}`} data-style={el.style ?? 'mau'} style={style}>
    {(el.items ?? []).map(item => { const [brand, thin, name] = LINK_MARKS[item.slot]; const label = item.label ?? name;
      return <a key={item.slot} className={item.slot === 'website' ? 'cv-web' : undefined} href={item.url} target={/^(tel|mailto):/.test(item.url) ? undefined : '_blank'}
        rel="noopener noreferrer" aria-label={label} data-slot={item.slot}>
        <span className="cv-links-mark"><CanvasIcon icon={el.style === 'net' || el.style === 'dac' ? thin : brand} id={`${el.id}-${item.slot}`} /></span>
        {el.look !== 'icons' && <span className="cv-btn-label">{label}</span>}{el.look === 'rows' && <Arrow />}</a>; })}
  </div>;
}

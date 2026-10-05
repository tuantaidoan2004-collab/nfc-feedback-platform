'use client';
/**
 * Các bảng của trình sửa trang: thuộc tính phần tử đang chọn, khúc, trang, và kho phần tử để thêm. Mọi thay đổi đi qua `set`
 * của trình sửa (lịch sử hoàn tác, tự lưu); không bảng nào tự gọi máy chủ.
 */
import type { ReactNode } from 'react';
import { ARTS, BUTTON_LOOKS, DECK_LOOKS, FONTS, GOOGLE_LOOKS, ICONS, MOTIONS_IN, MOTIONS_LOOP, SHAPES, type ArtKey, type DeckCard, type El, type FontKey,
  type IconKey, type Kid, type PageDoc, type Section, type ShapeKey, type StackEl } from '@/lib/canvas/doc';
import { targetOf, type AnyEl, type Located } from '@/lib/canvas/edit';
import Art from '../art';
import CanvasIcon from '../icons';
import Icon from '@/components/qs/icons';
import { ColorField, Field, FillField, LinkField, NumberField, Segmented, SelectField, TextField, Toggle, WordsField } from './fields';
import { UploadButton } from './upload';
import styles from './editor.module.css';

export const KIND: Record<AnyEl['t'], string> = { text: 'Chữ', image: 'Ảnh', shape: 'Hình', icon: 'Biểu tượng', button: 'Nút link', google: 'Nút Google',
  feedback: 'Góp ý riêng', lang: 'Ngôn ngữ', legal: 'Dòng pháp lý', stack: 'Chồng', deck: 'Thẻ bài', row: 'Hàng' };
export function nameOf(el: AnyEl): string {
  if ('name' in el && el.name) return el.name;
  if (el.t === 'text') return el.words.vi.split('\n')[0].slice(0, 32) || KIND.text;
  if (el.t === 'button') return el.label.vi.slice(0, 32);
  return KIND[el.t];
}
const FONT_NAMES: Record<FontKey, string> = { sans: 'Không chân (Sans)', display: 'Tiêu đề (Display)', serif: 'Có chân (Serif)', script: 'Viết tay mềm (Script)',
  hand: 'Viết tay (Hand)', rounded: 'Tròn (Rounded)', slab: 'Chân vuông (Slab)', brush: 'Nét cọ (Brush)' };
const LOOK_NAMES: Record<typeof BUTTON_LOOKS[number], string> = { pill: 'Viên thuốc', ring: 'Viền màu', outline: 'Viền', soft: 'Mềm', gradient: 'Chuyển màu', tail: 'Có đuôi',
  link: 'Link gạch chân', box: 'Hộp', tag: 'Nhãn "Click here"', note: 'Mảnh giấy', glow: 'Phát sáng', text: 'Chỉ chữ' };
const GOOGLE_NAMES: Record<typeof GOOGLE_LOOKS[number], string> = { maps: 'Ghim bản đồ', g: 'Chữ G tròn', ring: 'Vòng chữ xoay', glass: 'Kính + bàn tay' };
const SHAPE_NAMES: Record<ShapeKey, string> = { rect: 'Chữ nhật', circle: 'Tròn', line: 'Đường kẻ', burst: 'Sao nổ', sparkle: 'Lấp lánh', plus: 'Dấu cộng', heart: 'Trái tim',
  arrow: 'Mũi tên vẽ tay', ribbon: 'Ruy băng', flare: 'Tia sáng', 'pin-line': 'Đường chấm', wave: 'Sóng', dots: 'Chấm', checker: 'Ca rô', squiggle: 'Nét lượn', glow: 'Quầng sáng' };
const IN_NAMES: Record<typeof MOTIONS_IN[number], string> = { fade: 'Hiện dần', rise: 'Trồi lên', drop: 'Rơi xuống', pop: 'Bật ra', left: 'Lướt từ trái', right: 'Lướt từ phải',
  zoom: 'Thu vào', blur: 'Mờ sang rõ' };
const LOOP_NAMES: Record<typeof MOTIONS_LOOP[number], string> = { float: 'Lơ lửng', sway: 'Đung đưa', pulse: 'Nhịp đập', twinkle: 'Lấp lánh', spin: 'Xoay tròn',
  shine: 'Loé sáng', bob: 'Nhún nhẹ', glow: 'Toả sáng' };
const ALIGN = [['left', 'Trái'], ['center', 'Giữa'], ['right', 'Phải']] as const;
const WEIGHTS = [['300', 'Mảnh'], ['400', 'Thường'], ['600', 'Đậm vừa'], ['700', 'Đậm'], ['800', 'Rất đậm'], ['900', 'Đen']] as const;

/** Drops one optional field (validate.ts refuses a key holding `undefined` only by accident; leaving it out is cleaner). */
function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> { const copy = { ...value }; delete copy[key]; return copy; }

export function IconPicker({ value, onChange }: { value?: IconKey; onChange: (icon: IconKey) => void }) {
  return <div className={styles.picks}>{ICONS.map(icon => <button key={icon} type="button" title={icon} aria-label={icon} aria-pressed={value === icon} onClick={() => onChange(icon)}>
    <CanvasIcon icon={icon} id={`pick-${icon}`} /></button>)}</div>;
}
export function ArtPicker({ value, onChange }: { value?: string; onChange: (src: ArtKey) => void }) {
  return <div className={styles.arts}>{ARTS.map(art => <button key={art} type="button" aria-label={art} aria-pressed={value === `art:${art}`} onClick={() => onChange(art)}>
    <div><Art art={art} id={`pick-${art}`} /></div></button>)}</div>;
}

type ElementProps = {
  found: Located;
  set: (el: AnyEl, key?: string) => void;
  remove: () => void; duplicate: () => void; layer: (to: 'forward' | 'backward' | 'front' | 'back') => void;
  select: (id: string) => void; addKid: (containerId: string, kind: 'button' | 'text') => void;
  uploads: boolean;
};

export function ElementPanel({ found, set, remove, duplicate, layer, select, addKid, uploads }: ElementProps) {
  const el = targetOf(found), inside = found.kid ? found.top : null;
  const k = (field: string) => `${el.id}:${field}`;
  // One change, recorded under its field so typing a word is one step of undo, not one per letter.
  const up = (change: object, field: string) => set({ ...el, ...change } as AnyEl, k(field));
  const swap = (next: AnyEl, field: string) => set(next, k(field));
  return <div className={styles.pane}>
    <div>{nameOf(el) !== KIND[el.t] && <><span className={styles.kind}>{KIND[el.t]}</span> </>}<strong style={{ fontSize: 15 }}>{nameOf(el)}</strong></div>
    {inside && <button type="button" className={styles.chip} onClick={() => select(inside.id)}><Icon name="layers" size={16} />Chọn cả {KIND[inside.t].toLowerCase()} chứa nó</button>}
    {el.t === 'text' && <>
      <WordsField label="Chữ" value={el.words} onChange={words => up({ words }, 'words')} />
      <SelectField label="Phông chữ" value={el.font} options={FONTS.map(f => [f, FONT_NAMES[f]] as const)} onChange={font => up({ font }, 'font')} />
      <div className={styles.row2}>
        <NumberField label="Cỡ chữ" value={el.size} min={4} max={240} onChange={size => up({ size }, 'size')} />
        <SelectField label="Độ đậm" value={String(el.weight ?? 400) as typeof WEIGHTS[number][0]} options={WEIGHTS} onChange={w => up({ weight: Number(w) }, 'weight')} />
      </div>
      <ColorField label="Màu chữ" value={el.color} onChange={color => up({ color }, 'color')} />
      <Segmented label="Căn chữ" value={el.align ?? 'center'} options={ALIGN} onChange={align => up({ align }, 'align')} />
      <Toggle label="In hoa" checked={!!el.caps} onChange={caps => swap(caps ? { ...el, caps } : without(el, 'caps') as AnyEl, 'caps')} />
      <Toggle label="Nghiêng" checked={!!el.italic} onChange={italic => swap(italic ? { ...el, italic } : without(el, 'italic') as AnyEl, 'italic')} />
      <OptionalLink value={el.link} onChange={link => swap(link ? { ...el, link } : without(el, 'link') as AnyEl, 'link')} />
    </>}
    {el.t === 'button' && <>
      <WordsField label="Chữ trên nút" value={el.label} max={120} lines={1} onChange={label => up({ label }, 'label')} />
      <Segmented label="Nút dẫn tới" value={el.wifi ? 'wifi' : 'link'} options={[['link', 'Một link'], ['wifi', 'Wifi của quán']] as const}
        onChange={to => swap(to === 'wifi' ? { ...without(el, 'link'), wifi: el.wifi ?? { name: 'Tên wifi' } } as AnyEl : { ...without(el, 'wifi'), link: el.link ?? 'https://example.com' } as AnyEl, 'to')} />
      {el.wifi ? <>
        <TextField label="Tên wifi" value={el.wifi.name} max={64} onChange={name => up({ wifi: { ...el.wifi!, name } }, 'wifi')} />
        <TextField label="Mật khẩu wifi" value={el.wifi.pass ?? ''} max={64} required={false}
          onChange={pass => up({ wifi: pass ? { ...el.wifi!, pass } : { name: el.wifi!.name } }, 'wifi')} />
      </> : <LinkField value={el.link ?? ''} onChange={link => up({ link }, 'link')}
        hint={el.link === 'https://example.com' ? 'Dán link của quán vào đây (Facebook, Zalo, menu…).' : 'Link mạng xã hội, menu, đặt bàn… hoặc số điện thoại.'} />}
      <SelectField label="Kiểu nút" value={el.look} options={BUTTON_LOOKS.map(l => [l, LOOK_NAMES[l]] as const)} onChange={look => up({ look }, 'look')} />
      <Field label="Biểu tượng trên nút">
        <div className={styles.actions}><button type="button" className={styles.chip} disabled={!el.icon} onClick={() => swap(without(el, 'icon') as AnyEl, 'icon')}>Không có</button></div>
        <IconPicker value={el.icon} onChange={icon => up({ icon }, 'icon')} />
      </Field>
      <FillField label="Màu nút" value={el.bg} onChange={bg => up({ bg }, 'bg')} />
      <ColorField label="Màu chữ" value={el.fg ?? '#111111'} onChange={fg => up({ fg }, 'fg')} />
      <NumberField label="Cỡ chữ" value={el.size ?? 15} min={6} max={60} onChange={size => up({ size }, 'size')} />
    </>}
    {el.t === 'image' && <>
      <Field label="Ảnh" hint={uploads ? 'Ảnh của quán, hoặc một tranh có sẵn. Ảnh tải lên phải được duyệt mới phát hành được.' : undefined}>
        <UploadButton value={el.src} onChange={src => up({ src }, 'src')} />
        <ArtPicker value={el.src} onChange={art => up({ src: `art:${art}` }, 'src')} />
      </Field>
      <SelectField label="Khung hình" value={el.mask ?? 'none'} options={[['none', 'Chữ nhật'], ['circle', 'Tròn'], ['arch', 'Vòm'], ['clover', 'Cỏ bốn lá'], ['blob', 'Giọt nước']] as const}
        onChange={mask => up({ mask }, 'mask')} />
      <NumberField label="Bo góc" value={el.radius ?? 0} min={0} max={400} onChange={radius => up({ radius }, 'radius')} />
      <Toggle label="Đen trắng" checked={!!el.gray} onChange={gray => swap(gray ? { ...el, gray } : without(el, 'gray') as AnyEl, 'gray')} />
      <OptionalLink value={el.link} onChange={link => swap(link ? { ...el, link } : without(el, 'link') as AnyEl, 'link')} />
    </>}
    {el.t === 'shape' && <>
      <SelectField label="Hình" value={el.shape} options={SHAPES.map(s => [s, SHAPE_NAMES[s]] as const)} onChange={shape => up({ shape }, 'shape')} />
      <FillField label="Màu" value={el.fill} onChange={fill => up({ fill }, 'fill')} />
      {(el.shape === 'rect' || el.shape === 'line') && <NumberField label="Bo góc" value={el.radius ?? 0} min={0} max={400} onChange={radius => up({ radius }, 'radius')} />}
      <Toggle label="Kính mờ (thấy nền phía sau)" checked={!!el.glass}
        onChange={on => swap(on ? { ...el, glass: { blur: 14, tint: '#ffffff33' } } : without(el, 'glass') as AnyEl, 'glass')} />
    </>}
    {el.t === 'icon' && <>
      <Field label="Biểu tượng"><IconPicker value={el.icon} onChange={icon => up({ icon }, 'icon')} /></Field>
      <ColorField label="Màu (biểu tượng nét)" value={el.color ?? '#111111'} onChange={color => up({ color }, 'color')} />
      <OptionalLink value={el.link} onChange={link => swap(link ? { ...el, link } : without(el, 'link') as AnyEl, 'link')} />
    </>}
    {el.t === 'google' && <>
      <div className={styles.info}><Icon name="info" size={18} /><span>Chữ và link của nút do nền tảng giữ: mọi khách thấy cùng một nút, bấm là mở trang đánh giá Google của
        quán (từ Place ID). Nút luôn nằm trên cùng và trong <b>màn hình đầu</b> — trên vạch cam ở khúc đầu tiên.</span></div>
      <SelectField label="Kiểu nút" value={el.look} options={GOOGLE_LOOKS.map(l => [l, GOOGLE_NAMES[l]] as const)} onChange={look => up({ look }, 'look')} />
      {el.look !== 'ring' && <FillField label="Màu nút" value={el.bg} onChange={bg => up({ bg }, 'bg')} />}
      <ColorField label={el.look === 'ring' ? 'Màu vòng chữ' : 'Màu chữ'} value={(el.look === 'ring' ? el.ring : el.fg) ?? (el.look === 'ring' ? '#ffffff' : '#1f1f1f')}
        onChange={color => up(el.look === 'ring' ? { ring: color } : { fg: color }, 'fg')} />
    </>}
    {el.t === 'feedback' && <>
      <div className={styles.info}><Icon name="info" size={18} /><span>Máy bay giấy mở thẻ góp ý riêng cho quản lý — giống hệt trên mọi trang, luôn nổi ở góc trái
        dưới màn hình của khách và tự lùi khi đè lên nút Google. Trang chỉ chọn hình và màu.</span></div>
      <Segmented label="Hình" value={el.icon} options={[['plane', 'Máy bay giấy'], ['chat', 'Bong bóng'], ['mail', 'Phong bì']] as const} onChange={icon => up({ icon }, 'icon')} />
      <ColorField label="Màu" value={el.color} onChange={color => up({ color }, 'color')} />
      <ColorField label="Màu viền" value={el.edge} onChange={edge => up({ edge }, 'edge')} />
    </>}
    {el.t === 'lang' && <>
      <Segmented label="Kiểu" value={el.look} options={[['select', 'Danh sách'], ['chip', 'Một nút']] as const} onChange={look => up({ look }, 'look')} />
      <ColorField label="Màu chữ" value={el.color} onChange={color => up({ color }, 'color')} />
    </>}
    {el.t === 'legal' && <ColorField label="Màu chữ" value={el.color} onChange={color => up({ color }, 'color')} />}
    {el.t === 'stack' && <StackFields el={el} up={up} swap={swap} select={select} addKid={addKid} />}
    {el.t === 'deck' && <DeckFields cards={el.cards} look={el.look} onCards={cards => up({ cards }, 'cards')} onLook={look => up({ look }, 'look')} />}
    {el.t === 'deck' && <KidList kids={el.front.kids} select={select} add={kind => addKid(el.id, kind)} />}
    {el.t === 'row' && <>
      <NumberField label="Khoảng cách giữa các nút" value={el.gap} min={0} max={200} onChange={gap => up({ gap }, 'gap')} />
      <div className={styles.list}>{el.kids.map(kid => <div key={kid.id}><button type="button" onClick={() => select(kid.id)}>{nameOf(kid)}</button><span className={styles.kind}>{KIND[kid.t]}</span></div>)}</div>
    </>}
    <div className={styles.divider} />
    {found.kid ? <KidBox el={el} up={up} swap={swap} inRow={!!found.rowKid} /> : <BoxFields el={found.top} up={up} swap={swap} />}
    <div className={styles.actions}>
      {!found.rowKid && <button type="button" className={styles.chip} onClick={duplicate}><Icon name="copy" size={16} />Nhân đôi</button>}
      {!found.rowKid && <button type="button" className={styles.chip} onClick={() => layer('backward')} title={found.kid ? 'Lên trong chồng' : 'Xuống một lớp'}>
        <Icon name={found.kid ? 'up' : 'down'} size={16} />{found.kid ? 'Lên' : 'Xuống lớp'}</button>}
      {!found.rowKid && <button type="button" className={styles.chip} onClick={() => layer('forward')} title={found.kid ? 'Xuống trong chồng' : 'Lên một lớp'}>
        <Icon name={found.kid ? 'down' : 'up'} size={16} />{found.kid ? 'Xuống' : 'Lên lớp'}</button>}
      <button type="button" className={styles.chip} data-danger onClick={remove}><Icon name="trash" size={16} />Xoá</button>
    </div>
  </div>;
}

function OptionalLink({ value, onChange }: { value?: string; onChange: (link: string | null) => void }) {
  return <>
    <Toggle label="Bấm vào thì mở link" checked={value !== undefined} onChange={on => onChange(on ? 'https://example.com' : null)} />
    {value !== undefined && <LinkField value={value} onChange={onChange} />}
  </>;
}

type Up = (change: object, field: string) => void;
type Swap = (next: AnyEl, field: string) => void;

/** Where a top-level element sits, how it turns, fades and moves in. */
function BoxFields({ el, up, swap }: { el: El; up: Up; swap: Swap }) {
  const auto = el.t === 'stack' || el.t === 'deck';
  return <>
    <div className={styles.row4}>
      <NumberField label="X" value={el.x} min={-800} max={3000} onChange={x => up({ x }, 'x')} />
      <NumberField label="Y" value={el.y} min={-800} max={2800} onChange={y => up({ y }, 'y')} />
      <NumberField label="Rộng" value={el.w} min={1} max={3000} onChange={w => up({ w }, 'w')} />
      {!auto && <NumberField label="Cao" value={el.h} min={1} max={3000} onChange={h => up({ h }, 'h')} />}
    </div>
    <div className={styles.row2}>
      <NumberField label="Xoay (độ)" value={el.r ?? 0} min={-360} max={360} onChange={r => swap(r ? { ...el, r } : without(el, 'r') as AnyEl, 'r')} />
      <NumberField label="Độ rõ (0–1)" value={el.o ?? 1} min={0} max={1} step={0.05} onChange={o => swap(o < 1 ? { ...el, o } : without(el, 'o') as AnyEl, 'o')} />
    </div>
    <Motion el={el} swap={swap} />
    <Toggle label="Ẩn khỏi trang" checked={!!el.hide} onChange={hide => swap(hide ? { ...el, hide } : without(el, 'hide') as AnyEl, 'hide')} />
    <Toggle label="Khoá vị trí" checked={!!el.lock} onChange={lock => swap(lock ? { ...el, lock } : without(el, 'lock') as AnyEl, 'lock')} />
  </>;
}
/** A child's size inside its stack (its place is the stack's to decide). */
function KidBox({ el, up, swap, inRow }: { el: AnyEl; up: Up; swap: Swap; inRow: boolean }) {
  const own = el as AnyEl & { w?: number; h: number; hide?: boolean };
  return <>
    <div className={styles.row2}>
      <NumberField label="Cao" value={own.h} min={1} max={1000} onChange={h => up({ h }, 'h')} />
      {own.w !== undefined && <NumberField label="Rộng" value={own.w} min={1} max={390} onChange={w => up({ w }, 'w')} />}
    </div>
    {!inRow && <Toggle label="Rộng bằng khối chứa nó" checked={own.w === undefined}
      onChange={full => swap(full ? without(own, 'w') as AnyEl : { ...own, w: 240 } as AnyEl, 'w')} />}
    {el.t !== 'row' && <Motion el={own as El} swap={swap} />}
    <Toggle label="Ẩn khỏi trang" checked={!!own.hide} onChange={hide => swap(hide ? { ...own, hide } : without(own, 'hide') as AnyEl, 'hide')} />
  </>;
}
function Motion({ el, swap }: { el: { motion?: { in?: typeof MOTIONS_IN[number]; at?: number; loop?: typeof MOTIONS_LOOP[number] } } & AnyEl; swap: Swap }) {
  const motion = el.motion ?? {};
  const write = (next: typeof motion) => { const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)); swap(Object.keys(clean).length ? { ...el, motion: clean } as AnyEl : without(el, 'motion') as AnyEl, 'motion'); };
  return <div className={styles.row2}>
    <SelectField label="Hiệu ứng vào" value={motion.in ?? 'none'} options={[['none', 'Không'], ...MOTIONS_IN.map(m => [m, IN_NAMES[m]] as const)] as const}
      onChange={value => write({ ...motion, in: value === 'none' ? undefined : value as typeof MOTIONS_IN[number] })} />
    <SelectField label="Chuyển động lặp" value={motion.loop ?? 'none'} options={[['none', 'Không'], ...MOTIONS_LOOP.map(m => [m, LOOP_NAMES[m]] as const)] as const}
      onChange={value => write({ ...motion, loop: value === 'none' ? undefined : value as typeof MOTIONS_LOOP[number] })} />
  </div>;
}

function KidList({ kids, select, add }: { kids: Kid[]; select: (id: string) => void; add: (kind: 'button' | 'text') => void }) {
  return <Field label="Bên trong">
    <div className={styles.list}>{kids.map(kid => <div key={kid.id} data-hidden={kid.hide || undefined}>
      <button type="button" onClick={() => select(kid.id)}>{nameOf(kid)}</button><span className={styles.kind}>{KIND[kid.t]}</span></div>)}</div>
    <div className={styles.actions}>
      <button type="button" className={styles.chip} onClick={() => add('button')}><Icon name="plus" size={16} />Nút link</button>
      <button type="button" className={styles.chip} onClick={() => add('text')}><Icon name="plus" size={16} />Chữ</button>
    </div>
  </Field>;
}

function StackFields({ el, up, swap, select, addKid }: { el: StackEl; up: Up; swap: Swap; select: (id: string) => void; addKid: ElementProps['addKid'] }) {
  return <>
    <div className={styles.info}><Icon name="info" size={18} /><span>Chồng tự xếp các phần tử bên trong theo chiều dọc: thêm, bớt nút không phải kéo tay.</span></div>
    <div className={styles.row2}>
      <NumberField label="Khoảng cách" value={el.gap} min={0} max={200} onChange={gap => up({ gap }, 'gap')} />
      <NumberField label="Lề trong" value={el.pad ?? 0} min={0} max={120} onChange={pad => up({ pad }, 'pad')} />
    </div>
    <Segmented label="Căn" value={el.align ?? 'center'} options={[['start', 'Trái'], ['center', 'Giữa'], ['end', 'Phải'], ['stretch', 'Giãn']] as const}
      onChange={align => up({ align }, 'align')} />
    <Toggle label="Có tấm nền" checked={!!el.panel} onChange={on => swap(on ? { ...el, panel: { fill: '#ffffff', radius: 24 } } : without(el, 'panel') as AnyEl, 'panel')} />
    {el.panel && <>
      <FillField label="Màu tấm nền" value={el.panel.glass ? el.panel.glass.tint : el.panel.fill} onChange={fill => up({ panel: { ...without(el.panel!, 'glass'), fill } }, 'panel')} />
      <NumberField label="Bo góc tấm nền" value={el.panel.radius ?? 0} min={0} max={400} onChange={radius => up({ panel: { ...el.panel, radius } }, 'panel-radius')} />
    </>}
    <Toggle label="Hiện lần lượt từng nút" checked={!!el.reveal} onChange={on => swap(on ? { ...el, reveal: 600 } : without(el, 'reveal') as AnyEl, 'reveal')} />
    <KidList kids={el.kids} select={select} add={kind => addKid(el.id, kind)} />
  </>;
}

function DeckFields({ cards, look, onCards, onLook }: { cards: DeckCard[]; look: typeof DECK_LOOKS[number]; onCards: (cards: DeckCard[]) => void; onLook: (look: typeof DECK_LOOKS[number]) => void }) {
  const card = (i: number, change: Partial<DeckCard>) => onCards(cards.map((c, j) => j === i ? { ...c, ...change } : c));
  return <>
    <div className={styles.info}><Icon name="info" size={18} /><span>Thẻ nằm sau tấm chính: bấm lần đầu rút thẻ ra, bấm lần nữa mới mở link. Tối đa 4 thẻ.</span></div>
    <SelectField label="Phong cách" value={look} options={[['party', 'Party'], ['racing', 'Đua xe'], ['nails', 'Nail'], ['pho', 'Phở, bún bò']] as const} onChange={onLook} />
    {cards.map((c, i) => <Field key={i} label={`Thẻ ${i + 1}`}>
      <WordsField label="Chữ trên thẻ" value={c.label} max={40} lines={1} onChange={label => card(i, { label })} />
      <LinkField value={c.link} onChange={link => card(i, { link })} />
      <ColorField label="Màu thẻ" value={typeof c.fill === 'string' ? c.fill : c.fill.stops[0][0]} swatches={false} onChange={fill => card(i, { fill })} />
      <IconPicker value={c.icon} onChange={icon => card(i, { icon })} />
      <div className={styles.actions}><button type="button" className={styles.chip} data-danger onClick={() => onCards(cards.filter((_, j) => j !== i))}><Icon name="trash" size={16} />Bỏ thẻ này</button></div>
    </Field>)}
    <button type="button" className={styles.chip} disabled={cards.length >= 4}
      onClick={() => onCards([...cards, { icon: 'instagram', label: { vi: 'Instagram' }, link: 'https://instagram.com', fill: '#ff5a8a', fg: '#ffffff' }])}>
      <Icon name="plus" size={16} />Thêm thẻ</button>
  </>;
}

/** One section: its name, height, background, place in the page, and its layers (top first; tap to select, eye to hide). */
export function SectionPanel({ doc, index, set, move, remove, add, select, toggle, selected }: {
  doc: PageDoc; index: number; set: (section: Section, key: string) => void; move: (by: -1 | 1) => void; remove: () => void; add: () => void;
  select: (id: string) => void; toggle: (id: string) => void; selected: string | null }) {
  const section = doc.sections[index], bg = section.bg ?? {};
  const up = (change: Partial<Section>, field: string) => set({ ...section, ...change }, `section:${section.id}:${field}`);
  const upBg = (change: object, field: string) => up({ bg: { ...bg, ...change } }, field);
  return <div className={styles.pane}>
    <div className={styles.actions} style={{ justifyContent: 'space-between' }}>
      <strong>{section.name ?? `Khúc ${index + 1}`}</strong>
      <span className={styles.actions}>
        <button type="button" className={styles.iconBtn} disabled={index < 2} onClick={() => move(-1)} aria-label="Đưa khúc lên"><Icon name="up" size={18} /></button>
        <button type="button" className={styles.iconBtn} disabled={index === 0 || index === doc.sections.length - 1} onClick={() => move(1)} aria-label="Đưa khúc xuống"><Icon name="down" size={18} /></button>
      </span>
    </div>
    {index === 0 && <p className={styles.note}>Khúc đầu là màn hình khách thấy ngay khi chạm thẻ. Vạch cam là đáy màn hình đầu: nút Google phải nằm trên vạch.</p>}
    <TextField label="Tên khúc" value={section.name ?? ''} max={40} required={false} onChange={name => set(name.trim() ? { ...section, name } : without(section, 'name') as Section, `section:${section.id}:name`)} />
    <NumberField label="Chiều cao" value={section.h} min={120} max={2400} onChange={h => up({ h }, 'h')} />
    <FillField label="Màu nền" value={bg.fill} onChange={fill => upBg({ fill }, 'fill')} />
    <Field label="Ảnh nền">
      <div className={styles.actions}><button type="button" className={styles.chip} disabled={!bg.src} onClick={() => up({ bg: without(bg, 'src') }, 'src')}>Không có ảnh nền</button></div>
      <UploadButton value={bg.src} onChange={src => upBg({ src }, 'src')} />
      <ArtPicker value={bg.src} onChange={art => upBg({ src: `art:${art}` }, 'src')} />
    </Field>
    {bg.src && <>
      <NumberField label="Làm tối ảnh (0–0.95)" value={bg.dim ?? 0} min={0} max={0.95} step={0.05} onChange={dim => up({ bg: dim ? { ...bg, dim } : without(bg, 'dim') }, 'dim')} />
      <Toggle label="Ảnh nền đen trắng" checked={!!bg.gray} onChange={gray => up({ bg: gray ? { ...bg, gray } : without(bg, 'gray') }, 'gray')} />
    </>}
    <Field label="Các lớp trong khúc">
      <div className={styles.list}>{[...section.els].reverse().map(el => <div key={el.id} data-active={selected === el.id || undefined} data-hidden={el.hide || undefined}>
        <button type="button" onClick={() => select(el.id)}>{nameOf(el)}</button><span className={styles.kind}>{KIND[el.t]}</span>
        <button type="button" className={styles.iconBtn} onClick={() => toggle(el.id)} aria-label={el.hide ? 'Hiện' : 'Ẩn'}><Icon name={el.hide ? 'eyeOff' : 'eye'} size={16} /></button>
      </div>)}</div>
    </Field>
    <div className={styles.actions}>
      <button type="button" className={styles.chip} disabled={doc.sections.length >= 8} onClick={add}><Icon name="plus" size={16} />Thêm khúc bên dưới</button>
      {index > 0 && <button type="button" className={styles.chip} data-danger onClick={remove}><Icon name="trash" size={16} />Xoá khúc</button>}
    </div>
  </div>;
}

/** The page as a whole: its name, the scroll hint, the thanks before Google, and where the Google button leads. */
export function PagePanel({ doc, name, setName, setDoc, googleUrl, shop }: { doc: PageDoc; name: string; setName: (name: string) => void;
  setDoc: (doc: PageDoc, key: string) => void; googleUrl: string | null; shop: string }) {
  const fx = doc.fx ?? {};
  const writeFx = (next: NonNullable<PageDoc['fx']>, key: string) => {
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined && v !== 0));
    setDoc(Object.keys(clean).length ? { ...doc, fx: clean } : without(doc, 'fx') as PageDoc, key);
  };
  return <div className={styles.pane}>
    <TextField label="Tên trang (hiện trên tab trình duyệt)" value={name} max={100} onChange={setName} />
    <Field label="Nút Google của quán">
      {googleUrl ? <p className={styles.note}>Mở trang đánh giá Google của quán: <a href={googleUrl} target="_blank" rel="noreferrer">thử link ↗</a></p>
        : <p className={styles.warn}>Quán chưa có link đánh giá Google. Dán Place ID ở bước Google để nút mở đúng trang của quán. <a href={`/bat-dau/google`}>Mở bước Google →</a></p>}
    </Field>
    <Toggle label="Mũi tên “kéo xuống” sau 3 giây" checked={!!fx.hint} onChange={on => writeFx({ ...fx, hint: on ? 3000 : undefined }, 'fx-hint')} />
    <p className={styles.note}>Hiện khi trang có từ hai khúc và khách chưa kéo xuống.</p>
    <SelectField label="Lời cảm ơn trước khi mở Google" value={String(fx.thanks ?? 0)} options={[['0', 'Không, mở Google ngay'], ['2', 'Đếm 2 giây'], ['3', 'Đếm 3 giây'], ['4', 'Đếm 4 giây']] as const}
      onChange={value => writeFx({ ...fx, thanks: Number(value) || undefined }, 'fx-thanks')} />
    <p className={styles.note}>Ai bấm nút Google cũng thấy cùng một lời cảm ơn, rồi Google mở ở thẻ mới — luật Google không cho gắn quà với đánh giá.</p>
    <span hidden>{shop}</span>
  </div>;
}

export type AddKind = 'heading' | 'text' | 'button' | 'image' | 'rect' | 'circle' | 'icon' | 'google' | 'feedback' | 'section';
export function AddPanel({ onAdd, hasGoogle, hasFeedback, full }: { onAdd: (kind: AddKind) => void; hasGoogle: boolean; hasFeedback: boolean; full: boolean }) {
  const item = (kind: AddKind, icon: Parameters<typeof Icon>[0]['name'], label: ReactNode, disabled = full) =>
    <button type="button" className={styles.addItem} disabled={disabled} onClick={() => onAdd(kind)}><Icon name={icon} size={26} />{label}</button>;
  return <div className={styles.pane}>
    <button type="button" className={`${styles.addItem} ${styles.googleItem}`} data-wide disabled={hasGoogle} onClick={() => onAdd('google')}
      title="Nên thêm nút đánh giá Google nhé">
      <Icon name="google" size={26} /><span>Nút đánh giá Google<br /><small className={styles.note}>{hasGoogle ? 'Trang đã có nút Google.' : 'Nên thêm nút đánh giá Google nhé — gắn sẵn link của quán.'}</small></span>
      <span className={styles.hint} aria-hidden="true">i</span>
    </button>
    <h3>Chữ</h3>
    <div className={styles.addGrid}>{item('heading', 'text', <b style={{ fontSize: 16 }}>Tiêu đề</b>)}{item('text', 'text', 'Đoạn chữ')}</div>
    <h3>Nút và link</h3>
    <div className={styles.addGrid}>{item('button', 'button', 'Nút link')}{item('feedback', 'send', 'Nút góp ý riêng', full || hasFeedback)}</div>
    <h3>Hình ảnh</h3>
    <div className={styles.addGrid}>{item('image', 'image', 'Ảnh')}{item('icon', 'sparkle', 'Biểu tượng')}{item('rect', 'shape', 'Khối chữ nhật')}{item('circle', 'shape', 'Khối tròn')}</div>
    <h3>Trang</h3>
    <div className={styles.addGrid}>{item('section', 'section', 'Khúc mới', false)}</div>
  </div>;
}

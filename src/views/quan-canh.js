// Cảnh riêng của từng quán (chủ yêu cầu 08/10/2026: "thiết kế lại trang Bamos và O'renchi", tham khảo chuyển động trang quán O'renchi trên QS).
// Mỗi quán: màu + nền động cố định (lá / hoa / đèn / trăng) + đầu trang quán (hero) + dải nhỏ trên trang vé + con dấu trên vé.
// Ngôn ngữ chuyển động lấy từ trang O'renchi của QS: hiện lần lượt cách nhau ~0,1 giây (fade / rise / pop / drop / left),
// rồi lặp nhẹ (twinkle / pulse / sway / bob). Tất cả bằng CSS (ui.css "Cảnh quán"), CSP chặn style nội tuyến → màu đặt bằng thuộc tính SVG / class.
// Máy bật "giảm chuyển động" → chỉ còn trạng thái cuối, không lặp.
import { html, raw } from '../lib/http.js';
import { asset } from './asset.js';
import { TBQ_TAG } from './logos.js';

const THEMES = [
  { id: 'orenchi', slugs: ['orenchi'], name: /o\W?\s*renchi/i, title: 'O’renchi', photo: 'nen-orenchi.jpg', sub: 'cà phê · sân vườn · đèn vàng', hand: ['Slow sips,', 'warm lights'] },
  { id: 'bamos', slugs: ['8ugdc', 'sakz8'], name: /bamos/i, title: 'Bamos', logo: 'quan-8ugdc.png', photo: 'nen-bamos.jpg', sub: 'coffee & tea · mở 24h', hand: ['Stay late,', 'sip slow'] },
];

/** Quán có cảnh riêng → theme | null. Nhận theo mã quán QS, rồi theo tên quán (quán chưa gắn mã QS vẫn nhận ra). */
export function cafeTheme(cafe) {
  if (!cafe) return null;
  const slug = String(cafe.qs_slug || '').toLowerCase();
  return THEMES.find((t) => t.slugs.includes(slug)) || THEMES.find((t) => t.name.test(String(cafe.name || ''))) || null;
}

const n1 = (v) => Math.round(v * 10) / 10;

/** Lá monstera (khung 100×115, cuống ở dưới giữa): khe xẻ + lỗ khoét thật bằng mask #q-cut (định nghĩa 1 lần trong nền động). */
const LEAF_D = 'M50 101C23 97 3 77 3 51C3 25 21 6 43 9C46 10 48.5 13 50 16C51.5 13 54 10 57 9C79 6 97 25 97 51C97 77 77 97 50 101Z';
const LEAF_MASK = `<mask id="q-cut" maskUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="130"><path fill="#fff" d="${LEAF_D}"/>`
  + '<path fill="none" stroke="#000" stroke-width="5" stroke-linecap="round" d="M-4 30L31 43M-4 53L33 57M4 80L37 68M10 11L35 33M104 30L69 43M104 53L67 57M96 80L63 68M90 11L65 33"/>'
  + '<ellipse fill="#000" cx="40" cy="50" rx="2.6" ry="4.2"/><ellipse fill="#000" cx="60" cy="50" rx="2.6" ry="4.2"/></mask>';
const MONSTERA = `<path class="leaf" mask="url(#q-cut)" d="${LEAF_D}"/><path class="rib" d="M50 116V17"/>`;

/** Hoa sứ 5 cánh xoắn (tâm 0,0, bán kính ~22). */
const PLUMERIA = [0, 72, 144, 216, 288].map((a) => `<ellipse class="petal" cx="0" cy="-11" rx="7.5" ry="12.5" transform="rotate(${a + 16})"/>`).join('')
  + '<circle class="heart" r="4.6"/>';

const STAR = 'M0 -6L1.3 -1.3L6 0L1.3 1.3L0 6L-1.3 1.3L-6 0L-1.3 -1.3Z';

/** Dây đèn võng: đường cong bậc 2 qua (x0,y0) (cx,cy) (x1,y1), n bóng. */
function lights([x0, y0], [cx, cy], [x1, y1], n) {
  const at = (t) => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t ** 2 * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t ** 2 * y1];
  let bulbs = '';
  for (let i = 0; i < n; i++) {
    const [x, y] = at(0.07 + (0.86 * i) / (n - 1));
    bulbs += `<g class="bulb" transform="translate(${n1(x)} ${n1(y)})"><path class="cord" d="M0 0V6"/><circle class="halo" cy="11" r="11"/><ellipse class="glass" cy="11" rx="4.2" ry="6"/></g>`;
  }
  return `<path class="wire" d="M${x0} ${y0}Q${cx} ${cy} ${x1} ${y1}"/>${bulbs}`;
}

/** Mái tôn tam giác (mặt tiền O'renchi) + nan dọc trong mái. */
function roof() {
  const L = 40, R = 350, top = 38, eave = 150, mid = 195;
  const yAt = (x) => (x <= mid ? eave - ((x - L) * (eave - top)) / (mid - L) : top + ((x - mid) * (eave - top)) / (R - mid));
  let slats = '';
  for (let x = 66; x <= 324; x += 13) slats += `M${x} ${n1(yAt(x) + 7)}V246`;
  return `<path class="slats" d="${slats}"/><path class="roof" d="M${L} ${eave}L${mid} ${top}L${R} ${eave}"/>`;
}

/** Tia art-deco toả từ sau logo (Bamos). */
function sunburst() {
  let rays = '';
  for (let i = 0; i < 15; i++) {
    const a = ((212 + (116 * i) / 14) * Math.PI) / 180;
    const len = i % 2 ? 112 : 146;
    rays += `<path class="ray" d="M${n1(195 + Math.cos(a) * 74)} ${n1(124 + Math.sin(a) * 74)}L${n1(195 + Math.cos(a) * len)} ${n1(124 + Math.sin(a) * len)}"/>`;
  }
  return `<g class="rays">${rays}</g><g class="arcs"><circle cx="195" cy="124" r="158"/></g>`;
}

/**
 * Ảnh thật của quán (ảnh chủ quán đăng trên Google Maps, mục "Của chủ sở hữu" — chủ chọn 08/10/2026), phủ lớp tối dần xuống dưới để chữ dễ đọc,
 * phóng chậm (Ken Burns). Đồ hoạ (đèn, lá, trăng, hoa) nằm trên ảnh.
 */
const photo = (theme) => (theme.photo ? `<img class="qphoto" src="${asset(theme.photo)}" alt="" decoding="async"><i class="qshade"></i>` : '');

/** Nền động cố định sau nội dung (mọi trang của quán). */
export function backdrop(theme) {
  if (!theme) return '';
  if (theme.id === 'orenchi') {
    return raw(`<div class="qbg" aria-hidden="true">${photo(theme)}<i class="glow g1"></i><i class="glow g2"></i><i class="glow g3"></i>
<svg class="leafy l1" viewBox="0 0 100 115" focusable="false"><defs>${LEAF_MASK}</defs><g class="sway">${MONSTERA}</g></svg>
<svg class="leafy l2" viewBox="0 0 100 115" focusable="false"><g class="sway">${MONSTERA}</g></svg>
<svg class="leafy l3" viewBox="0 0 100 115" focusable="false"><g class="sway">${MONSTERA}</g></svg></div>`);
  }
  const stars = [[40, 70], [120, 30], [300, 110], [350, 40], [70, 180], [250, 60], [180, 140]]
    .map(([x, y], i) => `<path class="star s${i % 3}" transform="translate(${x} ${y}) scale(${i % 2 ? 0.7 : 1})" d="${STAR}"/>`).join('');
  return raw(`<div class="qbg" aria-hidden="true">${photo(theme)}<i class="glow g1"></i><i class="glow g2"></i>
<svg class="sky" viewBox="0 0 390 200" preserveAspectRatio="xMidYMin slice" focusable="false">
<defs><mask id="q-moon"><circle r="18" fill="#fff"/><circle cx="8" cy="-6" r="15.5" fill="#000"/></mask></defs>
<g class="moon" transform="translate(344 64) scale(.72)"><circle class="moon-halo" r="34"/><circle class="moon-body" r="18" mask="url(#q-moon)"/></g>${stars}</svg>
<svg class="branch b1" viewBox="0 0 120 120" focusable="false"><g class="sway"><path class="twig" d="M0 118C30 96 46 72 58 40"/>
<path class="leaf2" d="M40 80C22 74 12 60 14 46C30 50 40 62 40 80Z"/><path class="leaf2" d="M56 52C66 38 82 32 96 36C88 50 72 56 56 52Z"/>
<g transform="translate(60 34)">${PLUMERIA}</g><g transform="translate(34 66) scale(.75)">${PLUMERIA}</g></g></svg>
<svg class="fall f1" viewBox="-14 -14 28 28" focusable="false"><g>${PLUMERIA}</g></svg>
<svg class="fall f2" viewBox="-14 -14 28 28" focusable="false"><g>${PLUMERIA}</g></svg>
<svg class="fall f3" viewBox="-14 -14 28 28" focusable="false"><g>${PLUMERIA}</g></svg></div>`);
}

/** Chữ TBQ nhỏ trong dòng "collab". */
const withTbq = () => raw(`<span class="qw-tbq">${TBQ_TAG}<b>TBQ Space</b></span>`);

/** Tên quán: logo ảnh (Bamos) hoặc chữ nghiêng có chân (O'renchi). */
const cafeMark = (theme, cls) => (theme.logo
  ? html`<img class="${cls} logo" src="${asset(theme.logo)}" alt="${theme.title}" width="180" height="66">`
  : html`<span class="${cls}">${theme.title}</span>`);

/** Đầu trang quán: cảnh lớn + tên quán + "collab cùng TBQ Space · Miễn phí tại quán". */
export function hero(theme) {
  // Có ảnh quán: biển thật trong ảnh làm tiêu đề (chữ vẽ chỉ còn cho trình đọc màn hình), bỏ mái vẽ — chỉ phủ đồ hoạ lên ảnh.
  const stage = theme.id === 'orenchi'
    ? `${theme.photo ? '' : roof()}<g class="strand">${lights([-12, 18], [195, theme.photo ? 70 : 108], [402, 12], 11)}</g>
<path class="spark" transform="translate(304 104)" d="${STAR}"/><path class="spark k2" transform="translate(84 176) scale(.7)" d="${STAR}"/>`
    : `${sunburst()}<path class="spark" transform="translate(312 92)" d="${STAR}"/><path class="spark k2" transform="translate(76 168) scale(.7)" d="${STAR}"/>`;
  return html`<div class="qh qh-${theme.id}${theme.photo ? ' qh-photo' : ''}">
  <svg class="qh-stage" viewBox="0 0 390 250" preserveAspectRatio="xMidYMin meet" focusable="false" aria-hidden="true">${raw(stage)}</svg>
  ${theme.id === 'orenchi' ? html`<p class="qh-kicker">Cafe</p>` : ''}
  ${cafeMark(theme, 'qh-name')}
  <p class="qh-sub">${theme.sub}</p>
  <p class="qh-hand" aria-hidden="true">${theme.hand[0]}<br>${theme.hand[1]}</p>
  <p class="qh-with">${theme.photo ? cafeMark(theme, 'qw-cafe') : ''}<span class="qw-x" aria-hidden="true">✕</span>${withTbq()}</p>
  <p class="qh-free">Miễn phí tại quán</p>
</div>`;
}

/** Dải nhỏ đầu trang vé: dây đèn / trăng sao + "Quán ✕ TBQ Space". */
export function band(theme) {
  const deco = theme.id === 'orenchi'
    ? `<g class="strand">${lights([-8, 4], [195, 40], [398, 2], 9)}</g>`
    : `<path class="star s0" transform="translate(30 22)" d="${STAR}"/><path class="star s1" transform="translate(360 30) scale(.8)" d="${STAR}"/>
<path class="star s2" transform="translate(300 12) scale(.6)" d="${STAR}"/><path class="star s1" transform="translate(84 40) scale(.6)" d="${STAR}"/>`;
  // Có ảnh quán: biển thật trong ảnh là logo — chừa khoảng cho biển hiện rõ, dải "× TBQ Space · Miễn phí tại quán" ngay dưới biển.
  return html`<div class="qband qb-${theme.id}${theme.photo ? ' qb-photo' : ''}">
  <svg class="qb-deco" viewBox="0 0 390 56" preserveAspectRatio="none" focusable="false" aria-hidden="true">${raw(deco)}</svg>
  <p class="qb-row">${cafeMark(theme, 'qb-name')}<span class="qw-x" aria-hidden="true">✕</span>${withTbq()}</p>
  ${theme.photo ? html`<p class="qb-free">Miễn phí tại quán</p>` : ''}
</div>`;
}

/** Con dấu quán trên vé (góc phải, đóng xuống khi vé hiện). */
export function stamp(theme) {
  return html`<span class="tk-stamp st-${theme.id}" aria-hidden="true">${theme.logo
    ? html`<img src="${asset(theme.logo)}" alt="" width="60" height="22">` : html`<i>${theme.title}</i>`}<small>${theme.id === 'bamos' ? '24H' : 'CAFE'}</small></span>`;
}

/**
 * Trang của quán là một tài liệu canvas (đợt ②, kịch bản mục 8–9; Tài 05/10: "dựng lại template từ PNG/PDF", "canvas theo
 * khổ điện thoại, co theo bề ngang màn hình", "trang chia khúc xếp dọc").
 *
 * - Một trang = các **khúc** (section) xếp dọc. Mỗi khúc là một tấm khổ điện thoại rộng `ARTBOARD` đơn vị, cao `h` đơn vị;
 *   trên máy thật một đơn vị = bề ngang cột trang / 390 (cột rộng tối đa 480px), nên cả khúc co giãn theo bề ngang.
 * - Phần tử đặt tự do như Canva (x, y, w, h, xoay). Riêng **chồng** (`stack`) tự xếp con theo chiều dọc — nút mạng xã hội
 *   thêm/bớt không phải kéo tay, và hiệu ứng "hiện lần lượt, đẩy phần dưới xuống" (mẫu Dynamic movement).
 * - Mọi con số là đơn vị thiết kế; mọi chiều cao đều khai báo, nên vị trí của mọi phần tử tính được trên máy chủ
 *   (layout.ts) — đó là cách luật Google "nút trong màn hình đầu" được kiểm khi phát hành, không nhờ may mắn.
 * - Chữ có tiếng Việt và (tuỳ) tiếng Anh; thiếu tiếng Anh thì hiện tiếng Việt (luật 0.3 của kịch bản).
 *
 * Không có CSS hay HTML tự do ở đâu cả: màu, phông, biểu tượng, tranh, kiểu nút đều chọn từ danh sách dưới đây
 * (validate.ts), nên một tài liệu không bao giờ chở được mã hay kiểu lạ lên trang khách.
 */
import stickerData from './stickers.json' with { type: 'json' };
import brushData from './brushes.json' with { type: 'json' };

export const ARTBOARD = 390;
/** The Google button's bottom edge must sit above this line in the first section: the first screen of an iPhone SE in Safari. */
export const FIRST_SCREEN = 560;
export const MAX_SECTIONS = 8;
export const MAX_ELEMENTS = 90;
export const MAX_SECTION_H = 2400;

export type Words = { vi: string; en?: string };
export type Color = string;
export type Gradient = { kind: 'linear'; angle: number; stops: [Color, number][] } | { kind: 'radial'; x: number; y: number; stops: [Color, number][] };
export type Fill = Color | Gradient;
export type Shadow = { x: number; y: number; blur: number; color: Color };
export type Edge = { w: number; color: Fill };
export type Glass = { blur: number; tint: Color };

/** Typefaces the page may use, each with full Vietnamese (components/canvas/fonts.ts). */
/** `rieng-chinh`, `rieng-dac-biet`: the shop's own fonts (doc.fonts), each falling back to a built-in face until it loads or if it is missing. */
export const FONTS = ['sans', 'display', 'serif', 'script', 'hand', 'rounded', 'slab', 'brush', 'geo', 'elegant', 'rieng-chinh', 'rieng-dac-biet'] as const;
export type FontKey = typeof FONTS[number];

/** Built-in icons: brand marks drawn simply, and line glyphs (components/canvas/icons.tsx). */
export const ICONS = ['instagram', 'tiktok', 'zalo', 'facebook', 'youtube', 'globe', 'link', 'wifi', 'phone', 'mail', 'maps', 'google', 'pin', 'hand',
  'cursor', 'tooth', 'sparkle', 'heart', 'plus', 'camera', 'calendar', 'shampoo', 'conditioner', 'jar', 'capsule', 'car', 'scissors', 'pole', 'cup',
  'flag', 'polish', 'bowl', 'smile', 'clinic', 'star', 'music', 'gift', 'menu', 'bed', 'key',
  // Biến thể dấu thương hiệu (Tài 07/10): màu thật · nét (`-net`, theo màu chữ) · đặc · tròn/vuông — để mỗi trang lấy cái hợp.
  'zalo-oa', 'zalo-net', 'facebook-net', 'youtube-net', 'maps-giay', 'maps-mau', 'maps-net', 'google-net', 'google-tron', 'instagram-net', 'instagram-dac', 'tiktok-net', 'tiktok-vuong', 'web', 'web-tro'] as const;
/** The marks the Google button may wear: Google's G or a Maps pin, in any of their variants. */
export const GOOGLE_MARKS = ['google', 'google-net', 'google-tron', 'maps', 'maps-mau', 'maps-net', 'maps-giay'] as const;
export type IconKey = typeof ICONS[number];

/** Built-in illustrations, drawn as vector art (components/canvas/art.tsx): an image source written `art:<key>`. */
export const ARTS = ['barber', 'car', 'space', 'drinks', 'smile', 'arches', 'dental', 'latte', 'hair', 'prism', 'party', 'racing', 'nails', 'pho', 'photo'] as const;
export type ArtKey = typeof ARTS[number];

/**
 * Vector shapes (components/canvas/shapes.tsx); the lights (Tài 07/10: "ánh sáng làm nên cảm giác dễ chịu"): `cau-vong` a thin sharp
 * ribbon of spectrum, `cau-vong-xoan` the same ribbon turning over, `vet-sang` a thin streak of light, `hat-bay` specks of light drifting up (uiverse.io vinh_8995/tame-lionfish-65, MIT) —
 * with `blend: "screen"`, and
 * `blur` when out of focus; warm light is `glow` in the shop's colour; then the powder
 * brushes (brushes.json, components/canvas/powder.tsx — nền kiểu Sentry: only the brush's numbers are kept, the colour is the
 * shop's); then the sticker library (stickers.json: sao, tim, mặt cười, dấu vẽ tay), each drawn in the element's colour, so one
 * sticker serves every shop, turned (`r`) and roughened (`grain`).
 */
export const STICKERS = stickerData as Record<string, { name: string; group: string; vb?: string; paths: StickerPath[] }>;
export type StickerPath = { d: string; fill?: boolean; stroke?: number; evenodd?: boolean; color?: string; opacity?: number };
export type Brush = { name: string; about: string; flakes: number; size: [number, number]; spread: number; clumps: number; clumpSpread: number; haze: number;
  stretch: number; alpha: [number, number]; stray: number };
export const BRUSHES = brushData as unknown as Record<string, Brush>;
/** `may-troi`: clouds drifting in three layers, far ones slower (the layered drift of uiverse.io jaykdoe/tasty-dragon-12, MIT, made
 * into clouds — Tài 07/10: "mây khó kiếm vì Canva không tải về được"); colours from the fill's stops. `sao-troi`: that pen's starfield. */
export const LIGHTS = ['cau-vong', 'cau-vong-xoan', 'vet-sang', 'hat-bay', 've', 'may-troi', 'sao-troi'] as const;
export const SHAPES = ['rect', 'circle', 'line', 'burst', 'sparkle', 'plus', 'heart', 'arrow', 'ribbon', 'flare', 'pin-line', 'wave', 'dots', 'checker', 'squiggle', 'glow',
  ...LIGHTS, ...Object.keys(brushData) as (keyof typeof brushData)[], ...Object.keys(stickerData) as (keyof typeof stickerData)[]] as const;
export const BLENDS = ['screen', 'soft-light', 'overlay', 'multiply', 'color-dodge'] as const;
export type ShapeKey = typeof SHAPES[number];

export const MOTIONS_IN = ['fade', 'rise', 'drop', 'pop', 'left', 'right', 'zoom', 'blur'] as const;
/** `xu`: turns over once like a coin, then rests (uiverse.io JohnnyCSilva/black-rabbit-68, MIT — docs/nguon-hieu-ung.md). */
export const MOTIONS_LOOP = ['float', 'sway', 'pulse', 'twinkle', 'spin', 'shine', 'bob', 'glow', 'xu'] as const;
export type Motion = { in?: typeof MOTIONS_IN[number]; at?: number; loop?: typeof MOTIONS_LOOP[number] };

/** `row`: a list row — icon, words on the left, an arrow on the right (mẫu Card Stack, Tài 06/10). */
/** `glitch`: a white pill with TikTok's two offset edges; `card`: a nearly square white card with a coloured edge (Zalo OA). */
/**
 * `popout`: a lime button that keeps calling — two small cards pop out above and below it with `pop`'s words and four corner marks
 * spread out, then all settle back (uiverse.io dexter-st/itchy-wolverine-84, MIT — docs/nguon-hieu-ung.md; made to run on its own,
 * phones have no hover). `edge.color` colours the corner marks.
 */
export const BUTTON_LOOKS = ['pill', 'ring', 'outline', 'soft', 'gradient', 'tail', 'link', 'box', 'tag', 'note', 'glow', 'text', 'row', 'glitch', 'card', 'popout'] as const;
export type ButtonLook = typeof BUTTON_LOOKS[number];
export const GOOGLE_LOOKS = ['maps', 'g', 'ring', 'glass'] as const;
export type GoogleLook = typeof GOOGLE_LOOKS[number];

/**
 * Chỗ của quán (Tài 06/10: "mọi thứ như link, chữ trên hitbox phải đồng bộ với shop"): an element marked with a slot shows
 * the shop's own data, filled in where the page is shown (slots.ts), as the Google button always takes the shop's own link.
 * What the template wrote there is a sample; a shop without that piece of data does not show the element at all.
 *   name, initial      the shop's name, its first letter (text)
 *   link slots         where a button, icon, picture, shape or text leads (lib/shop/profile.ts says what each takes)
 *   handle             "@name" (text, or a button that leads to the shop's first social page)
 *   hours, address     a line of text
 *   wifi               the shop's network behind a wifi button
 */
export const LINK_SLOTS = ['zalo', 'facebook', 'instagram', 'tiktok', 'youtube', 'website', 'menu', 'booking', 'phone', 'maps', 'email'] as const;
export type LinkSlot = typeof LINK_SLOTS[number];
export const SLOTS = ['name', 'initial', ...LINK_SLOTS, 'handle', 'hours', 'address', 'wifi'] as const;
export type SlotKey = typeof SLOTS[number];

type Box = { id: string; name?: string; x: number; y: number; w: number; h: number; r?: number; o?: number; hide?: boolean; lock?: boolean; motion?: Motion;
  slot?: SlotKey };
export type TextEl = Box & { t: 'text'; words: Words; font: FontKey; size: number; weight?: number; color: Color;
  /** Letters coloured in turn (the round button's thank-you line in Google's colours). */
  colors?: Color[];
  align?: 'left' | 'center' | 'right'; spacing?: number; line?: number; italic?: boolean; caps?: boolean; shadow?: Shadow;
  stroke?: { w: number; color: Color }; underline?: boolean;
  /** Set on an arc: the circle's radius in units, positive bends like a smile turned over (text over a cup), negative like a smile. */
  arc?: number; link?: string;
  /** Letters filled with a gradient instead of one colour (a ticket's title, uiverse.io zeeshan_2112/shy-rattlesnake-3). */
  paint?: Fill;
  /** The words inside a filled circle: a shop's initial as its avatar (mẫu Party). */
  disc?: { fill: Fill; edge?: Edge } };
export type ImageEl = Box & { t: 'image'; src: string; fit?: 'cover' | 'contain'; focus?: [number, number];
  mask?: 'none' | 'circle' | 'clover' | 'arch' | 'blob'; radius?: number; edge?: Edge; shadow?: Shadow; gray?: boolean;
  frame?: 'polaroid' | 'gilded'; caption?: Words; link?: string;
  /** More of the shop's photos: the picture turns over now and then and shows the next one (Tài 07/10, ảnh polaroid 4RAU). */
  flip?: string[] };
/**
 * `blur`: the shape itself softened (a shadow cast on the floor under a card, Tài 06/10), in units. `grain`: drawn as with a crayon —
 * the edge wavers and the colour has small gaps (dấu cộng, tim vẽ tay kiểu Sentry, Tài 07/10).
 */
export type ShapeEl = Box & { t: 'shape'; shape: ShapeKey; fill?: Fill; edge?: Edge; radius?: number; glass?: Glass; shadow?: Shadow; link?: string; blur?: number; grain?: boolean;
  /** How it mixes with what lies under it: light is `screen` (it only brightens), shade is `multiply`. */
  blend?: typeof BLENDS[number] };
export type IconEl = Box & { t: 'icon'; icon: IconKey; color?: Color; link?: string };
export type ButtonEl = Box & { t: 'button'; look: ButtonLook; label: Words; link?: string;
  /** A wifi button shows the shop's network instead of leaving the page. */
  wifi?: { name: string; pass?: string };
  icon?: IconKey; tag?: Words; bg?: Fill; fg?: Color; edge?: Edge; font?: FontKey; size?: number; shadow?: Shadow; weight?: number; spacing?: number;
  /** The two cards of the `popout` look, above and below the button. */
  pop?: [Words, Words] };
/**
 * The Google review button. Its words and its link are the platform's (the shop's Place ID); only its look is the template's.
 * `shadow`: how far it stands off the page (a knob in Bàn dựng, Tài 06/10: "nổi bóng để nổi bật khỏi nền"): none · soft · lift (a
 * deep, layered shadow) · hard (a solid offset block in `shade`).
 */
export const GOOGLE_SHADOWS = ['none', 'soft', 'lift', 'hard', 'halo'] as const;
export type GoogleEl = Box & { t: 'google'; look: GoogleLook; bg?: Fill; fg?: Color; shadow?: typeof GOOGLE_SHADOWS[number]; shade?: Color; bar?: Color; ring?: Color;
  /** Corner rounding in units (a pill when absent), an arrow at the right end as a list row has, and the words' size in units. */
  radius?: number; arrow?: boolean; size?: number;
  /** A double stripe of light sweeping across now and then, in this colour (uiverse.io Ashon-G/rotten-frog-52, MIT). */
  shine?: Color;
  /** Which mark it wears, where the look shows one (`maps`, `g`, `glass`); each look has its own when absent. */
  mark?: typeof GOOGLE_MARKS[number] };
/**
 * The paper plane that opens the private-feedback card: the original guest page's, kept as it was (Tài 05/10), floating at the
 * screen's lower left wherever the guest has scrolled (components/guest/plane.css). Its place in the document only says the
 * page has one; the page chooses its glyph and two colours, as the page's settings always could.
 */
export type FeedbackEl = Box & { t: 'feedback'; icon: 'plane' | 'chat' | 'mail'; color: Color; edge: Color;
  /** The screen's corner it floats in, chosen where it covers no picture or button of the page (Tài 06/10). */
  side?: 'left' | 'right' };
export type LangEl = Box & { t: 'lang'; look: 'select' | 'chip'; color: Color; bg?: Fill; label?: boolean };
export type LegalEl = Box & { t: 'legal'; color: Color; size?: number };
export type Leaf = TextEl | ImageEl | ShapeEl | IconEl | ButtonEl | GoogleEl | LangEl | LegalEl;
/** Omit, applied to each member of a union on its own (the built-in Omit flattens a union into its common keys). */
type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** Side by side inside a row a child has its own width; its place is the row's to decide. */
export type RowKid = Without<Leaf, 'x' | 'y' | 'w'> & { w: number };
/** Laid out side by side inside a stack: three service buttons in a row. */
export type RowEl = { id: string; t: 'row'; h: number; w?: number; gap: number; kids: RowKid[]; hide?: boolean };
/** Inside a stack a child's x and y are the stack's to decide; its height is still its own (layout stays computable). */
export type Kid = (Without<Leaf, 'x' | 'y' | 'w'> & { w?: number }) | RowEl;
/** `top`: the panel starts this many units below the container's top, so a first child (an avatar) can sit half outside it. */
export type Panel = { fill?: Fill; glass?: Glass; radius?: number; edge?: Edge; shadow?: Shadow; top?: number };
export type StackEl = Box & { t: 'stack'; kids: Kid[]; gap: number; pad?: number; align?: 'start' | 'center' | 'end' | 'stretch'; panel?: Panel;
  /** Milliseconds between children appearing one after another; each pushes what follows down (mẫu Dynamic movement). */
  reveal?: number };
/** One card behind the front card of a deck (mẫu Interactive card): a tap pulls it out, a second tap follows its link. */
export type DeckCard = { icon: IconKey; label: Words; link: string; fill: Fill; fg?: Color; slot?: LinkSlot; hide?: boolean };
export const DECK_LOOKS = ['party', 'racing', 'nails', 'pho'] as const;
export type DeckEl = Box & { t: 'deck'; look: typeof DECK_LOOKS[number]; front: { kids: Kid[]; gap: number; pad?: number; panel?: Panel; tilt?: number }; cards: DeckCard[] };
/**
 * Các nút của quán, tự sinh (Tài 07/10: "điền bao nhiêu link thì render bấy nhiêu nút, chỗ nào chưa điền thì không render"): one
 * button per link the shop has, in `order`, nothing for a link it lacks, and the whole group gone when it has none. The page never
 * lists sample links here: `items` is filled from the shop's details each time the page is shown (slots.ts), never stored --
 * except with `own`: the page keeps the links it carries (a design shown under another shop, `sua-trang chep`; Tài 07/10).
 *   look   icons (a row of marks) · pills (mark + name) · rows (list rows with an arrow)
 *   style  mau (brand colours) · net (thin line in `color`) · dac (solid in `color`)
 */
export const LINKS_LOOKS = ['icons', 'pills', 'rows'] as const;
export type LinksEl = Box & { t: 'links'; look: typeof LINKS_LOOKS[number]; style?: 'mau' | 'net' | 'dac'; color?: Color; bg?: Fill; gap?: number; size?: number;
  order?: LinkSlot[]; items?: { slot: LinkSlot; url: string; label?: string }[]; own?: true };
/**
 * Chỗ báo hiệu sự kiện (kịch bản mục 8; Tài 08/10: "nhìn phát là quán này có collab"): the picture of a collab -- the shop's logo
 * and the organizer's, on white -- in a card with a gradient ring and a "Hôm nay có sự kiện" tag, in the first section near the
 * shop's name. A tap scrolls to the event's block (khúc B, lib/events/section.ts). It shows only while /gov has `event` open for
 * the shop; otherwise it is gone, as a slot without the shop's data is. Never next to the Google button (layout.ts).
 */
export type EventSpotEl = Box & { t: 'event'; event: string; src: string;
  /** What the shop calls its regulars ("Bamos'er", Tài 08/10): the event's block then says it is for them. */
  fans?: string };
export type El = Leaf | FeedbackEl | StackEl | DeckEl | LinksEl | EventSpotEl;

/**
 * `extend: 'blur'`: the picture keeps its own shape at the top of the section, full width, and the rest of the section continues in a
 * blurred copy of it (Tài 06/10: "nếu ảnh ngắn thì render blur out ra"), so a section may grow past the picture.
 */
export type Background = { fill?: Fill; src?: string; fit?: 'cover' | 'contain'; focus?: [number, number]; gray?: boolean; blur?: number; dim?: number; extend?: 'blur' };
export type Section = { id: string; name?: string; h: number; bg?: Background; els: El[] };
/** A vertical band behind every section (mẫu hair styling: a brown strip as a second background). */
export type Band = { x: number; w: number; fill: Fill; blur?: number };
export type PageDoc = {
  v: 1;
  /** The shop's own font files (uploads), for the `rieng-chinh` and `rieng-dac-biet` faces. */
  fonts?: { chinh?: string; dacBiet?: string };
  /** Background sound (an upload): off until the guest taps the speaker — browsers never let a page start sound by itself. */
  sound?: { src: string; volume?: number };
  /** A background that stays still behind the whole page while it scrolls. */
  backdrop?: Background;
  band?: Band;
  sections: Section[];
  fx?: {
    /** Milliseconds before a "scroll to see more" arrow appears, if the guest has not scrolled (mẫu Illustrate). */
    hint?: number;
    /** The thank-you card before Google opens (components/effects/thanks.tsx), counting this many seconds (1–4). */
    thanks?: number;
  };
};

export const pick = (words: Words, lang: 'vi' | 'en') => (lang === 'en' && words.en?.trim() ? words.en : words.vi);

import { PublishingError, type Localized, type PageConfig } from './config';
import { fold } from '../text-fold';

/**
 * The product's own Google rules, enforced where a shop writes its page (lát A7/F-013, Astra 2026-09-20).
 *
 * `google-policy.md` rule 4, 5, 7 and 8 say the platform must never let a shop offer something in exchange for a
 * review, name an employee to mention, or put a marketing line next to the Google button as if trading with it.
 * Until now the schema enforced the *shape* of a page and nothing about what it said, so a shop could publish a
 * link labelled "Đánh giá Google 5 sao để nhận quà" and the platform would serve it. The penalty for that lands on
 * the shop's own Google listing, which is the whole reason that file exists.
 *
 * Two different problems, two different answers, because only one of them can be closed properly:
 *
 *   - a service link is a button that names an action, so its label comes from a fixed neutral list. That is a
 *     fence: nothing else can be published, in any language, ever;
 *   - the shop's name and its question are genuinely free text, so they get a tripwire: a small set of words that
 *     no honest page needs together. It will not catch a determined shop writing around it, and it is not meant
 *     to. What it catches is the shop that did not know the rule -- which is most of them -- and the written
 *     guidance carries the rest.
 *
 * Checked where a shop writes, never where a page is read: an already-published page keeps rendering, so a rule
 * added today cannot take a live page down.
 */

/**
 * Every label a service button may carry. Neutral by construction: each one names an action or a place, and none
 * of them can be bent into an offer.
 *
 * Meant to grow. Blocking a shop from labelling a button it legitimately needs is a real cost, and the first
 * version of this list was already missing "Đặt lịch" -- which a salon or a spa needs and which a test caught.
 * Adding an entry is a one-line change; the only rule is that the entry must read as neutral on its own, which
 * the test for this list checks against the same tripwire the free text goes through.
 */
export const SERVICE_LABELS: Localized[] = [
  { vi: 'Zalo', en: 'Zalo' },
  { vi: 'Instagram', en: 'Instagram' },
  { vi: 'Facebook', en: 'Facebook' },
  { vi: 'TikTok', en: 'TikTok' },
  { vi: 'Website', en: 'Website' },
  { vi: 'Thực đơn', en: 'Menu' },
  { vi: 'Đặt chỗ', en: 'Book a table' },
  { vi: 'Đặt lịch', en: 'Book' },
  { vi: 'Đặt hàng', en: 'Order' },
  { vi: 'Gọi', en: 'Call' },
  { vi: 'Gọi cho quán', en: 'Call us' },
  { vi: 'Chỉ đường', en: 'Directions' },
  { vi: 'Giờ mở cửa', en: 'Opening hours' },
  { vi: 'Bảng giá', en: 'Price list' },
];

/** One folding rule for the whole product; the activity search uses the same one. */
const plain = fold;

/** What the page is for. Mentioning any of these is fine on its own. */
const REVIEW = ['google', 'danh gia', 'nhan xet', 'review', 'rating', 'sao', 'star'];
/** What may never be offered for one. */
const REWARD = ['qua', 'tang', 'mien phi', 'giam gia', 'khuyen mai', 'voucher', 'uu dai', 'coupon', 'the cao', 'boc tham', 'quay thuong', 'tich diem',
  'gift', 'free', 'discount', 'reward', 'prize', 'voucher', 'points'];
/** Naming a person to mention, which rule 5 and 7 both forbid. */
const NAMING = ['nhac ten', 'ghi ten', 'ten nhan vien', 'ten ban', 'mention', 'name the staff', 'name our'];

/**
 * Whole words, not substrings. Matching "qua" anywhere inside a string made "quán" and "quan trọng" look like a
 * gift, so "Đánh giá của bạn rất quan trọng với quán" -- the most ordinary neutral sentence a shop could write --
 * was refused. Padding both sides turns the same test into a word-boundary one and still matches phrases.
 */
const hits = (text: string, words: string[]) => {
  const padded = ` ${text.replace(/[^a-z0-9]+/g, ' ').trim()} `;
  return words.some(word => padded.includes(` ${word} `));
};

/**
 * Free text a shop writes about itself. Refused only when it ties a review to something given in return, or asks
 * the customer to name someone -- the two things `google-policy.md` says a shop must never be helped to do.
 */
export function freeTextProblem(value: string): 'reward' | 'naming' | null {
  const text = plain(value);
  if (!hits(text, REVIEW)) return null;
  if (hits(text, REWARD)) return 'reward';
  if (hits(text, NAMING)) return 'naming';
  return null;
}

/**
 * Where the Google button may lead (luật 1, 2 và 3; lát A7, 26/09/2026). The button is the one thing every guest sees
 * the same way, so if it could point anywhere a shop could send it to its own page that asks for stars first and
 * lets only the happy ones through -- review gating, done through the platform's own Google button. So it must lead
 * to Google, and carry nothing that fills in a rating or words for the guest.
 *
 * Hosts, not "anything under google.com": `sites.google.com` hosts pages anyone builds, and `google.com/url?q=…`
 * forwards anywhere. On the two bare search hosts only the Maps and Search paths count. Meant to grow, like the
 * label list: a shop blocked from a genuine Google link is a real cost, and adding a host is one line.
 */
const GOOGLE_HOSTS: Record<string, RegExp> = {
  'maps.google.com': /^\//, 'maps.google.com.vn': /^\//, 'search.google.com': /^\/local\//, 'business.google.com': /^\//,
  'google.com': /^\/(maps|search)\b/, 'www.google.com': /^\/(maps|search)\b/,
  'google.com.vn': /^\/(maps|search)\b/, 'www.google.com.vn': /^\/(maps|search)\b/,
  'g.page': /^\//, 'g.co': /^\/kgs\//, 'maps.app.goo.gl': /^\//, 'goo.gl': /^\/maps\b/,
};
/** Query names that would carry a rating or ready-made words into Google (rule 3 and 7). */
const PREFILL = ['rating', 'stars', 'star', 'score', 'text', 'comment', 'content', 'review_text'];

export function googleUrlProblem(value: string): 'host' | 'prefill' | null {
  let url: URL; try { url = new URL(value); } catch { return 'host'; }
  const path = GOOGLE_HOSTS[url.hostname.toLowerCase()];
  if (url.protocol !== 'https:' || url.username || url.password || !path || !path.test(url.pathname)) return 'host';
  for (const key of url.searchParams.keys()) if (PREFILL.includes(key.toLowerCase())) return 'prefill';
  return null;
}

/** Throws when a page may not be saved or published. Read paths never call this. */
export function assertPublishable(config: PageConfig) {
  if (googleUrlProblem(config.googleUrl)) throw new PublishingError('POLICY_GOOGLE_URL');
  for (const link of config.links) {
    if (!SERVICE_LABELS.some(allowed => allowed.vi === link.label.vi && allowed.en === link.label.en)) {
      throw new PublishingError('POLICY_LINK_LABEL');
    }
  }
  for (const value of [config.name, config.text.question.vi, config.text.question.en]) {
    if (freeTextProblem(value)) throw new PublishingError('POLICY_GOOGLE_EXCHANGE');
  }
}

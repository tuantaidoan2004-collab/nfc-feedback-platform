import { PublishingError, type PageConfig } from './config';
import { fold } from '../text-fold';
import { googleProblems, linkRuleProblem, wordsOf } from '../canvas/layout';

/**
 * The product's own Google rules, enforced where a shop writes its page (lát A7/F-013, Astra 2026-09-20; canvas 05/10).
 *
 * `google-policy.md` rule 4, 5, 7 and 8 say the platform must never let a shop offer something in exchange for a
 * review, name an employee to mention, or put a marketing line next to the Google button as if trading with it. The
 * penalty lands on the shop's own Google listing, which is the whole reason that file exists.
 *
 * On a canvas page every word is free text, written like in Canva, so every word goes through the trip-wire below: a
 * small set of words no honest page needs together. It will not catch a determined shop writing around it, and it is not
 * meant to; it catches the shop that did not know the rule -- most of them -- and the written guidance and the review of
 * a new account's first publication carry the rest. The Google button itself is the platform's: its words and its link
 * cannot be edited at all, so no page can bend it.
 */

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

/**
 * Throws when a page may not be saved or published; read paths never call this (a rule added today must not take a live page
 * down). The page's own Google rules (layout.ts: one Google button, wholly in the first screen, nothing private above it), where
 * its links lead, and the trip-wire above over every word it shows, in both languages, and over its name.
 */
export function assertPublishable(config: PageConfig) {
  const google = googleProblems(config.doc); if (google) throw new PublishingError(`POLICY_${google}`);
  const link = linkRuleProblem(config.doc); if (link) throw new PublishingError(link === 'INVALID_PAGE' ? 'INVALID_CONFIG' : link);
  for (const value of [config.name, ...wordsOf(config.doc)]) if (freeTextProblem(value)) throw new PublishingError('POLICY_GOOGLE_EXCHANGE');
}

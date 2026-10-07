import Anthropic from '@anthropic-ai/sdk';
import type { Pool } from 'pg';
import { AdminError } from './auth';
import { EditDesk, deskShop, readDetails, type Desk, type DeskDetails } from './desk';
import { CANVAS_TEMPLATES, canvasTemplate } from '../canvas/templates';
import { DOC_SPEC, TASTE, TEMPLATE_RULES } from '../canvas/spec.generated';
import INVITATIONS from '../canvas/loi-moi.json' with { type: 'json' };
import { BRUSHES, LIGHTS, STICKERS } from '../canvas/doc';
import { FILE_ROLES } from './file-roles';
import { CanvasError, validateDoc, walk } from '../canvas/validate';
import { googleProblems } from '../canvas/layout';
import { bindShop, placeholderLinks } from '../canvas/slots';
import { assertPublishable } from '../publishing/policy';
import { PublishingError, validateConfig } from '../publishing/config';
import { readProfile } from '../shop/profile';
import type { PageDoc } from '../canvas/doc';

/**
 * "Nhờ Claude" in Bàn dựng (Tài 06/10 tối, kịch bản 9b.6): the shop's messages, its pictures and the whole template library go to
 * Claude, which picks the template that fits, writes the page and reads the shop's details out of the messages. What comes back is
 * checked by the platform's own gates -- the document format, the Google rules, the words, no sample link, pictures only from this
 * request -- and on a failure Claude is told what failed and tries again (twice at most). The result goes into the draft and the
 * waiting details; Tài looks at it on his phone and publishes it himself.
 *
 * The key is Tài's (`ANTHROPIC_API_KEY`, set by him on Vercel and in his local env file); without it the button says so.
 */
export const DESK_MODEL = 'claude-opus-5-5';
const RETRIES = 2;

const SYSTEM = `Bạn là nhà thiết kế trang của Quite Sensational: mỗi quán (quán cà phê, tiệm tóc, spa, nha khoa…) có một trang điện thoại mở từ thẻ NFC/QR, mời khách đánh giá Google và dẫn tới các kênh của quán. Admin Tài nhận yêu cầu của chủ quán qua Zalo, dán lời khách và thả ảnh vào "Bàn dựng"; bạn dựng trang theo ý khách.

Việc của bạn:
1. Đọc lời khách, ghi chú của Tài, ảnh và logo. Hiểu khách muốn gì (màu, không khí, giống biển hiệu hay ảnh mẫu nào, chữ gì).
2. Chọn MỘT mẫu trong thư viện hợp nhất làm điểm xuất phát (khoá "template"), rồi viết trọn tài liệu trang (PageDoc) — được đổi màu, phông, ảnh, chữ, vị trí, thêm bớt phần tử, miễn đúng định dạng bên dưới. Khách đòi giống một thứ có thật (biển hiệu, ảnh mẫu) thì bám sát nó nhất có thể: dùng chính ảnh logo/biển hiệu khách gửi làm ảnh, lấy màu từ đó.
3. Ảnh: chỉ dùng đúng các địa chỉ tệp được liệt kê (hoặc tranh "art:<khoá>" có sẵn). Không bịa địa chỉ ảnh.
4. Thông tin quán (Zalo, Facebook, Instagram, TikTok, YouTube, website, menu, đặt lịch, số điện thoại, chỉ đường, @tên, giờ mở cửa, địa chỉ, wifi) KHÔNG viết thẳng vào trang: đặt "slot" trên phần tử, hệ thống tự điền. Chỉ ghi vào "details_json" những gì khách thật sự đã gửi; tuyệt đối không bịa link, số, giờ, địa chỉ. Thiếu thì để trống — phần tử tự ẩn — và hỏi khách trong tin trả lời.
5. Luật Google (bắt buộc, trang không qua sẽ bị trả lại): đúng một nút "google", nằm trọn trong khúc đầu, mép dưới phía trên vạch 560 đơn vị; không ô góp ý nào ở trên nó; không chữ nào đổi quà lấy đánh giá, nhắc số sao hay gợi nội dung đánh giá. Chữ và link nút Google là của nền tảng.
6. Giữ phần tử "feedback" (máy bay giấy góp ý riêng) và "legal" (quyền riêng tư) như mẫu có. Trang luôn cao hơn một màn hình điện thoại.
7. Tiếng Việt là chính; chữ nào có thể thì kèm "en".

Trả về đúng JSON theo lược đồ:
- template: khoá mẫu bạn xuất phát
- summary: 2–5 câu cho Tài: bạn đã làm gì, vì sao chọn mẫu đó, chỗ nào chưa chắc
- reply: tin Zalo Tài gửi khách (xưng "em", gọi "anh/chị"), ngắn: báo trang đã dựng xong bản nháp, hỏi đúng những gì còn thiếu
- questions: những điều còn thiếu hoặc chưa rõ (mảng chuỗi, có thể rỗng)
- details_json: chuỗi JSON {"name"?, "profile"?: {"links"?: {"<slot>": {"url", "label"?}}, "handle"?, "hours"?, "address"?, "wifi"?: {"name","pass"?}}, "placeId"?} — chỉ điều khách đã gửi; "{}" nếu không có gì
- doc_json: chuỗi JSON của trọn PageDoc

# Định dạng trang (nguồn lib/canvas/doc.ts)
${DOC_SPEC}

# Luật mẫu (templates/README.md)
${TEMPLATE_RULES}

# Gu của Tài (templates/taste.md) — dựng theo đúng gu này
${TASTE}

# Câu mời theo ngành (lib/canvas/loi-moi.json) — chọn đúng ngành của quán, dùng nguyên câu hoặc sửa nhẹ cho hợp quán, giữ trung lập
${JSON.stringify(INVITATIONS)}

# Kho chi tiết: shape là một trong ${JSON.stringify(Object.keys(STICKERS))}, cọ bột phấn ${JSON.stringify(Object.keys(BRUSHES))}, ánh sáng ${JSON.stringify(LIGHTS)}

# Thư viện mẫu
${JSON.stringify(CANVAS_TEMPLATES)}`;

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['template', 'summary', 'reply', 'questions', 'details_json', 'doc_json'],
  properties: {
    template: { type: 'string' }, summary: { type: 'string' }, reply: { type: 'string' },
    questions: { type: 'array', items: { type: 'string' } }, details_json: { type: 'string' }, doc_json: { type: 'string' },
  },
};
type Answer = { template: string; summary: string; reply: string; questions: string[]; details_json: string; doc_json: string };
export type ClaudeResult = { template: string; summary: string; reply: string; questions: string[]; tries: number; cost: { input: number; output: number; cached: number } };

/** Everything the platform would refuse, in words Claude can act on; empty when the proposal can go into the draft. */
export function proposalProblems(answer: Answer, desk: Desk): { problems: string[]; doc?: PageDoc; details?: DeskDetails } {
  const problems: string[] = [];
  if (!canvasTemplate(answer.template)) problems.push(`"template" phải là một khoá trong thư viện, không phải "${answer.template}".`);
  let details: DeskDetails = {};
  try { details = readDetails(JSON.parse(answer.details_json || '{}'), true); }
  catch (error) { problems.push(`details_json không hợp lệ (${error instanceof AdminError ? error.code : 'không đọc được JSON'}).`); }
  let doc: PageDoc;
  try { doc = validateDoc(JSON.parse(answer.doc_json)); }
  catch (error) { problems.push(`doc_json sai định dạng${error instanceof CanvasError ? ` ở ${error.at}` : ': không đọc được JSON'}.`); return { problems }; }
  const files = new Set(desk.files.map(f => f.url));
  for (const el of walk(doc)) if (el.t === 'image' && !el.src.startsWith('art:') && !el.src.startsWith('/tpl/') && !files.has(el.src))
    problems.push(`Ảnh #${el.id} dùng "${el.src}", không phải tệp của yêu cầu này.`);
  for (const section of doc.sections) if (section.bg?.src && !section.bg.src.startsWith('art:') && !files.has(section.bg.src))
    problems.push(`Ảnh nền khúc "${section.id}" không phải tệp của yêu cầu này.`);
  const google = googleProblems(doc);
  if (google) problems.push(`Luật Google: ${google} (một nút google, trọn trong khúc đầu, mép dưới trên vạch 560, không gì góp ý ở trên).`);
  const shop = { name: details.name ?? deskShop(desk).name, profile: details.profile ?? readProfile(desk.shop.profile) };
  const shown = bindShop(doc, shop, 'live');
  try { assertPublishable(validateConfig({ schemaVersion: 4, name: shop.name, doc: shown })); }
  catch (error) { problems.push(`Lõi phát hành từ chối: ${error instanceof PublishingError ? error.code : String(error)}.`); }
  const leftovers = placeholderLinks(shown);
  if (leftovers.length) problems.push(`Còn link mẫu ở ${leftovers.map(id => `#${id}`).join(', ')}: link của quán phải nằm trong "slot", không viết thẳng.`);
  return { problems, doc, details };
}

/** The pictures of the request as Claude sees them: fetched from the store (the local store is not reachable from Anthropic). */
async function pictures(desk: Desk, fetcher: typeof fetch): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const [i, file] of desk.files.entries()) {
    const label = `Tệp ${i + 1} (vai "${FILE_ROLES[file.role].name}", "${file.name}"): ${file.url}`;
    if (file.kind !== 'image') { blocks.push({ type: 'text', text: `${label} — ${file.kind === 'video' ? 'video' : file.kind === 'font' ? 'font' : 'âm thanh'}, không xem được nội dung; dùng theo vai của nó.` }); continue; }
    const response = await fetcher(file.url);
    if (!response.ok) { blocks.push({ type: 'text', text: `${label} — không tải được.` }); continue; }
    const type = (response.headers.get('content-type') ?? '').split(';')[0];
    const media = (['image/jpeg', 'image/png', 'image/webp'].includes(type) ? type : file.url.endsWith('.png') ? 'image/png' : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp';
    blocks.push({ type: 'text', text: label });
    blocks.push({ type: 'image', source: { type: 'base64', media_type: media, data: Buffer.from(await response.arrayBuffer()).toString('base64') } });
  }
  return blocks;
}

function brief(desk: Desk): string {
  const notes = desk.notes.map(n => `[${n.who === 'khach' ? 'Khách' : n.who === 'tai' ? 'Tài' : 'Claude (lần trước)'} · ${n.at}] ${n.body}`).join('\n');
  return [
    `Quán: ${deskShop(desk).name} (trang /${desk.page.slug}${desk.page.state === 'active' ? ', đang chạy' : ', chưa phát hành'}).`,
    `Mẫu quán chọn trong Library: ${desk.request.templateKey ?? '(chỉnh trang đang có)'}. Mẫu của bản nháp hiện tại: ${desk.draft.templateKey}.`,
    `Lời nhắn lúc gửi yêu cầu: ${desk.request.message ?? '(không ghi)'}`,
    `Nhật ký (lời khách dán từ Zalo, ghi chú của Tài):\n${notes || '(trống)'}`,
    `Thông tin quán đã lưu: ${JSON.stringify(desk.shop.profile)}. Thông tin chờ lưu: ${JSON.stringify(desk.details ?? {})}.`,
    `Quán ${desk.shop.hasGoogle || desk.details?.placeId ? 'đã có' : 'CHƯA có'} link Google (Place ID).`,
    `Bản nháp hiện tại (sửa tiếp từ đây nếu khách chỉ xin chỉnh, hoặc làm lại từ mẫu khác nếu cần):\n${JSON.stringify(desk.draft.config.doc)}`,
  ].join('\n\n');
}

export async function askClaude(pool: Pool, adminId: string, requestId: string,
  options: { client?: Anthropic; fetcher?: typeof fetch; desk?: EditDesk } = {}): Promise<ClaudeResult> {
  if (!options.client && !process.env.ANTHROPIC_API_KEY) throw new AdminError(503, 'CLAUDE_NOT_CONFIGURED');
  const client = options.client ?? new Anthropic(), fetcher = options.fetcher ?? fetch, desks = options.desk ?? new EditDesk(pool);
  const desk = await desks.load(requestId);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: [...await pictures(desk, fetcher), { type: 'text', text: brief(desk) }] }];
  const cost = { input: 0, output: 0, cached: 0 };
  for (let tries = 1; tries <= RETRIES + 1; tries++) {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.stream({
        model: DESK_MODEL, max_tokens: 64000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
        messages,
      }).finalMessage();
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new AdminError(503, 'CLAUDE_KEY_REJECTED');
      // A key made outside any workspace is refused on every call (seen 06/10): a key has to be made inside one.
      if (error instanceof Anthropic.BadRequestError && /workspace/i.test(error.message)) throw new AdminError(503, 'CLAUDE_KEY_NO_WORKSPACE');
      if (error instanceof Anthropic.RateLimitError) throw new AdminError(429, 'CLAUDE_BUSY');
      if (error instanceof Anthropic.APIError) throw new AdminError(502, `CLAUDE_${error.status ?? 'ERROR'}`);
      throw error;
    }
    cost.input += response.usage.input_tokens; cost.output += response.usage.output_tokens; cost.cached += response.usage.cache_read_input_tokens ?? 0;
    if (response.stop_reason === 'refusal') throw new AdminError(422, 'CLAUDE_REFUSED');
    if (response.stop_reason === 'max_tokens') throw new AdminError(502, 'CLAUDE_TOO_LONG');
    const text = response.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('');
    let answer: Answer;
    try { answer = JSON.parse(text) as Answer; } catch { throw new AdminError(502, 'CLAUDE_BAD_JSON'); }
    const checked = proposalProblems(answer, desk);
    if (!checked.problems.length) {
      const result = { template: answer.template, summary: answer.summary, reply: answer.reply, questions: answer.questions, tries, cost };
      await desks.propose(adminId, requestId, { template: answer.template, doc: checked.doc!, details: Object.keys(checked.details!).length ? checked.details! : null,
        claude: { ...result, at: new Date().toISOString(), model: response.model } });
      await desks.noteFromClaude(requestId, `${answer.summary}${answer.questions.length ? `\nCòn thiếu: ${answer.questions.join('; ')}` : ''}`);
      return result;
    }
    // Append-only: the answer as it came, then what failed, so Claude fixes its own page.
    messages.push({ role: 'assistant', content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
    messages.push({ role: 'user', content: `Trang chưa qua kiểm của nền tảng:\n- ${checked.problems.join('\n- ')}\nSửa đúng những chỗ đó và trả lại trọn JSON.` });
  }
  throw new AdminError(422, 'CLAUDE_PAGE_REFUSED');
}

// Cấu hình công cụ cho đợt chạy thử thật (chạy lại nhiều lần an toàn: cập nhật theo slug, không tạo trùng).
//   npm run pilot
// Công cụ không có trong danh sách dưới sẽ bị TẮT (khách thấy nút "Cần công cụ khác? Liên hệ Tiệm").
// Sửa số liệu ở đây hoặc sau này trong trang quản trị → Công cụ.
import { loadConfig } from '../src/config.js';
import { openDb, get, run, all } from '../src/db/index.js';
import { freeTextProblem, POLICY_MESSAGE } from '../src/lib/policy.js';
import { DEFAULT_TOOL_PATTERNS } from '../src/domain/mail.js';
import { USABLE_SQL } from '../src/domain/quota.js';

export const PILOT_TOOLS = [
  {
    // 10 tài khoản mới / ngày × 2 khách. Khách giữ 7 ngày, xong thì tài khoản bỏ luôn (không đổi mật khẩu).
    slug: 'capcut', name: 'CapCut Pro', login_type: 'password', login_url: 'https://www.capcut.com/login',
    slot_hours: 168, reuse: 'once', rotation_required: 0, holders_default: 2, daily_cap: 20, lifetime_cap: 1, cooldown_days: 30, sort: 10,
    instructions: 'Đăng nhập bằng email và mật khẩu ở trên, chỉ trên 1 thiết bị.\nTài khoản dùng chung 2 người: chỉ mở dự án của bạn, không xoá dự án của người khác.\nKhông đổi mật khẩu, email hay thông tin tài khoản.',
  },
  {
    // 8 khách / tài khoản, dùng trong ngày: ai nhận lúc nào cũng hết lúc 6h sáng hôm sau → 6h chủ vào ChatGPT bấm
    // "Đăng xuất mọi thiết bị" rồi tài khoản giao lại cho ngày mới.
    // Chủ chọn 07/10: đăng nhập bằng mã gửi về email của Tiệm (như Claude), không mật khẩu / 2FA. Nhập kho: mỗi dòng 1 email @tiembanquyen.site.
    slug: 'chatgpt', name: 'ChatGPT Plus', login_type: 'email_code', login_url: 'https://chatgpt.com/auth/login', high_value: 1,
    slot_hours: 24, end_hour: 6, reuse: 'rotate', rotation_required: 1, holders_default: 8, daily_cap: null, lifetime_cap: 2, cooldown_days: 30, sort: 20,
    // Phiên 24: lấy mã đăng nhập cần mã phiếu (phát ở quán); 6h chủ làm mới (xoá Project + chat, đăng xuất mọi thiết bị,
    // tạo lại Project "Slot 1…8") — giữ Project của khách đã gia hạn.
    voucher_code: 1, workspace_bot: 1, code_max: 2, // chủ chốt 09/10/2026: mỗi máy 2 mã (2 lần đăng nhập)
    instructions: 'Chọn "Tiếp tục với email", nhập email ở trên, rồi dùng mã 6 số hiện trên trang này (không chọn Google / Apple / Microsoft).\nChỉ dùng Project mang tên Slot của bạn. Không mở, đổi tên hay xoá Project và đoạn chat của người khác.\nKhông lưu thông tin riêng tư: người dùng chung có thể thấy.\nKhông đổi email, không bật 2FA, không bấm "Đăng xuất khỏi mọi thiết bị".',
  },
  {
    // 3 khách / tài khoản, dùng trong ngày tới 6h sáng hôm sau → 6h chủ vào Claude bấm "Đăng xuất mọi thiết bị".
    // Tài khoản Claude tự hết Pro sau 7 ngày kể từ lúc tạo → quá 7 ngày không giao nữa (nhập kho ngay ngày tạo).
    // Đăng nhập bằng mã gửi về email của Tiệm (Cloudflare chuyển thư về TBQ).
    slug: 'claude', name: 'Claude Pro', login_type: 'email_code', login_url: 'https://claude.ai/login', high_value: 1,
    slot_hours: 24, end_hour: 6, account_days: 7, reuse: 'rotate', rotation_required: 1, holders_default: 3, daily_cap: null, lifetime_cap: 2, cooldown_days: 30, sort: 25,
    reserve_account: 1, // giữ 1 tài khoản dự phòng cho 6h sáng (chủ chọn 06/10)
    voucher_code: 1, // phiên 24: lấy mã đăng nhập cần mã phiếu
    instructions: 'Chọn "Tiếp tục với email", nhập email ở trên, rồi dùng mã 6 số hiện trên trang này.\nChỉ dùng Project mang tên Slot của bạn. Không mở hay xoá hội thoại của người khác.\nKhông lưu thông tin riêng tư: người dùng chung có thể thấy.\nKhông đổi tên, email hay bấm "Đăng xuất khỏi mọi thiết bị".',
  },
  {
    slug: 'gemini', name: 'Gemini Pro', login_type: 'redeem', login_url: null, rotation_required: 0,
    slot_hours: 24, reuse: 'once', holders_default: 1, daily_cap: 5, lifetime_cap: 1, cooldown_days: 30, sort: 30,
    instructions: 'Dùng Gmail của chính bạn để nhận.\nLink hoặc mã chỉ dùng được 1 lần, dành riêng cho bạn.',
  },
  {
    // Như CapCut: khách giữ 7 ngày, 2 khách / tài khoản, xong bỏ luôn. Chủ chọn 07/10: chỉ giao email + mật khẩu, không nút Lấy mã
    // (email Adobe / CapCut có thể ngoài tiembanquyen.site; hãng hỏi mã thì khách bấm Báo Tiệm, chủ trả tay).
    slug: 'adobe', name: 'Adobe Creative Cloud', login_type: 'password', login_url: 'https://account.adobe.com',
    slot_hours: 168, reuse: 'once', rotation_required: 0, holders_default: 2, daily_cap: 4, lifetime_cap: 1, cooldown_days: 30, sort: 40,
    instructions: 'Đăng nhập bằng email và mật khẩu ở trên, chỉ trên 1 thiết bị. Nếu Adobe hỏi mã gửi qua email, bấm Báo Tiệm.\nTài khoản dùng chung 2 người: chỉ lưu file trong thư mục mang tên Slot của bạn.\nKhông đổi mật khẩu, email hay thông tin tài khoản.',
  },
  {
    // Khách nhập email Canva của chính họ; bot trên máy Mac của Tiệm (scripts/canva-bot.js) mời vào nhóm, hết giờ tự gỡ.
    // Nhập kho: mỗi dòng 1 nhóm = email chủ nhóm|số ghế.
    slug: 'canva', name: 'Canva Pro', login_type: 'team_invite', login_url: 'https://www.canva.com/login', auto_worker: 1,
    slot_hours: 168, reuse: 'rotate', rotation_required: 0, holders_default: 5, daily_cap: null, lifetime_cap: 2, cooldown_days: 30, sort: 50,
    instructions: 'Đăng nhập Canva bằng tài khoản của chính bạn (email đã nhập).\nThiết kế của bạn vẫn là của bạn; hết giờ chỉ phần Pro bị khoá lại.',
  },
];

/** Kho chuẩn mỗi ngày (chủ chọn 06/10): số tài khoản cần có sẵn. npm run kiem-tra báo khi kho ít hơn. */
export const PILOT_STOCK = {
  chatgpt: { accounts: 3, note: '3 × 8 = 24 khách/ngày' },
  claude: { accounts: 3, note: '2 giao trong ngày (6 khách) + 1 dự phòng sáng sớm (3 khách); mỗi tài khoản dùng 7 ngày → mỗi tuần thay 3 tài khoản' },
};

const DEFAULTS = { high_value: 0, mail_code: 0, auto_worker: 0, end_hour: null, account_days: null, reserve_account: 0, voucher_code: 0, workspace_bot: 0, enabled: 1, code_regex: null };

export function applyPilot(db) {
  for (const t of PILOT_TOOLS) {
    for (const line of [t.name, ...t.instructions.split('\n')]) {
      const problem = freeTextProblem(line);
      if (problem) throw new Error(`"${line}" ${POLICY_MESSAGE[problem]}`);
    }
  }
  const out = [];
  for (const t of PILOT_TOOLS) {
    const p = { ...DEFAULTS, ...t, sender_pattern: DEFAULT_TOOL_PATTERNS[t.slug]?.sender ?? null };
    const existing = get(db, 'SELECT id FROM tools WHERE slug = ?', t.slug);
    const cols = Object.keys(p);
    if (existing) {
      run(db, `UPDATE tools SET ${cols.filter((c) => c !== 'slug').map((c) => `${c} = :${c}`).join(', ')} WHERE slug = :slug`, p);
    } else {
      run(db, `INSERT INTO tools(${cols.join(', ')}) VALUES(${cols.map((c) => `:${c}`).join(', ')})`, p);
    }
    out.push({ ...t, created: !existing });
  }
  const keep = PILOT_TOOLS.map((t) => t.slug);
  const off = all(db, `SELECT slug, name FROM tools WHERE enabled = 1 AND slug NOT IN (${keep.map(() => '?').join(', ')})`, ...keep);
  if (off.length) run(db, `UPDATE tools SET enabled = 0 WHERE slug NOT IN (${keep.map(() => '?').join(', ')})`, ...keep);
  // Kho cũ không hợp kiểu đăng nhập mới (vd. công cụ đổi sang kiểu cần mật khẩu) → không được giao.
  const unusable = all(db, `SELECT a.login_email, t.name FROM accounts a JOIN tools t ON t.id = a.tool_id
    WHERE t.enabled = 1 AND a.status = 'ready' AND NOT ${USABLE_SQL}`);
  return { tools: out, disabled: off, unusable };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('scripts/pilot.js')) {
  const config = loadConfig();
  const db = openDb(config.dbPath);
  const r = applyPilot(db);
  const dur = (h, t) => (t.end_hour != null ? `tới ${t.end_hour}h sáng` : h % 24 === 0 && h >= 48 ? `${h / 24} ngày` : `${h} giờ`);
  console.log('Công cụ chạy thử:');
  for (const t of r.tools) {
    console.log(`  ${t.created ? '+' : '✓'} ${t.name.padEnd(22)} ${dur(t.slot_hours, t).padEnd(11)} ${String(t.holders_default).padStart(2)} khách/tài khoản   ${t.daily_cap != null ? `tối đa ${t.daily_cap} lượt/ngày` : 'theo kho'}`);
  }
  if (r.disabled.length) console.log(`Đã tắt: ${r.disabled.map((t) => t.name).join(', ')} (khách nhắn Zalo cho dịch vụ khác).`);
  if (r.unusable.length) {
    console.log(`\n⚠ ${r.unusable.length} tài khoản trong kho thiếu mật khẩu / khoá 2FA nên sẽ KHÔNG được giao:`);
    for (const a of r.unusable.slice(0, 20)) console.log(`   ${a.name}: ${a.login_email}`);
    console.log('  → Vào Kho tài khoản, mở từng tài khoản để điền mật khẩu / 2FA, hoặc chuyển "Ngừng dùng".');
  }
  console.log(`
Nhập kho ở trang quản trị → Kho tài khoản (mỗi dòng 1 tài khoản, các ô cách nhau bằng |):
  CapCut Pro:     email|mật khẩu            (2 khách, 7 ngày, dùng xong tự bỏ — nạp 10 tài khoản mới / ngày)
  ⚠ CapCut / Adobe / Claude tự hết Pro 7 ngày kể từ lúc TẠO: nhập kho ngay ngày tạo; khách nhận muộn thì chỉ còn phần còn lại.
  ChatGPT Plus:   email                     (8 khách, dùng tới 6h sáng — mã đăng nhập về email @tiembanquyen.site của Tiệm; tạo sẵn 8 Project "Slot 1" … "Slot 8"
                                            rồi BỎ tick "chờ tạo Project" khi nhập; 6h làm mới ở trang Việc tay)
                  Khách lấy mã đăng nhập cần mã phiếu: tạo ở trang Mã phiếu, in phát ở quán. Tắt Memory của tài khoản (Settings → Personalization).
                  Kho chuẩn: 3 tài khoản = 24 khách/ngày.
  Claude Pro:     email                     (lấy mã cần mã phiếu; 3 khách, dùng tới 6h sáng; 6h: Đăng xuất mọi thiết bị; quá 7 ngày từ lúc tạo thì bỏ — mã đăng nhập về email của Tiệm; tạo sẵn Project "Slot 1" … "Slot 3")
                  Kho chuẩn: 3 tài khoản = 2 giao trong ngày (6 khách) + 1 dự phòng cho 6h sáng (3 khách). Mỗi tài khoản dùng 7 ngày → mỗi tuần thay 3 tài khoản.
  ChatGPT / Claude nghỉ nhận 5h–6h sáng (Cài đặt: endHourCloseMin = 60 phút).
  Gemini Pro:     mỗi dòng 1 link tham gia (https://…) hoặc 1 mã
  Adobe:          email|mật khẩu            (2 khách, 7 ngày, dùng xong tự bỏ — tạo sẵn thư mục "Slot 1", "Slot 2")
  Canva Pro:      email chủ nhóm|số ghế     (7 ngày; bot trên máy Mac mời / gỡ: npm run canva-bot)
  Dịch vụ khác: khách bấm "Cần công cụ khác? Liên hệ Tiệm".`);
  db.close();
}

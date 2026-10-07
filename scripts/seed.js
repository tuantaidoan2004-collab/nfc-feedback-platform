// Tạo dữ liệu ban đầu. Chạy lại nhiều lần an toàn (không tạo trùng).
//   npm run seed            → thêm danh sách công cụ mặc định
//   npm run seed -- --demo  → thêm 1 quán demo có QS (mã quán QS "quan-demo"), 1 quán demo chưa dùng QS (3 thẻ NFC riêng),
//                             vài tài khoản giả để chạy thử trên máy
import { loadConfig } from '../src/config.js';
import { openDb, get, all, run } from '../src/db/index.js';
import { randomToken, encrypt } from '../src/lib/crypto.js';
import { DEFAULT_TOOL_PATTERNS } from '../src/domain/mail.js';
import { loadSettings } from '../src/lib/settings.js';

const TOOLS = [
  { slug: 'chatgpt', name: 'ChatGPT Plus', login_type: 'email_code', login_url: 'https://chatgpt.com/auth/login', high_value: 1,
    instructions: 'Chọn "Tiếp tục với email", KHÔNG chọn Google/Apple/Microsoft.\nKhông đổi tên, mật khẩu hay cài đặt bảo mật.\nKhông lưu thông tin riêng tư trong lịch sử chat — người dùng sau có thể thấy.' },
  { slug: 'claude', name: 'Claude Pro', login_type: 'email_code', login_url: 'https://claude.ai/login', high_value: 1,
    instructions: 'Chọn "Tiếp tục với email" và dùng mã xác minh (không bấm link).\nKhông lưu thông tin riêng tư trong hội thoại.' },
  { slug: 'capcut', name: 'CapCut Pro', login_type: 'password', login_url: 'https://www.capcut.com/login',
    instructions: 'Đăng nhập bằng email + mật khẩu.\nChỉ đăng nhập trên 1 thiết bị để nhường slot cho bạn sau.' },
];

const now = Date.now();
const config = loadConfig();
const db = openDb(config.dbPath);
const demo = process.argv.includes('--demo');

let added = 0;
for (const [i, t] of TOOLS.entries()) {
  if (get(db, 'SELECT 1 FROM tools WHERE slug = ?', t.slug)) continue;
  run(db, `INSERT INTO tools(slug, name, login_type, login_url, instructions, sender_pattern, slot_hours, cooldown_days, lifetime_cap, rotation_required, high_value, enabled, sort, holders_default)
           VALUES(:slug, :name, :login_type, :login_url, :instructions, :sender, 24, 30, 2, :rotation_required, :high_value, 1, :sort, :holders_default)`,
  { rotation_required: 1, high_value: 0, holders_default: 1, ...t, sender: DEFAULT_TOOL_PATTERNS[t.slug]?.sender ?? null, sort: (i + 1) * 10 });
  added++;
}
console.log(`Công cụ: thêm ${added}, đã có ${TOOLS.length - added}.`);

if (demo) {
  const ticketTtl = loadSettings(db).ticketTtlMin;
  let cafe = get(db, "SELECT * FROM cafes WHERE name = 'Quán Demo 24h'");
  if (!cafe) {
    // display_token / code_secret: cột cũ (màn hình quầy), không dùng nữa nhưng vẫn bắt buộc trong bảng.
    const id = run(db, `INSERT INTO cafes(name, address, qs_slug, display_token, code_secret, presence_mode, daily_quota, created_at)
                        VALUES('Quán Demo 24h', '123 Đường Demo', 'quan-demo', ?, ?, 'none', 20, ?)`, randomToken(18), randomToken(24), now).lastInsertRowid;
    cafe = get(db, 'SELECT * FROM cafes WHERE id = ?', id);
  }
  const tool = (slug) => get(db, 'SELECT id FROM tools WHERE slug = ?', slug).id;
  const accounts = [
    ['chatgpt', 'gpt-demo1@kho.local', null, 1],
    ['chatgpt', 'gpt-demo2@kho.local', null, 1],
    ['claude', 'claude-demo1@kho.local', null, 1],
    ['capcut', 'capcut-demo1@kho.local', 'MatKhauDemo#1', 1],
  ];
  for (const [slug, email, pw, max] of accounts) {
    if (get(db, 'SELECT 1 FROM accounts WHERE login_email = ?', email)) continue;
    run(db, "INSERT INTO accounts(tool_id, login_email, password_enc, max_holders, status, created_at) VALUES(?, ?, ?, ?, 'ready', ?)",
      tool(slug), email, pw ? encrypt(pw, config.dataKey) : null, max, now);
  }
  console.log(`\nQuán demo: ${cafe.name} (mã quán QS: ${cafe.qs_slug})`);
  console.log(`  Link như nút trên trang quán QS (dùng được ${ticketTtl} phút): npm run ve -- ${cafe.qs_slug}`);
  // Quán chưa dùng QS → thẻ NFC riêng của Tiệm trên bàn.
  let plain = get(db, "SELECT * FROM cafes WHERE name = 'Quán Demo Thẻ NFC'");
  if (!plain) {
    const id = run(db, `INSERT INTO cafes(name, address, display_token, code_secret, presence_mode, daily_quota, created_at)
                        VALUES('Quán Demo Thẻ NFC', '456 Đường Demo', ?, ?, 'none', 20, ?)`, randomToken(18), randomToken(24), now).lastInsertRowid;
    plain = get(db, 'SELECT * FROM cafes WHERE id = ?', id);
    for (let i = 1; i <= 3; i++) {
      run(db, "INSERT INTO cards(cafe_id, token, kind, label, created_at) VALUES(?, ?, 'nfc', ?, ?)", plain.id, randomToken(9), `Bàn ${i}`, now);
    }
  }
  console.log(`\nQuán demo chưa dùng QS: ${plain.name} — thẻ NFC riêng:`);
  for (const k of all(db, "SELECT * FROM cards WHERE cafe_id = ? AND kind = 'nfc' ORDER BY id", plain.id)) {
    console.log(`  ${k.label}: ${config.baseUrl}/c/${k.token}`);
  }
  console.log('  Giả chip có bộ đếm: thêm ?m=04A1B2C3D4E5F6x000001 (mỗi lần "chạm" tăng số cuối lên 1).');
  console.log(`\nQuản trị: ${config.baseUrl}/admin (mật khẩu: ADMIN_PASSWORD trong .env${config.isProd ? '' : ', mặc định khi phát triển là "admin"'})`);
  console.log('Giả lập thư mã: npm run fake-mail -- gpt-demo1@kho.local 123456');
}
db.close();

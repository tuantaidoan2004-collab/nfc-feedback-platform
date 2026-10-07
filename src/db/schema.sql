-- Schema cho hệ thống trải nghiệm 1 ngày. Mọi thời gian là unix milliseconds (INTEGER).
-- Chạy lại nhiều lần an toàn (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL                -- JSON
);

CREATE TABLE IF NOT EXISTS kv (       -- trạng thái kỹ thuật, ví dụ token Zalo
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS cafes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  -- 3 cột dưới + display_ip/display_seen_at: của màn hình quầy / mã quầy / Wi-Fi cũ. Từ 05/10 Tiệm không đặt gì ở quán
  -- (khách chứng minh ở quán bằng vé từ trang quán QS, bảng qs_tickets) → không dùng nữa, giữ để database cũ vẫn mở được.
  display_token TEXT NOT NULL UNIQUE,
  code_secret TEXT NOT NULL,
  presence_mode TEXT NOT NULL DEFAULT 'code_or_wifi',
  daily_quota INTEGER NOT NULL DEFAULT 20,   -- số slot mới tối đa mỗi ngày tại quán
  open_hour INTEGER,                         -- NULL = mở 24h
  close_hour INTEGER,
  display_ip TEXT,
  display_seen_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active',     -- active | paused
  qs_slug TEXT,                              -- mã quán trên Quite Sensational (trang khách quitesensational.../<slug>)
  paused_by TEXT,                            -- ai tạm dừng: qs (Tài bấm Đóng ở /gov, qua API) | admin (chủ). QS chỉ mở lại quán do QS dừng
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  cafe_id INTEGER NOT NULL REFERENCES cafes(id),
  token TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'nfc',          -- qs: lối vào từ khối "Công cụ làm việc" trên trang quán QS (1/quán, ẩn). nfc: thẻ NFC riêng của Tiệm (quán chưa có QS)
  label TEXT,                                -- "Bàn 5"
  nfc_uid TEXT,                              -- tuỳ chọn: UID chip (nếu bật UID mirror)
  last_counter INTEGER,                      -- tuỳ chọn: bộ đếm chạm NTAG21x (nếu bật counter mirror)
  status TEXT NOT NULL DEFAULT 'active',     -- active | locked
  lock_reason TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS taps (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id),
  cafe_id INTEGER NOT NULL,
  device_id TEXT,
  ip TEXT,
  counter INTEGER,
  verdict TEXT NOT NULL,                     -- ok | replay | jump | forged | locked | closed
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS taps_card_time ON taps(card_id, created_at);
CREATE INDEX IF NOT EXISTS taps_device_time ON taps(device_id, created_at);

-- Vé từ trang quán QS (src/domain/ticket.js): mỗi vé dùng trên đúng 1 máy. Máy đầu tiên mở link có vé giữ vé đó;
-- máy khác mở lại cùng link (khách gửi link cho bạn ở nhà) bị từ chối. Dọn sau 2 ngày (jobs.js).
CREATE TABLE IF NOT EXISTS qs_tickets (
  nonce TEXT PRIMARY KEY,
  cafe_id INTEGER NOT NULL REFERENCES cafes(id),
  device_id TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  used_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tools (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,                 -- chatgpt, claude, capcut, ...
  name TEXT NOT NULL,
  login_type TEXT NOT NULL,                  -- email_code | password | password_totp | team_invite | redeem
  login_url TEXT,
  instructions TEXT,                         -- hướng dẫn hiện cho khách
  sender_pattern TEXT,                       -- regex (không phân biệt hoa thường) cho địa chỉ gửi thư mã
  code_regex TEXT,                           -- regex có 1 nhóm bắt (capture group) lấy mã
  slot_hours INTEGER NOT NULL DEFAULT 24,
  cooldown_days INTEGER NOT NULL DEFAULT 30, -- chờ bao lâu mới được nhận lại công cụ này
  lifetime_cap INTEGER NOT NULL DEFAULT 2,   -- tối đa số lần nhận công cụ này / khách
  rotation_required INTEGER NOT NULL DEFAULT 1,
  reuse TEXT NOT NULL DEFAULT 'rotate',      -- rotate: hết lượt thì đổi mật khẩu rồi giao lại | once: mỗi chỗ chỉ giao 1 lần rồi bỏ tài khoản
  mail_code INTEGER NOT NULL DEFAULT 0,      -- loại mật khẩu mà hãng hay gửi mã qua email (vd. Adobe) → có nút "Lấy mã"
  daily_cap INTEGER,                         -- số lượt tối đa / ngày cho cả hệ thống (NULL = không giới hạn)
  holders_default INTEGER NOT NULL DEFAULT 1,-- số khách / tài khoản khi nhập kho mà dòng không ghi
  auto_worker INTEGER NOT NULL DEFAULT 0,
  end_hour INTEGER,                          -- lượt hết lúc giờ này (giờ VN) lần tới, vd. 6 = 6h sáng hôm sau; NULL = đủ slot_hours
  account_days INTEGER,                      -- tài khoản tự hết Pro sau số ngày này kể từ lúc nhập kho (CapCut / Adobe / Claude); NULL = không hết    -- team_invite: bot trên máy chủ tiệm tự mời / gỡ (API /worker)
  reserve_account INTEGER NOT NULL DEFAULT 0,-- 1 = giữ 1 tài khoản không ai dùng làm dự phòng; chỉ giao khi có tài khoản đang chờ "Đăng xuất mọi thiết bị" (6h sáng)
  voucher_code INTEGER NOT NULL DEFAULT 0,   -- 1 = lấy mã đăng nhập cần mã phiếu (ChatGPT / Claude dùng chung)
  workspace_bot INTEGER NOT NULL DEFAULT 0,  -- 1 = việc "làm mới" mỗi ngày giữ Project của khách đã gia hạn (chủ làm tay ở trang Việc tay)
  high_value INTEGER NOT NULL DEFAULT 0,     -- công cụ đắt: cộng điểm rủi ro giờ cao điểm
  enabled INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  tool_id INTEGER NOT NULL REFERENCES tools(id),
  label TEXT,
  login_email TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- cũng là hộp thư nhận mã
  password_enc TEXT,                         -- AES-GCM, cho login_type=password | password_totp
  totp_enc TEXT,                             -- AES-GCM: khoá 2FA (login_type=password_totp), KHÔNG bao giờ gửi cho khách
  max_holders INTEGER NOT NULL DEFAULT 1,    -- số khách dùng cùng lúc (team_invite: số ghế trong nhóm)
  status TEXT NOT NULL DEFAULT 'ready',      -- ready | needs_rotation | quarantined | retired
  status_reason TEXT,
  last_assigned_at INTEGER,
  last_rotated_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,                -- dạng 84xxxxxxxxx
  status TEXT NOT NULL DEFAULT 'active',     -- active | locked
  lock_reason TEXT,
  locked_until INTEGER,                      -- NULL = khoá vĩnh viễn (khi status=locked)
  strikes INTEGER NOT NULL DEFAULT 0,
  risk INTEGER NOT NULL DEFAULT 0,           -- điểm rủi ro tích luỹ (giảm dần theo ngày)
  risk_updated_at INTEGER,
  consent_at INTEGER NOT NULL,
  consent_version TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,                       -- mã ngẫu nhiên trong cookie "did"
  fp TEXT,                                   -- dấu vết nhẹ (chỉ trên web của mình)
  status TEXT NOT NULL DEFAULT 'active',     -- active | locked
  risk INTEGER NOT NULL DEFAULT 0,
  risk_updated_at INTEGER,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER
);

CREATE TABLE IF NOT EXISTS device_customers (
  device_id TEXT NOT NULL,
  customer_id INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, customer_id)
);

CREATE TABLE IF NOT EXISTS otps (
  id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  device_id TEXT,
  ip TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS otps_phone ON otps(phone, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                       -- sha256 của token trong cookie "sid"
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  device_id TEXT NOT NULL,
  presence_ok_at INTEGER,                    -- 3 cột presence_*: của mã quầy / Wi-Fi cũ, không dùng nữa
  presence_method TEXT,
  presence_cafe_id INTEGER,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,                       -- sha256 của token
  csrf TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  tool_id INTEGER NOT NULL REFERENCES tools(id),
  account_id INTEGER REFERENCES accounts(id),   -- NULL khi đang chờ duyệt
  cafe_id INTEGER NOT NULL,
  card_id INTEGER,
  device_id TEXT NOT NULL,                   -- máy đã gắn
  status TEXT NOT NULL,                      -- pending_approval (tạm, trong lúc nhận) | pending_invite (chờ bot mời vào nhóm) | active | expired | revoked | rejected
  invite_email TEXT,                         -- team_invite: email tài khoản của chính khách
  risk_score INTEGER NOT NULL DEFAULT 0,
  risk_reasons TEXT,                         -- JSON
  code_requests INTEGER NOT NULL DEFAULT 0,
  password_shown_at INTEGER,
  seat INTEGER,                              -- tài khoản dùng chung: khách là "Slot <seat>" (dùng đúng Project/hồ sơ của mình)
  redeem_id INTEGER,                         -- login_type=redeem: mã/link đã giao
  totp_until INTEGER,                        -- đang được xem mã 2FA đến lúc này
  totp_device TEXT,                          -- máy được xem mã 2FA
  extended_days INTEGER NOT NULL DEFAULT 0,  -- số ngày đã gia hạn
  code_free INTEGER NOT NULL DEFAULT 0,      -- 1 = đã gia hạn: lấy mã không cần mã phiếu, không cần đang ở quán
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  expires_at INTEGER,
  ended_at INTEGER,
  end_reason TEXT
);
CREATE INDEX IF NOT EXISTS slots_customer ON slots(customer_id, status);
CREATE INDEX IF NOT EXISTS slots_account ON slots(account_id, status);
CREATE INDEX IF NOT EXISTS slots_cafe_time ON slots(cafe_id, created_at);
CREATE INDEX IF NOT EXISTS slots_device ON slots(device_id, status);

CREATE TABLE IF NOT EXISTS code_windows (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  slot_id INTEGER NOT NULL REFERENCES slots(id),
  customer_id INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL,                      -- open | delivered | expired | cancelled
  opened_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  code TEXT,                                 -- xoá sau khi hết hạn
  code_received_at INTEGER,
  shown_at INTEGER,
  mail_id INTEGER
);
-- Mỗi tài khoản chỉ có 1 lượt "Lấy mã" đang mở → mỗi mã về khớp đúng 1 người.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_window_per_account ON code_windows(account_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS mails (
  id INTEGER PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,           -- message-id hoặc hash nội dung
  account_id INTEGER,
  to_addr TEXT,
  from_addr TEXT,
  subject TEXT,
  body TEXT,                                 -- nội dung thô, xoá sau thời hạn lưu
  kind TEXT NOT NULL,                        -- login_code | magic_link | password_reset | security_alert | billing | other | unknown_recipient
  code TEXT,
  window_id INTEGER,
  verdict TEXT,                              -- matched | orphan | quarantined | alerted | ignored | parse_failed
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mails_account_time ON mails(account_id, received_at);


CREATE TABLE IF NOT EXISTS rotation_tasks (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  slot_id INTEGER,
  kind TEXT NOT NULL,                        -- rotate (đổi mật khẩu + đăng xuất) | invite_member | remove_member (bot Canva)
  reason TEXT NOT NULL,                      -- slot_expired | slot_revoked | quarantine | claim | manual
  detail TEXT,                               -- invite_member / remove_member: email cần mời / gỡ
  lease_until INTEGER,                       -- bot đang giữ việc này tới lúc này
  worker TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  alerted_at INTEGER,                        -- đã báo chủ (bot chưa làm xong / làm hỏng)
  status TEXT NOT NULL DEFAULT 'todo',       -- todo | done | cancelled
  created_at INTEGER NOT NULL,
  done_at INTEGER,
  done_by TEXT
);
CREATE INDEX IF NOT EXISTS rotation_status ON rotation_tasks(status, account_id);

-- Mã / link nhận quà dùng 1 lần (login_type=redeem, vd. Gemini Pro): mỗi dòng giao cho đúng 1 khách.
CREATE TABLE IF NOT EXISTS redeem_codes (
  id INTEGER PRIMARY KEY,
  tool_id INTEGER NOT NULL REFERENCES tools(id),
  value TEXT NOT NULL,                       -- mã hoặc link https
  label TEXT,
  status TEXT NOT NULL DEFAULT 'ready',      -- ready | given | void
  slot_id INTEGER,
  created_at INTEGER NOT NULL,
  given_at INTEGER,
  UNIQUE (tool_id, value)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',     -- info | yellow | red
  customer_id INTEGER,
  device_id TEXT,
  card_id INTEGER,
  cafe_id INTEGER,
  account_id INTEGER,
  slot_id INTEGER,
  ip TEXT,
  data TEXT,                                 -- JSON
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_time ON events(created_at);
CREATE INDEX IF NOT EXISTS events_sev_time ON events(severity, created_at);
CREATE INDEX IF NOT EXISTS events_customer ON events(customer_id, created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

-- Mã phiếu (docs/design-ma-phieu-workspace.md): khách cần mã phiếu mới lấy được mã đăng nhập (công cụ bật tools.voucher_code),
-- hoặc dùng mã gia hạn để dùng thêm ngày. Phát ở quán (in phiếu) hoặc chủ gửi qua Zalo.
CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,                 -- 8 ký tự, lưu không gạch, chữ hoa
  kind TEXT NOT NULL,                        -- once (lấy mã 1 lần) | forever (lấy mã không giới hạn, gắn SĐT đầu tiên) | extend (gia hạn N ngày, 1 lần)
  days INTEGER,                              -- extend: số ngày gia hạn
  tools TEXT,                                -- slug cách nhau dấu phẩy; NULL = mọi công cụ hợp lệ
  cafe_id INTEGER,                           -- NULL = mọi quán
  batch TEXT NOT NULL,                       -- lô tạo cùng lúc (để in / xuất CSV)
  note TEXT,
  max_uses INTEGER,                          -- NULL = không giới hạn
  uses INTEGER NOT NULL DEFAULT 0,
  customer_id INTEGER,                       -- forever: SĐT đã gắn
  device_id TEXT,                            -- phiếu tự động khi chạm thẻ (lô tu-dong-…): chỉ máy này dùng được
  status TEXT NOT NULL DEFAULT 'active',     -- active | used | void
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS vouchers_batch ON vouchers(batch);
CREATE INDEX IF NOT EXISTS vouchers_customer ON vouchers(customer_id) WHERE customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS voucher_uses (
  id INTEGER PRIMARY KEY,
  voucher_id INTEGER NOT NULL REFERENCES vouchers(id),
  customer_id INTEGER NOT NULL,
  slot_id INTEGER,
  device_id TEXT,
  purpose TEXT NOT NULL,                     -- code | extend
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS voucher_uses_voucher ON voucher_uses(voucher_id);

-- Workspace (Project) trên tài khoản dùng chung: chỗ n ↔ Project "<tiền tố> n". Bot ChatGPT ghi link sau khi tạo.
CREATE TABLE IF NOT EXISTS workspaces (
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  seat INTEGER NOT NULL,
  name TEXT NOT NULL,
  url TEXT,                                  -- link mở thẳng Project (https://chatgpt.com/…); NULL = chỉ có tên
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, seat)
);

-- Khách xin dùng thêm (gia hạn) mà chưa có mã gia hạn → chủ xem ở trang Gia hạn.
CREATE TABLE IF NOT EXISTS extend_requests (
  id INTEGER PRIMARY KEY,
  slot_id INTEGER NOT NULL REFERENCES slots(id),
  customer_id INTEGER NOT NULL,
  days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | done | declined | cancelled
  created_at INTEGER NOT NULL,
  done_at INTEGER,
  done_by TEXT
);
CREATE INDEX IF NOT EXISTS extend_requests_status ON extend_requests(status, created_at);

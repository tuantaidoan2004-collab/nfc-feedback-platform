# CONTRACT — đặc tả kỹ thuật nội bộ (cho người viết code)

Hệ thống: trải nghiệm miễn phí 1 công cụ trong 1 ngày tại quán cà phê 24h, khách vào bằng thẻ NFC trên bàn.
Chủ: Tiệm Bản Quyền (bán tài khoản số qua Zalo). Toàn bộ chữ hiển thị cho người dùng: **tiếng Việt có dấu**, câu ngắn, thân thiện.

> **Phiên 11 (05/10/2026) — thắng khối phiên 10 bên dưới nếu khác.** Chủ tiệm có đặt thẻ NFC ở quán → **2 lối vào**:
> (1) quán có QS → vé từ trang quán (như phiên 10); (2) quán chưa có QS → **thẻ NFC riêng của Tiệm quay lại**: `GET /c/:token`
> (chỉ `cards.kind='nfc'`) → `presence.processTap` (UID + bộ đếm mirror của chip NTAG21x: bộ đếm không tăng → `replay`, UID lạ → `forged`,
> tăng quá `tapCounterMaxJump` → `jump`; tải lại cùng máy + cùng bộ đếm trong `entryTtlMin` → `ok`) + `checkCardAnomaly`
> (`cardTapsPerHourAlert` → báo vàng, `cardTapsPerHourLock` → tự khoá). Chỉ verdict `ok` / `jump` là lượt vào (`latestEntry`).
> Vẫn **không** có màn hình quầy, mã quầy, Wi-Fi; chủ quán không làm gì. `quota.card_quota` (`cardDailyClaims` / thẻ nfc / ngày) quay lại.
> `lockCard` / `unlockCard` chỉ tác dụng với thẻ `nfc` (lối vào QS ẩn là của cả quán → dùng "Tạm dừng" quán). Telegram: nút
> Khoá / Mở thẻ (`lk:` / `uk:`) chỉ hiện cho thẻ `nfc`. Quản trị: mã quán QS **không bắt buộc** (trống = bỏ gắn QS); trang quán có
> "Thẻ NFC riêng của Tiệm" (tạo hàng loạt, CSV, khoá / mở / đổi link). Thống kê: bảng "Theo lối vào" (`cafeReport.byCard`).
> `server.isCustomerPath` gồm lại `/c/*`.
>
> **Thiết kế lại 05/10/2026 (phiên 10) — thắng mọi mục bên dưới nếu khác.** Tiệm không đặt gì ở quán và không xin quán quyền gì.
> Đã **bỏ**: màn hình quầy (`/quan/*`, `src/routes/display.js`), mã quầy 4 số, nhận diện Wi-Fi, thẻ NFC riêng (`/c/<token>`, `processTap`,
> UID / bộ đếm chip, `card_quota`, khoá thẻ), lối vào `/qs` không mã quán và `?shop=` / `?quan=`, `checkPresence` / `markPresence` / `hasFreshPresence`,
> `need_presence`. Cột `cafes.display_token/code_secret/presence_mode/display_*`, `sessions.presence_*`, `cards.nfc_uid/last_counter` còn trong bảng nhưng không dùng.
> **Thay bằng vé** (`src/domain/ticket.js`): trang quán QS gắn `?t=1.<giây>.<nonce>.<HMAC 32 ký tự>` vào nút khi khách vào bằng thẻ / QR;
> `GET /qs/:shop?t=` → `useTicket` (đúng chữ ký `QS_TICKET_KEY`, đúng quán, ≤ `ticketTtlMin` phút, mỗi nonce 1 máy — bảng `qs_tickets`)
> → `recordEntry` (bảng `taps`, lối vào QS ẩn của quán) → chuyển về `/qs/:shop`. `startClaim` và việc **mở lượt mã mới** (`requestCode`)
> cần `latestEntry` còn hạn (`entryTtlMin`), không có → `{status:'need_entry'}`. ~~Quán thêm trong quản trị bắt buộc có mã quán QS~~ (phiên 11: không bắt buộc).

## 0. Quy ước bắt buộc

- Node.js >= 22.13, **ESM thuần JavaScript**, **không dùng thư viện ngoài** (không npm install). Chỉ dùng `node:*` và `fetch` có sẵn.
- DB: `node:sqlite` qua helper trong `src/db/index.js`: `get(db, sql, ...params)`, `all(...)`, `run(...)` → `{changes, lastInsertRowid}`, `tx(db, fn)`.
  - Tham số: vị trí (`?`) hoặc 1 object (`:name`). `undefined`→NULL, boolean→0/1 tự động.
  - `tx(db, fn)`: fn **đồng bộ**, **không await bên trong**. Kiểm tra + ghi phải nằm trong cùng 1 tx (chống 2 yêu cầu song song).
  - Thời gian: unix **milliseconds** lấy từ `ctx.now()` — **không gọi Date.now() trong domain** (test điều khiển đồng hồ).
- Mọi hàm domain nhận `ctx` làm tham số đầu: `{db, config, settings(), now(), notify, otp, log(level,msg,data)}` (xem `src/ctx.js`).
  - `ctx.settings()` trả object tham số (xem `src/lib/settings.js`, `SETTING_DEFS`). Ví dụ `ctx.settings().codeWindowSec`.
  - `ctx.notify.*` là async và **không ném lỗi**. Gọi kiểu fire-and-forget **sau khi tx đã commit**: `ctx.notify.alert({...})` (không cần await, nhưng được phép await ở tầng route).
- Nhật ký: `logEvent(ctx, {type, severity:'info'|'yellow'|'red', customerId, deviceId, cardId, cafeId, accountId, slotId, ip, data})` (`src/lib/events.js`).
- Rate limit: `hit(ctx, key, limit, windowMs)` / `peek(ctx, key, limit)` / `reset(ctx, key)` (`src/lib/ratelimit.js`).
- Crypto: `randomToken(bytes)`, `randomDigits(n)`, `sha256(s)`, `hmac(key, data)`, `safeEqual(a,b)`, `encrypt(plain, ctx.config.dataKey)`, `decrypt(enc, key)` (`src/lib/crypto.js`).
- Thời gian địa phương: `localDayKey`, `startOfLocalDay(ms, offset)`, `startOfLocalMonth`, `localHour`, `inHourRange`, `fmtLocal`, hằng `MIN/HOUR/DAY` (`src/lib/time.js`). offset = `ctx.settings().timezoneOffsetMin` (420).
- SĐT: `normalizePhone(input)` → `'84xxxxxxxxx'|null`, `displayPhone`, `maskPhone` (`src/lib/phone.js`).
- HTML: `html\`...\`` tự escape, `raw(s)` cho HTML tin cậy, `escapeHtml` (`src/lib/http.js`). **Không bao giờ** nối chuỗi HTML với dữ liệu người dùng mà không qua `html```.
- Route handler: `async (rq) => {...}` — xem doc của `createRq` trong `src/lib/http.js`. Ném `new HttpError(status, message, code)` để trả lỗi.
- Test: `node:test` + `node:assert/strict`, file `test/<tên>.test.js`, dùng `test/helpers.js` (`createTestCtx`, `seed`, `makeCustomer`, `makeDevice`, `makeSession`, `makeTap`, `byId`, `T0`). `ctx.notified` ghi lại các lời gọi notifier: `{name, arg}`. `ctx.otpSent` ghi lại OTP đã gửi. Chạy: `npm test`.
- Đã có sẵn (đừng sửa trừ khi thật cần, nếu sửa phải giữ tương thích): `src/db/*`, `src/lib/*`, `src/ctx.js`, `src/config.js`, `src/domain/presence.js`, `test/helpers.js`.

## 1. Mô hình

- **cafes**: quán đối tác. `presence_mode`: `code_or_wifi` (mặc định) | `code` | `wifi` | `none`. `display_token` = link màn hình quầy `/quan/<token>`.
- **cards**: thẻ NFC (chip thường, link cố định `/c/<token>`). Link chỉ cho biết khách vào từ thẻ/quán nào, **không** chứng minh đang ở quán.
- **taps**: mỗi lần mở link thẻ. "Entry" = lượt chạm hợp lệ gần nhất của máy trong `entryTtlMin` (xem `latestEntry`).
- **tools**: công cụ. `login_type`:
  - `email_code`: tài khoản dùng chung, đăng nhập bằng mã gửi về email kho → hệ thống bắt mã và chỉ hiện cho đúng người.
  - `password`: tài khoản dùng chung có mật khẩu (mã hoá trong `accounts.password_enc`), hiện cho khách trên máy đã gắn. Hết hạn → việc tay "đổi mật khẩu".
  - `team_invite`: khách dùng **tài khoản của chính họ**, chủ mời vào gói Team (việc tay), hết hạn thì gỡ (việc tay). Đúng điều khoản nhà cung cấp — cách khuyến nghị.
- **accounts**: tài khoản trong kho. `status`: `ready` | `needs_rotation` | `quarantined` | `retired`. `max_holders` = số khách cùng lúc (team: số ghế).
- **customers** (định danh bằng SĐT đã xác minh OTP), **devices** (cookie `did`), **device_customers** (máy ↔ SĐT).
- **sessions**: cookie `sid` (lưu sha256). `presence_ok_at/method/cafe_id` = lần gần nhất chứng minh ở quán.
- **slots**: 1 lượt trải nghiệm. `status`: `pending_approval` | `pending_invite` | `active` | `expired` | `revoked` | `rejected`. Gắn với `device_id` (1 máy).
- **code_windows**: lượt "Lấy mã" (mặc định 180 giây). **Mỗi tài khoản chỉ 1 lượt `open`** (unique index) → mỗi mã về khớp đúng 1 người.
- **mails**: thư đẩy về từ dịch vụ mail. **approvals**: ca cần chủ duyệt. **rotation_tasks**: việc tay (`rotate` | `invite_member` | `remove_member`). **events**: nhật ký/tín hiệu rủi ro.

## 2. Luồng chính

1. Khách chạm thẻ → `GET /c/<token>` → `processTap` (ghi taps) → trang nhận quà.
2. Nhập SĐT + tick đồng ý → `POST /api/otp/send` → OTP qua Zalo ZNS → `POST /api/otp/verify` → phiên đăng nhập.
3. Chọn công cụ → `POST /api/claim` → `startClaim`: entry còn hạn → chứng minh ở quán (Wi-Fi trùng IP màn hình quầy, hoặc mã quán 4 số) → hạn mức cứng → điểm rủi ro → xanh (cấp ngay) / vàng (chờ chủ duyệt qua Telegram) / đỏ (từ chối).
4. `GET /me`: slot, đếm ngược. `email_code`: bấm **Lấy mã** (`POST /api/code/request`) → mở lượt 3 phút → khách vào trang công cụ, nhập email kho, bấm gửi mã → dịch vụ mail đẩy thư về `POST /hooks/mail` → `ingestMail` → khớp lượt đang mở → `GET /api/code/status/:id` trả mã.
5. Mã về mà **không có lượt nào mở** = "mã mồ côi" → không hiện cho ai, báo đỏ (có người biết email đang tự đăng nhập — thường là khách cũ ở nhà).
6. Thư bảo mật (đổi mật khẩu/email/bật 2FA) → cách ly tài khoản, thu hồi slot, báo đỏ.
7. Hết hạn → `expireDueSlots` → việc tay đổi mật khẩu/đăng xuất (hoặc gỡ thành viên Team) → chủ bấm "Xong" → tài khoản về `ready`.

## 3. API từng module

### 3.1 `src/domain/presence.js` (ĐÃ CÓ)
`cafeCode(cafe, nowMs, settings)` → `{code, expiresAt, periodSec}` · `verifyCafeCode(cafe, input, nowMs, settings)` → bool ·
`isCafeOpen(cafe, nowMs, offset)` · `wifiMatch(cafe, ip, nowMs, settings)` · `recordDisplayPing(ctx, cafe, ip)` ·
`checkPresence(ctx, {cafe, ip, deviceId, customerId?, cafeCodeInput?})` → `{ok:true, method:'wifi'|'code'|'none'}` | `{ok:false, error:'cafe_paused'|'cafe_closed'|'need_proof'|'code_wrong'|'too_many_attempts', canCode, canWifi}` ·
`processTap(ctx, {card, cafe, query, deviceId, ip})` → `{tapId, verdict, riskPoints, counter}` ·
`latestEntry(ctx, deviceId)` → `{tapId, cardId, cafeId, verdict, riskPoints, at}|null` · `TAP_RISK` ·
`markPresence(ctx, sessionId, {method, cafeId})` · `hasFreshPresence(ctx, session, cafeId?)` → bool (trong `presenceTtlMin`; truyền cafeId thì phải cùng quán) · `deviceOtherPhones(ctx, deviceId, customerId)` → số khách KHÁC đã dùng máy này.

Thông điệp cho lỗi presence (dùng chung, export từ `claims.js` là `PRESENCE_MESSAGES`):
- `need_proof`: "Bạn cần đang ở quán: nối Wi-Fi của quán, hoặc nhập mã 4 số hiện ở quầy."
- `code_wrong`: "Mã quầy chưa đúng. Mã đổi mỗi 2 phút, bạn xem lại màn hình ở quầy nhé."
- `too_many_attempts`: "Bạn nhập sai nhiều lần. Thử lại sau 10 phút nhé."
- `cafe_closed`: "Quán đang ngoài giờ trải nghiệm." · `cafe_paused`: "Quán đang tạm dừng chương trình."

### 3.2 `src/domain/auth.js`
- `ensureDevice(ctx, rq)` → `deviceId` (string). Đọc cookie `did` (hợp lệ: `/^[A-Za-z0-9_-]{16,64}$/`); nếu thiếu, thử header `x-device-hint` (localStorage, cùng định dạng) **chỉ khi** máy đó đã có trong DB; nếu không có thì tạo `randomToken(18)`. Upsert `devices` (last_seen_at; `fp` từ header `x-device-fp` nếu là hex 64). Luôn set lại cookie `did` (httpOnly, SameSite=Lax, maxAge 400 ngày). Gán `rq.state.deviceId`, `rq.state.device` (row).
- `issueOtp(ctx, {phone, deviceId, ip})` (async) → `{ok:true, phone, expiresInSec, devCode?}` | `{ok:false, code, message, retryAfterSec?}`; code ∈ `invalid_phone` ("Số điện thoại chưa đúng."), `device_locked`, `customer_locked`, `rate_limited` ("Bạn yêu cầu mã quá nhiều lần. Thử lại sau N phút."), `send_failed` ("Chưa gửi được mã. Thử lại sau ít phút."). Giới hạn: `otpPerPhonePerHour`, `otpPerDevicePerHour`, `otpPerIpPerHour`. Mã 6 số; lưu `code_hash = hmac(config.appSecret, phone+':'+code)`; vô hiệu OTP cũ chưa dùng của SĐT đó. Gửi qua `ctx.otp.send(phone, code)`. `devCode` chỉ trả khi `config.otp.devShow && config.otp.provider==='dev'`.
- Xoá dữ liệu theo yêu cầu (admin): SĐT được thay bằng `phoneTombstone(config.appSecret, phone)` (`src/lib/phone.js`). `verifyOtp` khi tạo khách mới phải tìm khách có `phone = phoneTombstone(...)` trước — có thì dùng lại dòng đó (gán lại SĐT thật, ghi lại đồng ý) để giữ hạn mức cũ.
- `verifyOtp(ctx, {phone, code, deviceId, ip, consent})` → `{ok:true, customer, isNew}` | `{ok:false, code, message}`; code ∈ `invalid` ("Mã chưa đúng."), `expired` ("Mã đã hết hạn, bấm gửi lại nhé."), `too_many_attempts`, `consent_required` ("Bạn cần đồng ý điều khoản để tiếp tục."), `customer_locked` ("Số này đang tạm khoá. Nhắn Zalo Tiệm nếu có nhầm lẫn."). Khách mới hoặc khách có `consent_version` cũ phải `consent=true` (ghi consent_at/version). Ghi `device_customers`. logEvent `login`.
- `createSession(ctx, rq, {customerId, deviceId})` → token; cookie `sid` (httpOnly, Lax, maxAge `sessionDays`).
- `loadSession(ctx, rq)` → `{session, customer}|null`. Null nếu hết hạn, hoặc `session.device_id !== rq.state.deviceId`. Gán `rq.state.session/customer`.
- `logout(ctx, rq)`.
- (Đã có trong `presence.js`, import từ đó:) `markPresence(ctx, sessionId, {method, cafeId})` · `hasFreshPresence(ctx, session, cafeId?)` → bool · `deviceOtherPhones(ctx, deviceId, customerId)`.

### 3.3 `src/domain/risk.js`
- `decayed(points, updatedAt, nowMs, perDay)` (thuần) · `customerRisk(ctx, customer)` · `deviceRisk(ctx, device)`.
- `addRisk(ctx, {customerId?, deviceId?, points, reason})` — áp giảm dần rồi cộng; logEvent `risk_added`.
- `isCustomerLocked(customer, nowMs)` → `status==='locked' && (locked_until==null || locked_until>now)`.
- `addStrike(ctx, customerId, reason)` → `{strikes, locked, until}`. Thang: 1 = nhắc; 2 = khoá 7 ngày; ≥3 = khoá vĩnh viễn.
- `lockCustomer(ctx, customerId, {reason, untilMs=null, by})` (thu hồi slot đang có/chờ) · `unlockCustomer(ctx, customerId, by)` · `lockDevice(ctx, deviceId, reason, by)` · `unlockDevice(ctx, deviceId, by)`.
- `scoreClaim(ctx, {customer, device, tool, cafe, entry, presence, otherPhones, isNewDevice})` → `{score, level:'green'|'yellow'|'red', reasons:[{code, points, text}]}`.
  Điểm: entry.riskPoints (`tap_replay` 40 "Link thẻ bị dùng lại", `tap_jump` 25) · `presence_none` 15 "Quán không yêu cầu chứng minh có mặt" · `device_other_phone` 30 × số SĐT khác ("Máy này đã dùng cho SĐT khác") · `new_device` 10 "Khách quen dùng máy mới" · `customer_risk` = min(50, risk tích luỹ) · `device_risk` = min(50, …) · `strikes` 15 × strikes · `high_value_peak` 10 "Công cụ giá trị cao vào giờ cao điểm" (tool.high_value và giờ trong [peakStartHour, peakEndHour)).
  Mức: `< riskYellow` xanh, `< riskRed` vàng, còn lại đỏ.

### 3.4 `src/domain/quota.js`
- `checkClaimQuota(ctx, {customer, tool, cafe, card, deviceId})` → `{ok:true}` | `{ok:false, code, message}`. Đếm các slot **không** `rejected` và **không** có `end_reason` thuộc `('account_quarantined','no_account','refund')` (lỗi phía Tiệm thì không tính lượt của khách).
  - `has_active_slot` (active/pending_approval/pending_invite ≥ `activeSlotsPerCustomer`): "Bạn đang có 1 slot. Dùng hết hoặc chờ hết hạn rồi nhận tiếp nhé."
  - `daily_limit` (từ 00:00 địa phương): "Mỗi ngày bạn nhận được 1 công cụ. Hẹn bạn ngày mai nhé!"
  - `monthly_limit`: "Bạn đã dùng hết lượt trải nghiệm của tháng này."
  - `cooldown` (cùng tool trong `tool.cooldown_days`): "Bạn đã thử {tool} gần đây. Có thể nhận lại từ {dd/mm}."
  - `lifetime_cap` (cùng tool ≥ `tool.lifetime_cap`): "Bạn đã trải nghiệm {tool} đủ số lần. Nhắn Zalo Tiệm để có giá ưu đãi nhé."
  - `cafe_quota` (slot của quán hôm nay ≥ `cafe.daily_quota`): "Hôm nay quán đã hết suất trải nghiệm. Quay lại ngày mai nhé!"
  - `card_quota` (slot từ thẻ này hôm nay ≥ `cardDailyClaims`): "Thẻ ở bàn này đã hết suất hôm nay. Quay lại ngày mai nhé!" — chặn kiểu chạm thẻ rồi gửi link + mã quầy cho bạn ở nhà để vét suất.
  - `device_busy` (máy đang giữ slot active của SĐT khác): "Máy này đang giữ slot của một số điện thoại khác."
  - `device_phone_limit` (số SĐT khác trên máy ≥ `maxPhonesPerDevice`): "Máy này đã được dùng cho số điện thoại khác."
  - `tool_disabled`: "Công cụ này tạm ngưng."
- `accountLoad(ctx, accountId)` → số chỗ đang dùng = slot `active`/`pending_invite` trên tài khoản + việc `remove_member` chưa xong.
- `pickAccount(ctx, toolId)` → account `ready` còn chỗ (`accountLoad < max_holders`), ưu tiên ít người rồi `last_assigned_at` cũ nhất (NULL trước) | null.
- `toolAvailability(ctx)` → `[{tool, free}]` cho các tool `enabled`, sắp theo `sort`.

### 3.5 `src/domain/claims.js`
- `PRESENCE_MESSAGES` (mục 3.1).
- `startClaim(ctx, {session, customer, deviceId, ip, toolId, cafeCodeInput, inviteEmail})` → một trong:
  `{status:'active', slotId}` · `{status:'pending_approval', slotId, approvalId}` · `{status:'pending_invite', slotId}` ·
  `{status:'rejected', code, message}` · `{status:'unavailable', code:'no_account', message:'Công cụ này tạm hết slot. Chọn công cụ khác hoặc quay lại sau nhé.'}` ·
  `{status:'need_entry', message:'Chạm thẻ NFC trên bàn để bắt đầu nhé.'}` · `{status:'need_presence', error, canCode, canWifi, message}`.
  Thứ tự: khách bị khoá (`customer_locked`) → máy bị khoá (`device_locked`) → `latestEntry` (không có → need_entry) → thẻ/quán hợp lệ (`card_locked` "Thẻ này đang tạm khoá.") → tool bật → team_invite cần email hợp lệ (`invite_email_required` "Nhập email tài khoản {tool} của bạn để Tiệm mời vào nhóm.") → presence (dùng `hasFreshPresence(session, cafe.id)` hoặc `checkPresence`; thành công thì `markPresence`) → `checkClaimQuota` → còn tài khoản (`pickAccount`) → `scoreClaim` → đỏ: lưu slot `rejected` + logEvent `claim_red`, trả `rejected` code `risk_high` "Yêu cầu chưa được chấp nhận. Nếu có nhầm lẫn, nhắn Zalo cho Tiệm nhé." → vàng: theo `yellowPolicy` (`telegram` → slot `pending_approval` + `createApproval`; `reject` → `rejected` code `need_review` "Hiện chưa duyệt được, bạn quay lại sau nhé."; `approve` → như xanh) → xanh: tạo slot + `activateSlot`.
  Kiểm tra hạn mức + tạo slot trong **cùng 1 tx**. Lưu `risk_score`, `risk_reasons` (JSON), `cafe_id`, `card_id`, `device_id`.
- `activateSlot(ctx, slotId)` → `{ok:true}` | `{ok:false, code:'no_account'}`. Gán tài khoản (`pickAccount`), `last_assigned_at`. Tool `team_invite` → status `pending_invite` + việc `invite_member` (detail = invite_email) + `notify.taskCreated`. Còn lại → `active`, `started_at=now`, `expires_at=now+slot_hours`.
- `markInvited(ctx, slotId, by)` → slot `pending_invite` → `active` (bắt đầu tính giờ), việc invite → done.
- `endSlot(ctx, slotId, {status:'expired'|'revoked', reason, by})` → đóng slot, huỷ lượt lấy mã đang mở. Có tài khoản: team_invite → việc `remove_member` (detail = invite_email); tool `rotation_required` → tài khoản `ready`→`needs_rotation` + 1 việc `rotate` (không tạo trùng nếu đã có việc rotate `todo`). `notify.taskCreated` cho việc mới.
- `revokeSlot(ctx, slotId, reason, by)` = `endSlot` status revoked. `expireDueSlots(ctx)` → số slot hết hạn đã xử lý.
- `completeTask(ctx, taskId, {by, newPassword?})` → `{ok, message}`. `rotate`: tài khoản về `ready` khi không còn ai đang giữ và không còn việc rotate khác; `last_rotated_at`; nếu có newPassword thì mã hoá lưu. `invite_member` → `markInvited`. `remove_member` → done.
- `currentSlotView(ctx, customerId, deviceId)` → `null` | `{slotId, status, tool:{id,name,slug,login_type,login_url,instructions}, accountEmail, password, startedAt, expiresAt, inviteEmail, approval:{id, expiresAt}|null, deviceMatches, codeRequests, codeRequestsLeft, openWindow:{id, expiresAt}|null, endedAt, endReason}`. Slot ưu tiên: active/pending_* mới nhất; nếu không có, slot kết thúc trong 24h gần nhất (để hiện lời chào kết thúc). `password` chỉ trả khi login_type `password`, slot active và `deviceMatches` (ghi `password_shown_at`). Slot bị thu hồi vì `account_quarantined` → giao diện xin lỗi: "Tài khoản gặp sự cố nên Tiệm đã thu hồi. Lượt này không tính, bạn có thể nhận lại ngay."

Giao diện slot `email_code` phải nói rõ: khách có thể dùng công cụ trên **laptop**: mở trang đăng nhập của hãng trên laptop, còn mã sẽ hiện trên điện thoại này. "1 máy" nghĩa là chỉ đăng nhập công cụ trên 1 thiết bị.

### 3.6 `src/domain/approvals.js`
- `yellowPolicy(ctx)` → `'telegram'|'reject'|'approve'` (chế độ đêm: nếu `nightStartHour/nightEndHour` đặt và giờ hiện tại trong khoảng → `nightYellowAction`, ngược lại `'telegram'`).
- `createApproval(ctx, {kind:'claim'|'code', slotId, customerId, reasons, score})` → id; `expires_at = now + approvalTimeoutMin`; logEvent `approval_created`; `notify.approvalCreated(id)`.
- `decideApproval(ctx, approvalId, decision:'approve'|'reject'|'lock', by)` → `{ok:true, status}` | `{ok:false, code:'not_found'|'already_decided', message}`. Chỉ xử lý khi `pending`.
  claim: approve → `activateSlot` (hết tài khoản → slot `rejected`, end_reason `no_account`); reject → slot `rejected`; lock → slot `rejected` + `lockCustomer` + `lockDevice`.
  code: approve → `slots.code_grant_until = now + codeGrantMin`; reject → không làm gì thêm; lock → `revokeSlot` + `lockCustomer` + `lockDevice`.
  Sau đó logEvent `approval_decided`, `notify.approvalResolved(id)`.
- `timeoutApprovals(ctx)` → số ca hết giờ; áp `approvalTimeoutAction` (`reject` → status `timeout` + slot claim `rejected`; `approve` → như approve với by=`timeout`).
- `approvalStatus(ctx, approvalId, customerId)` → `{status, slotStatus}|null` (chỉ của chính khách).
- `listPendingApprovals(ctx)` → mảng kèm `{phoneMasked, toolName, cafeName, cardLabel, reasons, score, kind, createdAt, expiresAt}`.

### 3.7 `src/domain/codes.js`
- `requestCode(ctx, {session, customer, deviceId, ip, cafeCodeInput})` → một trong:
  `{status:'open', windowId, expiresAt, accountEmail, loginUrl}` · `{status:'busy', retryAfterSec, message}` ("Tài khoản đang có người khác lấy mã. Thử lại sau N giây nhé.") ·
  `{status:'pending_approval', approvalId, message}` ("Lấy thêm mã cần Tiệm duyệt, thường dưới 5 phút.") · `{status:'need_presence', error, canCode, canWifi, message}` · `{status:'rejected', code, message}`.
  Thứ tự: khách khoá → slot active còn hạn (`no_slot` "Bạn chưa có slot nào đang hoạt động." / `expired` "Slot của bạn đã hết hạn.") → tool `email_code` (`not_code_tool`) → tài khoản không `quarantined/retired` (`account_unavailable` "Tài khoản đang bảo trì, Tiệm sẽ liên hệ bạn.") → presence (`hasFreshPresence(session)` hoặc `checkPresence` với quán của entry gần nhất, nếu không có thì quán của slot; thành công → `markPresence`) → lượt đang mở của chính slot này còn hạn → trả lại lượt đó → đã có approval code `pending` của slot → trả pending → máy khác `slot.device_id` mà không có `code_grant_until > now` → approval (`second_device` 30 "Lấy mã từ máy khác máy đã gắn"; theo `yellowPolicy`: reject → `rejected` code `second_device` "Mỗi slot chỉ dùng trên 1 máy để nhường slot cho bạn sau nhé.") → `code_requests >= codeMaxRequests` → `rejected` `too_many_codes` → `code_requests >= codeAutoRequests` và không có grant → approval (`extra_code_request` 20 "Xin mã thêm lần nữa") → mở lượt.
  Mở lượt (trong tx): chuyển các lượt `open` đã quá hạn của tài khoản sang `expired`; insert lượt `open` (`expires_at = now + codeWindowSec`); trùng unique index → `busy` (retryAfterSec theo lượt đang mở). `code_requests += 1`; nếu dùng grant thì xoá grant. logEvent `code_requested`.
- `codeStatus(ctx, {windowId, customerId, deviceId})` → `{status:'waiting', expiresAt}` | `{status:'ready', code, receivedAt}` | `{status:'expired'}` | `{status:'not_found'}`. Chỉ chủ lượt (customer + device) xem được. Lần đầu `ready` → ghi `shown_at`.
- `cancelWindow(ctx, {windowId, customerId})` → lượt `open` → `cancelled`.
- `onLoginCode(ctx, {account, code, mailId, mailDate})` → `{verdict:'matched'|'replaced'|'late'|'orphan', windowId?}`.
  1. Có lượt `open` của tài khoản với `expires_at + 60s >= now` → `delivered` (lưu code, code_received_at, mail_id, shown_at=NULL), logEvent `code_delivered` → `matched`.
  2. Khách bấm "Gửi lại mã" bên hãng: có lượt `delivered` của tài khoản với `expires_at + 60s >= now` → **thay mã mới** (shown_at=NULL để giao diện hiện mã mới) → `replaced`.
  3. Thư về trễ (webhook chậm): `mailDate` nằm trong [opened_at, expires_at+60s] của một lượt đã có của tài khoản → logEvent `code_late` (yellow), không báo động, không cộng điểm → `late`.
  4. Còn lại → mã mồ côi: logEvent `code_orphan` (red); cộng 15 điểm rủi ro cho khách có slot trên tài khoản này **đã kết thúc** trong 7 ngày qua (KHÔNG phạt người đang giữ — họ có thể chỉ bấm gửi mã bên hãng trước khi bấm Lấy mã); `notify.alert({severity:'red', type:'code_orphan', ...})` → `orphan`.
- Bấm "Gửi mã" bên hãng TRƯỚC khi bấm "Lấy mã": khi mở lượt trong `requestCode`, nếu có thư `login_code` verdict `orphan` của tài khoản này về trong 90 giây trước đó → gắn ngay mã đó vào lượt mới (lượt chuyển `delivered`, thư cập nhật verdict `matched`, window_id).
- `expireWindows(ctx)` → lượt `open` quá `expires_at + 60s` → `expired`; xoá `code` của các lượt đã qua 10 phút kể từ khi mở.

### 3.8 `src/domain/mail.js`
- `normalizeInbound(payload)` → `{dedupeKey, to:[...], from, subject, text, date}` (`date` = ms từ date/Date/timestamp/received_at/receivedAt nếu đọc được, không thì null). Nhận nhiều tên trường: to/recipient/rcpt/envelope.to/To/address/email; from/sender/From; subject/Subject/title; text/body/plain/text_body/body-plain/content; html/body_html/body-html (thiếu text thì bóc thẻ HTML). `to` có thể là "Tên <a@b>", mảng, hoặc chuỗi phân cách dấu phẩy. dedupe: message-id (message_id/messageId/Message-Id/id/headers['message-id']) hoặc `sha256(to|from|subject|text)`.
- `extractCode(tool, {subject, text})` → string|null.
- `classifyMail(tool, {from, subject, text})` → `{kind, code}`; kind ∈ `login_code` | `magic_link` | `password_reset` | `security_alert` | `new_signin` | `billing` | `other`. **Ưu tiên tiêu đề**: tiêu đề khớp đặt lại mật khẩu → `password_reset` kể cả khi có mã (KHÔNG BAO GIỜ chuyển mã đặt lại mật khẩu cho khách). Chân thư kiểu "nếu không phải bạn, hãy đổi mật khẩu" không được làm thư mã bị coi là cảnh báo.
- `ingestMail(ctx, payload)` → `{ok:true, mailId, kind, verdict}` | `{ok:true, duplicate:true}`.
  Tìm tài khoản theo địa chỉ nhận (không phân biệt hoa thường; bỏ phần `+tag`). Không thấy → `unknown_recipient`/`ignored` (không lưu body).
  `login_code` → `onLoginCode` (`matched`/`orphan`); có dấu hiệu mã nhưng không bóc được → `parse_failed` + cảnh báo vàng.
  `security_alert` → `quarantineAccount` (`quarantined`). `password_reset` → chỉ cảnh báo đỏ, KHÔNG cộng điểm/khoá ai (khách cũ có thể bấm "Quên mật khẩu" để phá người đang dùng; link đặt lại chỉ về hộp thư của Tiệm nên vô hại) (`alerted`). `magic_link` → cảnh báo (không bao giờ chuyển link) (`alerted`). `new_signin` → nếu tài khoản vừa giao mã trong 15 phút → `ignored`, ngược lại cảnh báo vàng (`alerted`). `billing`/`other` → `ignored`.
  Lưu body tối đa 20.000 ký tự.
- `quarantineAccount(ctx, accountId, reason)` → `{revokedSlots}`: status `quarantined`, thu hồi slot active/pending trên tài khoản (`revokeSlot` với reason `account_quarantined` — không tính vào hạn mức của khách), **không tự phạt ai** (thủ phạm có thể là khách cũ còn phiên đăng nhập chưa bị đăng xuất); việc `rotate` lý do `quarantine`; `notify.alert` đỏ liệt kê người giữ hiện tại và người giữ trong 7 ngày qua (SĐT che bớt) với refs để chủ bấm khoá nếu muốn.
- `DEFAULT_TOOL_PATTERNS` theo slug (chatgpt, claude, capcut, adobe, canva, gemini, grok, perplexity, ...).

### 3.9 `src/services/otp.js`
`createOtpSender(ctx)` → `{name, send(phone, code): Promise<{ok, error?}>}` theo `config.otp.provider`: `dev` (log ra console), `zalo_zns` (Zalo ZNS template + tự làm mới access token qua refresh token, lưu trong bảng kv), `webhook` (POST JSON kèm HMAC tới `OTP_WEBHOOK_URL`). Không log mã ở production.

### 3.10 `src/services/telegram.js`
`createTelegram(ctx)` → `{notifier, handleUpdate(update), startPolling(), stop(), setWebhook()}`. `notifier` cài đặt interface trong `src/ctx.js`. Nút inline: approval `ap:<id>:a|r|l`; việc tay `tk:<id>:d`; khoá khách `lc:<customerId>`; khoá/mở thẻ `lk:<cardId>`/`uk:<cardId>`. Chỉ nhận lệnh từ `config.telegram.adminChatIds`. Lệnh: `/start` (trả chat id), `/pending`, `/tasks`, `/stats`, `/help`. Lỗi mạng: log, không ném.

### 3.10b `src/services/notify-webhook.js`
`createWebhookNotifier(ctx)` → notifier (interface trong `src/ctx.js`) POST JSON `{event, ...chi tiết đã nạp từ DB}` tới `config.notify.webhookUrl`, header `X-Signature: sha256=<HMAC(config.notify.webhookSecret, body)>`, timeout 5 giây, không ném lỗi. `server.js` gộp các notifier bằng `fanoutNotifier`.

### 3.11 `src/jobs.js`
`runJobs(ctx)` (async, mỗi 30 giây): `expireDueSlots`, `expireWindows`, `timeoutApprovals`, tự mở khoá khách hết hạn khoá; mỗi giờ: dọn dữ liệu theo `retention*` (body thư, IP trong events/taps, events/taps cũ, otps > 1 ngày, sessions/admin_sessions hết hạn, rate_limits hết hạn); 08:00 mỗi ngày: tóm tắt qua `notify.alert({severity:'info', type:'daily_summary', ...})`. `startJobs(ctx, intervalMs)` → hàm stop.

### 3.12 Routes (đăng ký bằng `registerXxxRoutes(router)`; server.js gắn middleware trước)
Middleware do `server.js` lo: với mọi route khách (`/`, `/c/*`, `/me`, `/api/*`, `/privacy`): `ensureDevice` + `loadSession` → `rq.state.deviceId/device/session/customer`. POST `/api/*` đã qua `rq.assertSameOrigin()`. `/hooks/*` và `/admin/*` không qua middleware khách. Static: `GET /static/<file>` từ `src/public/`.

Khách (`src/routes/public.js`):
| Method | Path | Vào | Ra |
|---|---|---|---|
| GET | `/` | | trang giới thiệu ngắn |
| GET | `/c/:token` | query mirror (m/uid/ctr) | `processTap` → trang nhận quà (chưa đăng nhập: SĐT + đồng ý; đã đăng nhập: chọn công cụ; đang có slot: nút sang /me). Thẻ lạ → 404; thẻ khoá → trang thông báo |
| POST | `/api/otp/send` | `{phone}` | kết quả `issueOtp` |
| POST | `/api/otp/verify` | `{phone, code, consent}` | `{ok:true}` + cookie phiên, hoặc lỗi |
| POST | `/api/claim` | `{toolId, cafeCode?, inviteEmail?}` | kết quả `startClaim` (401 nếu chưa đăng nhập) |
| GET | `/me` | | trang slot của tôi |
| GET | `/api/me` | | `currentSlotView` |
| POST | `/api/code/request` | `{cafeCode?}` | kết quả `requestCode` |
| GET | `/api/code/status/:id` | | `codeStatus` |
| POST | `/api/code/cancel/:id` | | `{ok}` |
| GET | `/api/approval/:id` | | `approvalStatus` |
| POST | `/api/logout` | | `{ok}` |
| POST | `/api/report` | `{message}` | Khách báo "không đăng nhập được"/lỗi: logEvent `customer_report` (yellow) + `notify.alert` vàng; tối đa `reportsPerHour`/khách → `{ok:true}`; giao diện kèm link Zalo |
| GET | `/privacy` | | chính sách dữ liệu cá nhân |

Màn hình quầy (`src/routes/display.js`): `GET /quan/:token` (trang mã quán to, tự làm mới, giữ màn hình sáng), `GET /api/quan/:token/code` → `{code, expiresAt, now, cafeName}` và `recordDisplayPing`.

Server (`src/server.js`, ĐÃ CÓ): `createApp(ctx)` → handler HTTP; `ctx.telegram` = đối tượng từ `createTelegram` (hoặc undefined khi tắt). Lỗi `HttpError` ở `/api/*`, `/hooks/*` → JSON `{ok:false, code, message}`; trang thường → trang lỗi HTML.
Test HTTP: `const srv = await startTestServer(ctx)` (trong `test/helpers.js`) → `{url, close(), client()}`; `client()` có cookie jar: `await c.get(path)`, `await c.post(path, jsonBody)`, `await c.postForm(path, obj)` → `{status, headers, text, json}` (POST tự gắn header Origin).

Hooks (`src/routes/hooks.js`): `POST /hooks/mail` (xác thực `X-Signature: sha256=<hex HMAC(MAIL_WEBHOOK_SECRET, raw body)>` hoặc `?key=` nếu bật, hoặc chữ ký Mailgun trong form khi có `MAILGUN_SIGNING_KEY`; nhận JSON 1 thư hoặc mảng; urlencoded; multipart/form-data; nguyên thư gốc `message/rfc822`) → `ingestMail`. `POST /hooks/telegram` (header `X-Telegram-Bot-Api-Secret-Token`) → `handleUpdate`.

Quản trị — trang **`/admin/live`** (bắt buộc): Telegram có thể bị chặn ở Việt Nam, nên trang này là kênh duyệt chính trên điện thoại của chủ: tự làm mới mỗi 10 giây qua `GET /admin/api/live` (JSON: ca chờ duyệt, việc tay, báo động 2 giờ qua), có nút Duyệt/Từ chối/Khoá (fetch POST kèm header `x-csrf`), kêu bíp (WebAudio) + Notification API khi có ca mới.
Quản trị (`src/routes/admin.js`): đăng nhập bằng `ADMIN_PASSWORD` (cookie `adm`, SameSite=Strict, path `/admin`, 12 giờ; CSRF token trong form + `assertSameOrigin`). Trang: tổng quan (số liệu hôm nay, ca chờ duyệt, việc tay, cảnh báo 24h), quán & thẻ (tạo quán, tạo thẻ hàng loạt + xuất CSV link để ghi chip, khoá/mở thẻ, đổi token thẻ/màn hình), công cụ, kho tài khoản, khách (tìm SĐT, lịch sử, khoá/mở, xoá dữ liệu cá nhân), thư, nhật ký, slot đang chạy (thu hồi), cài đặt.

### 3.13 Giao diện
- Mobile-first, không tài nguyên ngoài (CSP `default-src 'self'`): **không inline script/style**; JS ở `src/public/app.js` (khách), `src/public/display.js` (màn hình quầy), `src/public/admin.js` (nếu cần); CSS ở `src/public/style.css`, `src/public/admin.css`. Dữ liệu cho JS truyền qua `data-*`.
- Màu thương hiệu gợi ý: nền sáng, nhấn xanh lá #16a34a, chữ #111827. Font hệ thống.
- Lời nhắn bắt buộc trên trang slot: "Chỉ dùng 1 máy để nhường slot cho bạn sau nhé 💛".
- Hết hạn: cảm ơn + nút "Mua gói giá tốt qua Zalo" (`settings.zaloUrl`).

## 4. Điều chỉnh khi viết code (05/10/2026) — code là nguồn đúng nếu khác các mục trên

- **presence.processTap**: chip đã từng gửi bộ đếm/UID (`cards.last_counter`/`nfc_uid` có giá trị) mà link lần này thiếu → `replay` (link bị chép rồi cắt tham số).
- **quota `device_phone_limit`**: chỉ đếm SĐT khác đã từng **nhận slot** trên máy này (không đếm người chỉ mượn máy đăng nhập), để người nhận trước không bị chặn. Người chỉ đăng nhập vẫn bị cộng điểm `device_other_phone` khi chấm rủi ro.
- **codes.onLoginCode**: thêm verdict `orphan_wait` — mã về khi không ai lấy mã nhưng tài khoản đang có người giữ → chờ 90 giây (khách hay bấm "Gửi mã" bên hãng trước khi bấm "Lấy mã"); quá 90 giây không ai nhận thì `escalatePendingOrphans` (gọi từ jobs) nâng thành `orphan` + báo đỏ. Bớt báo động nhầm.
  Khớp lượt đang mở còn kiểm tra `mailDate >= opened_at - 60s` (thư cũ về trễ không bị giao nhầm cho người mở lượt sau).
- **codes.deliverManualCode(ctx, {mailId, code, by})**: chủ đọc thư `parse_failed` và tự gửi mã cho lượt đang mở (trang Thư trong admin).
- **codes.requestCode**: vừa bị từ chối ca "lấy thêm mã" trong 10 phút → `rejected` code `recently_rejected` (không tạo ca mới liên tục làm phiền chủ).
- **mail.classifyMail**: thứ tự = đặt lại mật khẩu → cảnh báo bảo mật (theo tiêu đề) → **thư có mã** → đăng nhập mới → link → hoá đơn → nội dung thư (chỉ câu khẳng định mạnh, bỏ câu điều kiện ở chân thư). "Set/create a new password" là đặt lại mật khẩu, không phải cảnh báo. Người gửi không khớp `sender_pattern` → `other` + cảnh báo vàng `mail_unknown_sender`. `sender_pattern` = NULL dùng mẫu mặc định theo slug, = '' (nhập "-" trong admin) thì không kiểm tra.
- **auth.ensureDevice**: cookie `did` vừa tạo (< 10 phút, chưa gắn SĐT) mà JS gửi `x-device-hint` là máy cũ → dùng lại máy cũ và chuyển lượt chạm thẻ sang máy cũ. Phản hồi `/api/*` có header `X-Device-Id` để JS lưu localStorage.
- **auth.eraseCustomer(ctx, customerId, by)**: xoá dữ liệu cá nhân (SĐT → dấu vết một chiều, xoá phiên/OTP/IP trong nhật ký/email mời).
- **lib/http**: `Referrer-Policy: same-origin` (thay `no-referrer`, vì `no-referrer` làm trình duyệt gửi `Origin: null` cho form POST → chặn nhầm). `assertSameOrigin` chấp nhận `Sec-Fetch-Site: same-origin` khi không có Origin/Referer.
- **claims.currentSlotView**: thêm `codeGranted` (đã được duyệt lấy thêm mã).
- **risk**: thêm `lockCard/unlockCard`. **stats.js**: `statsSince(ctx, since?)` cho trang tổng quan, `/stats`, tóm tắt 8h sáng.
- Notifier (Telegram/webhook) luôn chờ `setImmediate` trước khi đọc DB → gọi `ctx.notify.*` bên trong transaction vẫn đọc được dữ liệu đã commit.

### Bổ sung 05/10/2026 (phiên 2)

- **lib/mime.js** (mới): `parseMime(bufOrString)` → `{headers:{tên-thường:[giá trị]}, from, subject, to:[To+Cc], text, html, messageId, date}`; hỗ trợ multipart lồng nhau (tối đa 8 tầng, 200 phần), base64, quoted-printable, RFC 2047 (ghép byte các encoded-word liền nhau), bảng mã qua `TextDecoder`; bỏ tệp đính kèm và `message/rfc822` lồng. `parseMultipartForm(buf, boundary)` → object không prototype, bỏ phần có filename.
- **mail.normalizeInbound**: payload có `raw`/`mime`/`rfc822`/`body-mime`/`raw_email` (hoặc `email` trông như thư gốc — SendGrid) → đọc bằng `parseMime`. Người nhận theo thứ tự tin cậy: `envelope.to`, `recipient`, `rcpt` → `X-Envelope-To` → `Delivered-To`/`X-Original-To` → `To`/`Cc`. `headers` nhận object, khối chữ (SendGrid) hoặc mảng cặp (Mailgun `message-headers`); `envelope` nhận chuỗi JSON.
- **hooks /hooks/mail**: `MAILGUN_SIGNING_KEY` → chấp nhận `signature = HMAC(key, timestamp + token)` trong form, lệch giờ ≤ 15 phút (chỉ đọc form trước khi xác thực khi đã đặt khoá này).
- **extras/cloudflare-email-worker.js**: Worker ghi `X-Envelope-To`/`X-Envelope-From` lên đầu thư (nằm trong phần được ký), ký HMAC, POST `message/rfc822`, thử lại 1 lần khi lỗi mạng/5xx; thất bại → `forward(BACKUP_EMAIL)` hoặc ném lỗi; `ALLOWED` tuỳ chọn → `setReject`.
- **stats.cafeReport(ctx, cafeId, {since, until})** (mới): taps hợp lệ, máy, lượt dùng thử (`started_at`), khách, khách quay lại (đã dùng thử ở quán vào ngày trước đó), `zalo_click`, báo đỏ, theo công cụ/giờ VN/thẻ/ngày, ngày hết suất (cùng cách đếm `COUNTED` của quota). Trang `GET /admin/cafes/:id/report?range=7d|30d|month|prev` + `report.csv`.
- **GET /zalo** (khách): nút "Mua gói giá tốt qua Zalo" đi qua đây → logEvent `zalo_click` chỉ có `cafe_id` + `toolId` (KHÔNG ghi khách/máy/IP), tối đa 1 lần/máy/ngày (rate limit), rồi 302 sang `settings.zaloUrl`.

### Bổ sung 05/10/2026 (phiên 3) — nối với Quite Sensational (QS, tính năng của Tài)

Đối chiếu repo QS `tuantaidoan2004-collab/nfc-feedback-platform`, nhánh `feat/local-app-foundation`, commit `3571676`.

- **Lối vào QS** (`routes/public.js`): `GET /qs`, `/qs/:shop`, `?shop=<slug>`, `?quan=<id>` → `presence.findCafeForEntry` (Wi-Fi màn hình quầy, đúng 1 quán → mã quán QS → quán khách chọn; không ra → `pickCafePage`, và `qs_shop_unmapped` vàng 1 lần/giờ/mã) → `presence.qsEntryCard` (thẻ ẩn `cards.kind='qs'`, 1/quán, unique index) → `processTap` → `renderEntry` (dùng chung với `/c/:token`). `/c/:token` chỉ nhận `kind='nfc'`.
- **Lối vào QS khác thẻ NFC:** `processTap` bỏ UID/bộ đếm và `checkCardAnomaly`; `quota.checkClaimQuota` bỏ `card_quota` (đã có `cafe_quota`). Mã quán trên link KHÔNG thay chứng minh có mặt.
- **Dữ liệu:** `cafes.qs_slug` (định dạng slug QS `^[a-z0-9][a-z0-9-]{0,62}$`, lưu chữ thường, unique NOCASE), `cards.kind` (`nfc`|`qs`). `db/index.js migrate()` thêm cột cho database cũ (chạy lại an toàn).
- **Trình xem trước link:** `isLinkPreview` = crawler (bot, facebookexternalhit, whatsapp…) hoặc `zalo|telegram` mà KHÔNG phải UA di động — trình duyệt trong app Zalo (quét QR bằng Zalo) là khách thật.
- **IP khách** (`lib/http.clientIp`): chỉ tin `CLIENT_IP_HEADER` (một header proxy ghi đè, như `NFC_CLIENT_IP_HEADER` của QS); `TRUST_PROXY=1` cũ → địa chỉ CUỐI X-Forwarded-For; có cấu hình proxy mà thiếu header → `''` (không biết IP, Wi-Fi không tính). Production thiếu cả hai → `validateConfig` báo lỗi. (Trước đây tin `CF-Connecting-IP` trước tiên → khách ở nhà giả IP quán được.)
- **Luật Google cho chữ TBQ** (`lib/policy.js`, cùng dây bẫy với QS): `fold` + `freeTextProblem` chép từ `lib/publishing/policy.ts`/`lib/text-fold.ts` của QS, thêm `TBQ_REWARD` (`tai khoan`, `account`, `dung thu`, `trial`). Kiểm ở biên ghi: Cài đặt `eventTitle`; tên + từng dòng hướng dẫn công cụ.
- **Nội dung khối trên trang quán** (`src/qs-event.js` `QS_EVENT`, `QS_LIMITS`): nguồn duy nhất cho `settings.eventTitle` mặc định, `docs/phoi-hop-voi-QS.md` (test kiểm khớp chữ, độ dài, luật).
- **Giao diện:** *(thay ở phiên 4 — xem dưới)*. Link tĩnh có `?v=<hash>` (`views/asset.js`). Chữ khách: `entryHint` (mở trang quán → bấm khối), tên chương trình ở tiêu đề.
- **Vận hành:** `GET /healthz` (không cookie, không ghi), `scripts/backup.js` (`node:sqlite` `backup()`). Caddy ghi đè `X-Real-IP`, body 3 MB (README).
- **Báo cáo quán:** "Lượt vào" = QS + thẻ NFC; bảng "Theo lối vào" (lối vào QS đứng đầu).

### Bổ sung 05/10/2026 (phiên 4) — hai tính năng riêng, thiết kế riêng, không Docker

- **Vai trò:** TBQ và QS là tính năng của hai đồng nghiệp, mã nguồn/máy chủ/database/giao diện riêng; nối nhau ở đúng một điểm
  (khối trên trang quán của QS → `GET /qs` của TBQ). Không gọi API của nhau, không chia sẻ dữ liệu khách. Tài liệu: `docs/phoi-hop-voi-QS.md`.
- **Giao diện thiết kế riêng** theo nhận diện tiembanquyen.com (`public/style.css`): `--paper #f4f1ea`, `--surface #faf8f3`, `--ink #1c1b19`,
  `--stone #5e5a52`, vàng đồng `--gold #b38b45` / `--gold-light #d9be86` / `--gold-700 #76561f`; tiêu đề `Cormorant Garamond` → Times New Roman,
  thân `Lora` → Georgia (không tải phông ngoài); góc bo 4px; `.hero` nền mực + dòng chữ hoa vàng + vạch vàng; nút nền mực cao 52px;
  nhãn "Miễn phí"; màn hình quầy nền mực/vàng; trang quản trị cùng bảng màu (thanh điều hướng mực–vàng). Không còn nền tối theo máy.
  Tương phản mọi cặp chữ/nền ≥ 4,5:1.
- **Bỏ Docker** (dự án đã loại Docker): xoá `Dockerfile`, `.dockerignore`, `deploy/`. Chạy bằng Node + Caddy + systemd (README).

### Bổ sung 05/10/2026 (phiên 13) — chạy dưới thư mục con `/colap`
- Chủ tiệm chọn địa chỉ **`https://thu.tiembanquyen.com/colap`**. `BASE_URL` được phép có 1 thư mục (chữ, số, `-`, `_`; không `?` / `#`);
  `config.basePath` lấy từ đó ("" khi chạy ở gốc — mọi thứ như cũ).
- Chiều vào (`server.js`): chỉ nhận đường dẫn bắt đầu bằng `/colap/`, cắt tiền tố rồi route như ở gốc; `/colap` (thiếu `/`) → 308 sang `/colap/`;
  ngoài `/colap` → 404. Proxy chuyển nguyên đường dẫn (Caddy `handle`, không `handle_path`).
- Chiều ra (`lib/http.js`): `rq.redirect` thêm tiền tố cho Location; cookie `Path=/colap` (quản trị `/colap/admin`); `sendHtml` thêm tiền tố cho mọi
  `href` / `src` / `action` / `formaction` bắt đầu bằng một dấu `/`. Code route / view vẫn viết đường dẫn như ở gốc.
- JS trình duyệt (`app.js`, `admin.js`) tự đọc tiền tố từ đường dẫn của chính file (`…/static/app.js`).
- QS: `origin` trong `lib/events/catalog.ts` = `https://thu.tiembanquyen.com/colap`; `NFC_EVENT_TBQ_ORIGIN` giữ thư mục. Vé không đổi (không ký đường dẫn).
- Test: `test/base-path.test.js` (3 ca); `E2E_BASE_PATH=/colap npm run e2e` chạy cả bộ e2e dưới `/colap`.

### Bổ sung 05/10/2026 (phiên 15) — cắt gọn, giữ lõi chống spam + kho
Chủ tiệm: "ok làm đi" với 5 mục cắt (sau khi Tài đơn giản hoá QS). Sao lưu trước khi cắt: `../sao-luu/truoc-phien-15-cat-gon/`.
1. **Bỏ Telegram + kênh báo động phụ** (`services/telegram.js`, `services/notify-webhook.js`, `ctx.notify`, tóm tắt 8h sáng). Báo động = sự kiện
   mức red / yellow trong bảng `events`; trang quản trị **Theo dõi** (`/admin/live`, trước tên "Trực duyệt") đọc từ đó. Chỗ trước chỉ gửi báo động mà
   không ghi sự kiện (`ticket_forged`) giờ ghi sự kiện đỏ; mã mồ côi / cách ly ghi kèm SĐT (đã che) người giữ 7 ngày qua.
2. **OTP chỉ eSMS** (`OTP_PROVIDER=esms`; `dev` chỉ chạy thử). Bỏ Zalo ZNS, webhook OTP. Trang khách ghi "Gửi mã qua SMS" (cả khi chạy thử).
3. **Thư mã chỉ qua Cloudflare Email Worker** (thư gốc, `X-Signature`) — JSON có chữ ký vẫn nhận cho `fake-mail`. Bỏ form Mailgun / SendGrid / urlencoded,
   `?key=`, `MAILGUN_SIGNING_KEY`, `MAIL_WEBHOOK_ALLOW_QUERY_KEY`, `parseMultipartForm`.
4. **Bỏ Canva "mời vào nhóm"** (`team_invite`, `pending_invite`, `invite_member` / `remove_member`, API `/worker`, `WORKER_TOKEN`, `auto_worker`,
   `workerAlertMin`). Database cũ: công cụ `team_invite` tự tắt, việc mời / gỡ còn treo tự huỷ (`db/index.js`). Canva → khách nhắn Zalo. Gói chạy thử còn 4 công cụ.
5. **Bỏ duyệt tay** (`domain/approvals.js`, bảng `approvals`, `code_grant_until`, `/api/approval`, nút Duyệt). Thay bằng luật tự động:
   - Nhận slot mức vàng: cài đặt `yellowAction` — `reject` (mặc định, ghi `claim_yellow_rejected`) | `approve` (cho qua, ghi `claim_yellow_passed`).
   - Lấy mã từ máy khác máy đã nhận slot: luôn từ chối (`second_device`, ghi cảnh báo vàng).
   - Lấy thêm mã (lần 2…`codeMaxRequests` = 4): tự cho qua — vẫn phải đang ở quán (vé / chạm thẻ còn hạn) và đúng máy. Bỏ `codeAutoRequests`, `codeGrantMin`,
     `approvalTimeout*`, `night*`.
- Test: `npm test` 77/77, `npm run e2e` 134/134 (cả `E2E_BASE_PATH=/colap`; OTP đi qua máy eSMS giả), `npm run sim` 0 vi phạm (seed 2026; 7, 11, 31 rate 40).
  Mô phỏng có thêm chốt: dưới 20% lượt ghé nhận được công cụ → báo vi phạm `mo_phong` (tránh "0 vi phạm" giả khi không đọc được trang).

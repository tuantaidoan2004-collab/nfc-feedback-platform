# Kịch bản vận hành sâu (`npm run van-hanh-sau`) — 14:22:49 8/10/2026

Chạy trên bộ diễn tập: TBQ **production** sau Caddy giả, OTP qua eSMS giả, thư qua code Cloudflare Worker, hãng giả kiểm đăng nhập thật, tua giờ bằng database.
Mỗi máy 1 địa chỉ riêng (cookie riêng). Không đụng dữ liệu diễn tập của bạn.

## Kết quả: ❌ dừng giữa chừng — 16/36 bước đạt

### D1. Chủ tiệm dựng ngày đầu: 2 quán, thẻ NFC, nhập kho bằng trang quản trị
- ✔ đăng nhập quản trị (production)
- ✔ tạo quán có QS
- ✔ tạo 4 thẻ NFC cho quán chưa có QS
- ✔ nhập kho canva (1 dòng)
- ✔ nhập kho gemini (5 dòng)
- ✔ nhập kho capcut (10 dòng)
- ✔ nhập kho adobe (4 dòng)
- ✔ nhập kho claude (3 dòng)
- ✘ nhập kho chatgpt (3 dòng) — `Đã thêm 0 tài khoản. Bỏ qua: gpt-543b-1@kho.test: món này chỉ cần email (đăng nhập bằng mã) — bỏ cột mật khẩu; gpt-543b-2@kho.test: món này chỉ cần email (đăng nhập bằng mã) — bỏ cột mật khẩu; gpt-543b-3@kho.test: món này chỉ cần email (đăng nhập bằng mã) — bỏ cột mật khẩu`
- ✔ dán lại tài khoản đã có → báo "đã có trong kho", không tạo trùng
- ✔ ChatGPT thiếu khoá 2FA → bị bỏ qua, có lý do
- ✔ tạo 200 mã phiếu (trang Mã phiếu)

### D2. ChatGPT: 9 khách cùng quán → 8 người chung 1 tài khoản (Slot 1…8), người thứ 9 sang tài khoản khác
- ✘ khách wifi101 nhận ChatGPT — `{"L":{"ok":true,"isNew":true},"c":{"ok":false,"status":"rejected","code":"tool_disabled","message":"Công cụ này tạm ngưng.","disabledOnPage":true}}`
- ✘ khách wifi102 nhận ChatGPT — `{"L":{"ok":true,"isNew":true},"c":{"ok":false,"status":"rejected","code":"tool_disabled","message":"Công cụ này tạm ngưng.","disabledOnPage":true}}`
- ✘ khách wifi103 nhận ChatGPT — `{"L":{"ok":true,"isNew":true},"c":{"ok":false,"status":"rejected","code":"tool_disabled","message":"Công cụ này tạm ngưng.","disabledOnPage":true}}`
- ✘ khách wifi104 nhận ChatGPT — `{"L":{"ok":true,"isNew":true},"c":{"ok":false,"status":"rejected","code":"tool_disabled","message":"Công cụ này tạm ngưng.","disabledOnPage":true}}`
- ✘ khách wifi105 nhận ChatGPT — `{"L":{"ok":true,"isNew":true},"c":{"ok":false,"status":"rejected","code":"tool_disabled","message":"Công cụ này tạm ngưng.","disabledOnPage":true}}`
- ✘ khách wifi106 nhận ChatGPT — `{"L":{"ok":true,"isNew":true},"c":{"ok":false,"status":"rejected","code":"tool_disabled","message":"Công cụ này tạm ngưng.","disabledOnPage":true}}`
- ✘ khách wifi107 nhận ChatGPT — `{"L":{"ok":true,"isNew":true},"c":{"ok":false,"status":"rejected","code":"tool_disabled","message":"Công cụ này tạm ngưng.","disabledOnPage":true}}`
- ✘ khách wifi108 nhận ChatGPT — `{"L":{"ok":true,"isNew":true},"c":{"ok":false,"status":"rejected","code":"tool_disabled","message":"Công cụ này tạm ngưng.","disabledOnPage":true}}`
- ✘ khách wifi109 nhận ChatGPT — `{"L":{"ok":true,"isNew":true},"c":{"ok":false,"status":"rejected","code":"tool_disabled","message":"Công cụ này tạm ngưng.","disabledOnPage":true}}`
- ✔ 8 khách đầu cùng 1 tài khoản
- ✘ Slot 1…8 không trùng — `[null,null,null,null,null,null,null,null,null]`
- ✘ khách thứ 9 sang tài khoản khác, Slot 1 — `{"html":"<!doctype html>\n<html lang=\"vi\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n<meta name=\"robots\" content=\"noindex,nofollow\">\n<meta name=\"theme-color\" content=\"#191914\">\n<title>Slot của tôi — Tiệm`
- ✘ cả 9 khách ChatGPT hết đúng 06:00 sáng mai (giờ VN) — `[]`
- ✘ trang khách ghi rõ "Dùng tới 06:00 …" — ``
- ✘ cả 9 đăng nhập được ChatGPT giả bằng mật khẩu + mã 2FA trên trang Tiệm — `0`

### D3. Quán thẻ NFC đặt 8 suất/ngày: khách thứ 9 không nhận được, câu báo rõ
- ✔ 8 khách đầu nhận CapCut
- ✔ khách thứ 9: hết suất quán, có câu báo
- ✘ CapCut lấp đủ 2 người / tài khoản (8 khách → 4 tài khoản) — `[null]`
- ✘ khách CapCut đăng nhập CapCut giả — ``

### D4. Adobe tối đa 4 lượt/ngày: người thứ 5 thấy công cụ bị khoá trên trang
- ✔ 4 khách đầu nhận Adobe
- ✔ khách thứ 5: Adobe bị khoá ngay trên trang chọn (không phải bấm rồi mới báo)

### D5. Adobe lấy mã email: bấm Lấy mã trước / đăng nhập trước đều được; người ngoài biết mật khẩu → mã mồ côi, báo động
- ✘ khách 1: bấm "Lấy mã" trước → đăng nhập Adobe được — `{"res":"sai_mat_khau","w":{"ok":false,"status":"rejected","code":"not_code_tool","message":"Công cụ này không cần lấy mã.","codeRequestsLeft":4}}`
- ✘ khách 2 (cùng tài khoản với khách 1): đăng nhập Adobe trước (Adobe tự gửi mã) rồi mới bấm "Lấy mã" → vẫn được — `{"res":"sai_mat_khau","dbg2":null,"mails":[]}`
- ✘ người ngoài có mật khẩu Adobe (khách gửi cho) → kẹt ở bước mã email — `sai_mat_khau`

## Ghi nhận
- D2. ChatGPT: 9 khách cùng quán → 8 người chung 1 tài khoản (Slot 1…8), người thứ 9 sang tài khoản khác: wifi101 đăng nhập ChatGPT giả: sai_mat_khau
- D2. ChatGPT: 9 khách cùng quán → 8 người chung 1 tài khoản (Slot 1…8), người thứ 9 sang tài khoản khác: wifi102 đăng nhập ChatGPT giả: sai_mat_khau
- D2. ChatGPT: 9 khách cùng quán → 8 người chung 1 tài khoản (Slot 1…8), người thứ 9 sang tài khoản khác: wifi103 đăng nhập ChatGPT giả: sai_mat_khau
- D2. ChatGPT: 9 khách cùng quán → 8 người chung 1 tài khoản (Slot 1…8), người thứ 9 sang tài khoản khác: wifi104 đăng nhập ChatGPT giả: sai_mat_khau
- D2. ChatGPT: 9 khách cùng quán → 8 người chung 1 tài khoản (Slot 1…8), người thứ 9 sang tài khoản khác: wifi105 đăng nhập ChatGPT giả: sai_mat_khau
- D2. ChatGPT: 9 khách cùng quán → 8 người chung 1 tài khoản (Slot 1…8), người thứ 9 sang tài khoản khác: wifi106 đăng nhập ChatGPT giả: sai_mat_khau
- D2. ChatGPT: 9 khách cùng quán → 8 người chung 1 tài khoản (Slot 1…8), người thứ 9 sang tài khoản khác: wifi107 đăng nhập ChatGPT giả: sai_mat_khau
- D2. ChatGPT: 9 khách cùng quán → 8 người chung 1 tài khoản (Slot 1…8), người thứ 9 sang tài khoản khác: wifi108 đăng nhập ChatGPT giả: sai_mat_khau
- D2. ChatGPT: 9 khách cùng quán → 8 người chung 1 tài khoản (Slot 1…8), người thứ 9 sang tài khoản khác: wifi109 đăng nhập ChatGPT giả: sai_mat_khau
- D3. Quán thẻ NFC đặt 8 suất/ngày: khách thứ 9 không nhận được, câu báo rõ: câu khách thứ 9 thấy: "Hôm nay quán đã hết suất trải nghiệm. Quay lại ngày mai nhé!"

## Lỗi dừng kịch bản
```
TypeError: Cannot read properties of null (reading 'toLowerCase')
    at main (file:///Users/tranphilong/Downloads/Co%CC%A3%20La%CC%81p/tbq-trial/scripts/van-hanh-sau.js:335:156)
    at async file:///Users/tranphilong/Downloads/Co%CC%A3%20La%CC%81p/tbq-trial/scripts/van-hanh-sau.js:683:7
```

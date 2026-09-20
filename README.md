# NFC Branded Feedback Platform

Dự án thẻ NFC mở trang thương hiệu và thu góp ý riêng cho chủ shop.

**Trạng thái:** app Next.js local cho trang khách và dashboard mẫu. Dữ liệu demo chỉ nằm trên trình duyệt; chưa có đăng nhập, database hoặc deployment.

- `docs/decisions.md`: quyết định đã chốt và câu hỏi còn mở.
- `AGENTS.md`: cách tiếp tục công việc và khôi phục bối cảnh.

Repo private: https://github.com/tuantaidoan2004-collab/nfc-feedback-platform

- `docs/mvp-architecture.md`: phân công Vercel, Neon, R2, domain, bảo mật, chi phí và cách chuyển hosting.
- `docs/development-workflow.md`: vòng làm việc Codex → GitHub → preview → production.

Kiến trúc mục tiêu: Next.js/TypeScript trên Vercel, PostgreSQL trên Neon, ảnh trên R2 và domain thuộc chủ dự án. Chưa kết nối Vercel hoặc mua dịch vụ. Xem `docs/local-development.md` để chạy và kiểm thử. Bước tiếp theo là DB/auth sau khi duyệt bản local.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Trang khách: http://127.0.0.1:3000/t/demo · Dashboard mẫu: http://127.0.0.1:3000/demo/dashboard

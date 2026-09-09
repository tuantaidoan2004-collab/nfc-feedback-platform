# NFC Branded Feedback Platform

Dự án thẻ NFC mở trang thương hiệu và thu góp ý riêng cho chủ shop.

**Trạng thái:** đang thống nhất sản phẩm qua mô phỏng. Chưa có ứng dụng thật, đăng nhập, database hay deployment.

- `docs/decisions.md`: quyết định đã chốt và câu hỏi còn mở.
- `prototypes/nfc-owner-demo.fragment.html`: bản mô phỏng mới nhất, dành cho giao diện visualize của Codex; không phải website độc lập hoặc ứng dụng production.
- `AGENTS.md`: cách tiếp tục công việc và khôi phục bối cảnh.

Repo private: https://github.com/tuantaidoan2004-collab/nfc-feedback-platform

- `docs/mvp-architecture.md`: phân công Vercel, Neon, R2, domain, bảo mật, chi phí và cách chuyển hosting.
- `docs/development-workflow.md`: vòng làm việc Codex → GitHub → preview → production.

Kiến trúc mục tiêu: Next.js/TypeScript trên Vercel, PostgreSQL trên Neon, ảnh trên R2 và domain thuộc chủ dự án. Chưa cài app, kết nối Vercel hoặc mua dịch vụ. Bước tiếp theo là app local và kiểm thử luồng cốt lõi.

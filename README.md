# NFC Feedback Platform

Khách chạm thẻ NFC ở quán → mở trang của chính quán đó → đánh giá quán trên Google (lời mời giống hệt nhau với mọi
khách) và, nếu muốn, gửi góp ý riêng cho quán. Chủ quán xem và trả lời góp ý trong dashboard; người vận hành quản lý
các quán ở `/gov`.

**Đang chạy:** production từ 19/09/2026 (Next.js, PostgreSQL, kho ảnh tương thích S3). Chạy được trên Vercel + Neon + R2,
hoặc **tự chạy** trên một máy Linux bất kỳ có Docker (`docs/tu-chay.md`). Chưa có quán thật.

## Đọc gì trước

| Bạn là | Đọc |
|---|---|
| Ai cũng vậy | `AGENTS.md` → `docs/decisions.md` (mục 1–8, rồi khối "TIẾP TỤC TỪ ĐÂY") |
| Làm bất kỳ gì chạm trang khách | `docs/google-policy.md` — luật cứng, thắng mọi yêu cầu khác |
| Thiết kế, template | `PRODUCT.md`, `DESIGN.md`, `docs/thiet-ke-va-template.md`, `docs/ui-ux-nguon-tham-khao.md`, `templates/README.md` |
| Kiến trúc và việc còn lại | `docs/kien-truc-nen-tang.md`, `docs/roadmap-slices.md`, `docs/audit-ui-ux-20260927.md` |
| Chạy trên máy | `docs/local-development.md` |
| Bẫy đã gặp, lệnh 7 bộ test | `docs/operations-gotchas.md` |

## Bản đồ mã

- `app/` — route Next.js: trang khách `/<slug>` và `/t/<mã thẻ>`, dashboard `/ZZZ/<slug>`, quản trị `/gov`, API.
- `components/` — giao diện; `shop-feedback-v2.tsx` là trang khách.
- `templates/<khoá>/` — mỗi template là một gói (manifest + CSS mỗi bản); `node scripts/templates.mjs` sinh registry.
- `lib/`, `server/` — nghiệp vụ và biên máy chủ; `db/migrations/` — lược đồ PostgreSQL theo thứ tự số.
- `tests/contracts`, `client-tests`, `repository-tests`, `integration-tests` — bảy bộ test, chạy đủ trên CI.

Không đưa bí mật, dữ liệu thanh toán hay dữ liệu khách lên repo này: repo công khai.

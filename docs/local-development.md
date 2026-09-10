# Chạy app local

## Chuẩn bị

Node.js 24 và pnpm 11.19.0. Các phiên bản package được chốt trong package.json và pnpm-lock.yaml.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Mở http://127.0.0.1:3000/t/demo. Dashboard mẫu: http://127.0.0.1:3000/demo/dashboard.

## Phạm vi của bản đầu

- Next.js/React/TypeScript chạy thật trên máy; chưa có Neon, R2, đăng nhập hoặc Vercel.
- Dữ liệu DEMO được lưu localStorage, tách khỏi database production tương lai. Không nhập dữ liệu nhạy cảm hoặc dùng tiếp nhận khách thật.
- Mỗi trình duyệt có một trải nghiệm demo `THỬ01`; sửa sao cập nhật cùng bản ghi. Chưa có khái niệm nhiều lần ghé/nhận diện người dùng thật.
- Ba khách mẫu chỉ để minh họa dashboard. Link Google/Zalo/Instagram/booking chưa có địa chỉ shop thật và không chuyển đi.
- Mỗi lần mở trang mặc định Tiếng Việt, chuyển English thủ công. Nội dung khách tự viết không dịch tự động.
- Chọn 1–3 sao: nút góp ý phồng và đậm màu 3 nhịp, mở form. Chọn 4–5 hoặc bấm nút góp ý: dừng hiệu ứng. Reduced motion chỉ đổi màu, không phồng. Nút Google giữ nguyên vị trí và nội dung.
- Ảnh event/logo là nội dung minh họa, không phải tài nguyên chính thức của 4Râu.

## Kiểm tra

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm exec playwright install chromium
pnpm test
```

Test trình duyệt chạy trên production build bằng Node.js, không cần tài khoản Vercel. GitHub Actions chạy cùng chuỗi trên Linux. Đây là kiểm tra nền app, không thay cho kiểm tra tenant/auth/database ở giai đoạn sau.

## Bước tiếp theo

Xem và duyệt cảm giác trang khách trước; sau đó triển khai DB/auth bằng môi trường development riêng, kiểm tra cách ly shop và retry/revision phía server. Chưa bật deploy production hoặc mua dịch vụ.

## Nhánh dữ liệu server

`/<shop>` và `/ZZZ/<shop>` đã có luồng API/PostgreSQL riêng, không dùng demo-store. Xem `docs/server-data.md` và `.env.example`; DB/auth thật chưa được kết nối. Các đường demo trên vẫn dùng để xem giao diện cũ.

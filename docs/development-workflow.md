# Vòng làm việc Codex → GitHub → Vercel

## Nguyên tắc

Tài là chủ dự án. Codex thiết kế/triển khai và báo bằng chứng kiểm tra. GitHub lưu nguồn, không phụ thuộc vào trí nhớ chat. Chưa có Vercel deployment hoặc app CI ở thời điểm khởi tạo repo.

1. Đọc AGENTS.md, docs/decisions.md và docs/mvp-architecture.md.
2. Bắt đầu từ main mới nhất; tạo branch cho một thay đổi có phạm vi rõ.
3. Sửa trên máy, kiểm tra phù hợp với thay đổi; không tự đưa credentials vào repo.
4. Commit và push branch; PR ghi vấn đề, hành vi mới, bằng chứng kiểm tra và giới hạn.
5. Khi có app: GitHub Actions kiểm tra lint, typecheck, các test quan trọng và production build. Preview Vercel chỉ nối môi trường thử.
6. Tài xem trải nghiệm/duyệt phát hành. Merge vào main khi các kiểm tra cần thiết đạt; production auto-deploy chỉ bật sau khi luồng được xác nhận.
7. Rollback ưu tiên revert commit hoặc triển khai bản tốt gần nhất, không force-push main. DB migration cần tương thích ngược hoặc kế hoạch rollback riêng.

## Kết nối hiện có và bước còn thiếu

- GitHub connector có quyền đọc/ghi repo private.
- Phải kiểm tra đường Git trên máy (fetch/push) riêng; connector đăng nhập không tự đồng nghĩa terminal có credentials.
- Không tạo PAT hoặc thay đổi xác thực không cần thiết. Nếu máy thiếu đăng nhập, chủ dùng luồng đăng nhập chính thức; không gửi token trong chat.
- Branch protection/rulesets cần kiểm tra tính khả dụng theo gói GitHub; không khẳng định đã bật khi chưa xác minh. Chưa mua GitHub Pro chỉ để hoàn thành bước này.
- Không cấu hình required checks không tồn tại hoặc reviewer thứ hai giả định khi dự án chỉ có một chủ.

## Tiêu chí nền tảng hoàn tất

Repo private được xác minh; tài liệu và snapshot đã lên GitHub; working tree local đồng bộ với commit remote; quyền fetch/push được kiểm tra hoặc giới hạn xác thực được ghi rõ. Nhánh app local bổ sung GitHub Actions chạy lint, typecheck, build và kiểm tra trình duyệt. Chỉ ghi nhận CI đạt khi có kết quả từ GitHub; Vercel vẫn chưa triển khai.

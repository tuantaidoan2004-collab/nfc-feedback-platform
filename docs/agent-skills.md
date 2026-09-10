# Skills cho dự án NFC

## Phạm vi và nguồn

Tài yêu cầu áp dụng hai bộ skill vào cách Codex làm việc trong dự án. Skill là hướng dẫn cho agent, không phải dependency chạy trên trang NFC hoặc Vercel.

- `addyosmani/agent-skills`, commit `6ca0cd7db39b41b1c37e26d335c507ee92382c6d`: 25 skill kỹ thuật trong `.agents/skills/`, tài liệu chung tại `.agents/references/`, giấy phép MIT tại `.agents/licenses/`.
- `rohitg00/agentmemory`, commit `e04ba88819c365c9acf9d6661ea802143e728bd6`: chọn `memory-discipline`, `recall`, `remember`, `recap`, `handoff`, `lesson` để khôi phục và lưu bối cảnh theo nhu cầu.

Chỉ nạp skill liên quan đến việc đang làm. Không đọc toàn bộ bộ skill vào mỗi lượt. Không tự cập nhật upstream; lần nâng cấp sau phải đọc thay đổi.

## Cách áp dụng

- Bắt đầu công việc: đọc `docs/decisions.md`; thiếu bối cảnh mới tra ghi chú Obsidian đã chỉ định.
- Tính năng mới: tiêu chí hoàn tất rõ → chia nhỏ → triển khai từng phần → kiểm tra tương ứng → review trước khi merge.
- UI: dùng `frontend-ui-engineering`; lỗi: `debugging-and-error-recovery`; review: `code-review-and-quality`; Git/CI: skill tương ứng.
- Quyết định/lời sửa có ích lâu dài: lưu ngắn gọn quyết định, lý do, nguồn và ngày khi cần liên tục bối cảnh hoặc Tài yêu cầu. Phân biệt chốt, đề xuất và đã kiểm chứng.
- Obsidian vẫn là bối cảnh sản phẩm bền vững; GitHub lưu checkpoint ngắn. Không sao chép toàn bộ hội thoại.

## Điều chỉnh so với upstream

Chỉ dẫn Tài và AGENTS.md dự án ưu tiên hơn skill bên ngoài. Không tự hỏi lại các việc đã được cho phép, không mở rộng phạm vi hoặc tự triển khai production. Kiểm tra phù hợp thay đổi; không bắt mọi thay đổi tài liệu chạy toàn bộ kiểm tra app.

Agentmemory upstream dùng MCP/server và hooks; dự án hiện chỉ tích hợp hướng dẫn, **chưa cài/chạy memory engine hoặc MCP**. Các lệnh `memory_*` trong skill không khả dụng chỉ nhờ chép SKILL.md. Khi chưa có tool, dùng checkpoint/Obsidian hiện có và nói đúng công cụ đã dùng. Không bật hooks, tự thu thập transcript, đồng bộ hằng ngày, model embedding, API trả phí hay server nền.

Không áp dụng yêu cầu upstream phải search/save ở mọi lượt: trí nhớ NFC vẫn theo nhu cầu. Không trộn Campus Laundry; không đưa dữ liệu vault, secret hoặc khách hàng vào bộ skill hay GitHub. Cài bộ skill không có nghĩa đảm bảo nhớ hoàn hảo.

Không dùng fallback của `handoff` sang session gần nhất của dự án khác. Nếu không có dữ liệu NFC, nêu đúng khoảng trống. Không chạy script hỗ trợ kèm skill trước khi đọc mã và xác nhận nó nằm trong phạm vi công việc đã được giao.

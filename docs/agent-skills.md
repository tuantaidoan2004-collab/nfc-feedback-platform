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

## Bộ skill thêm ngày 2026-09-17

Tài yêu cầu nạp thêm bảy nguồn. Agent đã **đọc nội dung trước khi chép**, không chạy `npx skills add` (lệnh đó tải và chạy một gói npm bên ngoài; chép tay cho cùng kết quả). Không chạy script nào đi kèm. `.claude/skills` là symlink tới `.agents/skills`, nên Claude Code và Codex dùng chung một bộ. `.vercelignore` và ESLint bỏ qua cả hai thư mục.

| Nguồn | Commit | Giấy phép | Đã chép vào `.agents/skills/` | Bỏ qua, lý do |
|---|---|---|---|---|
| `mattpocock/skills` | `959a8e9` | MIT | engineering: `ask-matt`, `codebase-design`, `diagnosing-bugs`, `domain-modeling`, `grill-with-docs`, `implement`, `improve-codebase-architecture`, `prototype`, `research`, `resolving-merge-conflicts`, `setup-matt-pocock-skills`, `tdd`, `to-spec`, `to-tickets`, `triage`, `wayfinder`, `wizard` · productivity: `grill-me`, `grilling`, `teach`, `to-questionnaire`, `wait-what`, `writing-for-agents` | `code-review` (trùng skill có sẵn của Claude Code), `handoff` (trùng skill dự án đã có), `misc/` và `in-progress/` (chưa ổn định hoặc sửa cấu hình repo) |
| `anthropics/skills` | `34040c9` | Apache 2.0 cho từng skill đã chép | `frontend-design`, `webapp-testing`, `theme-factory`, `canvas-design`, `skill-creator`, `algorithmic-art` | `docx`/`pdf`/`pptx`/`xlsx` giữ bản quyền, không được phân phối lại (đã có sẵn dạng plugin trong phiên); `doc-coauthoring` không có giấy phép; các skill còn lại không liên quan dự án |
| `vercel-labs/agent-browser` | `aff6125` | Apache 2.0 | `agent-browser` (chỉ là file dẫn đường) | CLI `agent-browser` **chưa cài** (cần `npm i -g` và tải Chromium). Phiên hiện đã có trình duyệt tích hợp |
| `heygen-com/hyperframes` | `a8a9fdb` | Apache 2.0 | `hyperframes-cli` | các skill video khác |
| `remotion-dev/skills` | `3b9e656` | **không có file giấy phép** | *không chép vào repo.* Cài riêng trên máy Tài: `~/.agents/skills/remotion-best-practices`, symlink từ `~/.claude/skills/` | — |
| `prime-skills/runcomfy-agent-skills` | `fca19ae` | MIT | `nano-banana-2` | các model khác |
| `nextlevelbuilder/ui-ux-pro-max-skill` | `15de38f` | MIT | `ui-ux-pro-max` (kèm script Python và dữ liệu CSV) | `design`, `brand`, `slides`… |

Giấy phép gốc nằm trong `.agents/licenses/`; các skill của Anthropic giữ `LICENSE.txt` trong thư mục riêng.

### Quy định riêng của dự án cho bộ này

- **`hyperframes-cli`:** chỉ render trên máy. **Không gửi telemetry hay feedback** về HeyGen (skill mặc định dặn gửi) nếu Tài chưa đồng ý. Không dùng HeyGen cloud, AWS Lambda hay Cloud Run. Cần FFmpeg, máy hiện chưa có.
- **`nano-banana-2`:** gọi API **trả phí** của RunComfy. **Không dùng** tới khi Tài chọn dịch vụ và tự đăng nhập; agent không nhập API key. Bỏ qua dòng `npx skills add … -g` trong skill.
- **`agent-browser`:** chỉ cài CLI khi Tài yêu cầu. Mặc định dùng trình duyệt tích hợp của phiên.
- **`ui-ux-pro-max`:** script Python chỉ đọc CSV cục bộ, không gọi mạng (đã đọc mã 17/09). Nguyên tắc sản phẩm (Google invariant, tiếng Việt mặc định) vẫn ưu tiên hơn gợi ý của skill.
- **`setup-matt-pocock-skills`:** chỉ chạy khi Tài yêu cầu, vì skill này ghi vào `AGENTS.md`. Các skill của mattpocock nói tới issue tracker GitHub: dự án chưa dùng, nên checkpoint vẫn là `docs/decisions.md`.
- **`remotion-best-practices`:** phần mềm Remotion có giấy phép riêng cho công ty. Kiểm lại trước khi dùng cho mục đích thương mại.
- Skill cài giữa phiên chỉ xuất hiện trong danh sách skill của agent từ **phiên sau**.

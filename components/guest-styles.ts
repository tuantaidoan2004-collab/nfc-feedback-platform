// Sinh bởi `node scripts/templates.mjs` từ templates/*/ — đừng sửa tay (lát M1).
// Mọi tệp CSS trang khách mặc, theo thứ tự: trang, lớp da chung, rồi từng bản template đóng băng (sau skin.css để token
// của bản template đè mặc định). Mọi selector gói trong `.guest` (tests/contracts/skin.spec.ts), nên dashboard nạp chúng
// (pages-panel.tsx khung trang khách) cũng không bị đổi kiểu. Dưới `next dev`, route mang CSS toàn cục mới tải lại mọi
// trang đang mở -- kể cả dashboard -- lần đầu nó được khung.
import './guest-page.css';
import './skin.css';
import '../templates/standard/v1.css';
import '../templates/minimal/v1.css';
import '../templates/glass/v1.css';
import '../templates/deco/v1.css';
import '../templates/spotlight/v1.css';
import '../templates/big-button/v1.css';

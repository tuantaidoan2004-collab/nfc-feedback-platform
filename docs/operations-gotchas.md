# Bẫy đã dính, đừng dính lại

Mỗi mục là **triệu chứng → nguyên nhân → cách xử**. Tất cả đều là chuyện đã xảy ra thật trong dự án này, không phải lo xa. Đọc trước khi dựng môi trường, deploy, hoặc thêm migration.

## Vercel

**`vercel ls` hiện `UNKNOWN`, build `0ms`, nhiều bản liên tiếp.** CLI hiển thị `Blocked` thành `UNKNOWN`. Đọc CLI sẽ tưởng hàng đợi build bị treo và đi tìm giới hạn gói. **Mở dashboard xem lý do thật.** Lần đó lý do là commit author email không thuộc tài khoản Git nào.

**Deployment bị chặn vì commit author email.** Máy không có `~/.gitconfig` nên Git tự dựng danh tính từ tên máy và IP (`doantai@192.168.2.26`). Vercel từ chối. **Đặt `git config --global user.email` bằng email của tài khoản GitHub.** Commit cũ giữ nguyên author; chỉ commit mới cần đúng.

**Đổi biến môi trường xong mà không thấy tác dụng.** `vercel deploy` từ CLI **không di chuyển alias theo branch**. Bản CLI chạy đúng khi gọi thẳng URL của nó, nhưng alias vẫn trỏ bản cũ. **Ship thay đổi env bằng cách push một commit**, đừng dùng `vercel deploy`.

**Xoay mật khẩu database xong thì mọi thứ trả 503, trong khi kiểm tay đều bình thường.** Vercel **chụp ảnh biến môi trường tại thời điểm tạo deployment**. Tích hợp cập nhật cấu hình project, nhưng bản đang phục vụ giữ ảnh chụp cũ. `vercel env pull` lấy về chuỗi mới nên càng gây hiểu nhầm. **Xoay credential là phải deploy lại.**

**`vercel env pull` thiếu biến.** Biến do tích hợp quản lý được gắn phạm vi theo git branch. **Thêm `--git-branch=<branch>`**, nếu không nó im lặng bỏ qua.

**Mọi request tới preview trả 302 về `vercel.com/sso-api`.** Deployment Protection bật mặc định. Dùng `vercel curl <url>` để đi xuyên qua khi cần kiểm, hoặc tắt trong Settings → Deployment Protection.

## Neon

**Branch preview do Vercel tạo thì rỗng bảng.** Nó nhánh ra từ **branch mặc định** của project. Nếu branch mặc định chưa migrate thì mọi branch preview sinh sau đều rỗng. **Migrate branch mặc định**, đừng migrate từng branch preview một.

**Reset mật khẩu ở một branch không đổi branch khác.** Mỗi branch giữ mật khẩu role riêng. Xoay thì xoay trên mọi branch đang dùng.

## macOS / Node

**Terminal mới không thấy `node`, `npm`, hay CLI cài toàn cục.** Máy này không có `~/.zshrc` nên nvm không được nạp. File đó giờ đã có; nếu mất thì cần lại `export NVM_DIR="$HOME/.nvm"` và nạp `nvm.sh`.

**`pnpm <script>` đòi xoá `node_modules`.** `node_modules` ở worktree là **symlink** sang checkout khác; pnpm coi là lệch trạng thái. Không có TTY thì nó tự huỷ, trong terminal thật thì **xoá dependency của cả hai bản**. **Gọi thẳng `node node_modules/<tool>`** như harness vẫn làm.

**`node_modules` không bị `.gitignore` bắt.** Pattern `node_modules/` có gạch chéo cuối **không khớp symlink**. Cần dòng `node_modules` không gạch chéo, ở cả `.gitignore` lẫn `.vercelignore` — thiếu thì upload đi theo symlink và gửi 1.9GB.

**Mật khẩu gõ tay vào prompt bị sai dù gõ đúng.** Nghi bộ gõ tiếng Việt biến đổi ký tự ngay tại Terminal (số ký tự khớp, nội dung không). Chưa chứng minh được, nhưng **đưa mật khẩu qua đường ống** thì hết: `printf '%s' 'mat-khau' | node scripts/... --reset`.

**Script `.mjs` không import được module TypeScript của dự án.** Mã dùng constructor parameter property, thứ type stripping của Node từ chối. Nên `scripts/bootstrap-admin.mjs` **nhân bản tham số scrypt**. Chống trôi lệch bằng test chạy chính script đó rồi đăng nhập qua thư viện — đừng bỏ test ấy.

**Đọc qua ống bị treo.** `readline` đợi hết một **dòng**; `printf '%s'` không có ký tự xuống dòng nên chờ vĩnh viễn rồi thoát với "unsettled await" mà **không ghi gì và không báo lỗi**. Đọc tới **hết luồng**.

## Test

**Đăng nhập báo `LOGIN_FAILED` như thể sai mật khẩu.** `login()` giữ `pg_try_advisory_xact_lock` **phạm vi toàn database**, còn test cô lập bằng **schema**. Hai case đăng nhập cùng lúc — trong một file hay hai file — thì một cái mất lock. **`playwright.repository.config.ts` phải `workers: 1`.** Muốn song song lại thì phải cấp **database riêng cho mỗi file**, không phải schema riêng.

**Chạy cả bộ integration một lệnh thì 11 test đỏ.** Ba lệnh harness **loại trừ nhau**, vì `publishing = owner || --publishing` nên `--owner`/`--admin` bật luôn publishing và đổi cách `/one` render:

```
node integration-tests/run-local.mjs public-v2.spec.ts browser-hardening.spec.ts --build
node integration-tests/run-local.mjs --publishing publishing.spec.ts --build
node integration-tests/run-local.mjs --owner owner-dashboard.spec.ts --build
node integration-tests/run-local.mjs --admin admin-http.spec.ts --build
```

**Một test không bao giờ pass được.** Nó gọi cổng 3319 (bản build production) nhưng harness dựng cổng đó **sau** pha test chính — `ECONNREFUSED` kể cả có `--build`. Trước khi sửa một test đỏ, hỏi: **nó có từng chạy được bao giờ chưa?**

**Thêm migration thì phải sửa hai chỗ.** Danh sách trong fixture `repository-tests/*.spec.ts` **và** trong `integration-tests/run-local.mjs`. Quên chỗ thứ hai thì cột thiếu và trang hiện "Dịch vụ đang gián đoạn" — trông hệt lỗi hạ tầng.

**Selector theo tên class CSS module không khớp gì.** Class bị băm lúc build. Dùng thuộc tính `data-`.

**`getByRole('alert')` vi phạm strict mode.** Next render `__next-route-announcer__` cũng mang `role="alert"` trên mọi trang. Thu hẹp bằng `getByRole('main')`.

## Kỷ luật khi làm

**Đừng nối `git commit` sau các bước kiểm mà không có `&&`.** Đã lỡ push một lần khi typecheck đang đỏ vì các lệnh nằm trên dòng riêng. Chuỗi phải là `tsc && eslint && test && git commit && git push`.

**Đừng để lỗi bị nuốt vào một mã chung.** `adminFailure` từng trả `SERVICE_UNAVAILABLE` mà vứt nguyên nhân. Một lỗi chỉ xảy ra trên deployment thì không còn gì để lần. Ghi `name: message` ra log máy chủ — không stack, không giá trị từ request. Chính dòng log đó tìm ra lỗi mật khẩu database. **`ownerFailure` vẫn đang nuốt lỗi tương tự, chưa sửa.**

**Thứ tự các bước là thứ giữ cho lỗi vô hại.** Khi một chuỗi thao tác không thể nằm trong một transaction, xếp sao cho hỏng giữa chừng là vô hại: kiểm điều kiện dễ sai nhất **trước khi ghi gì**, và để bước làm-cho-công-khai **cuối cùng**. Bản đầu của `ShopProvisioning` làm ngược và để lại một trang công khai không có chủ.

**Đo trước khi tối ưu.** Login mất 2,5s trên preview. Đo ra: 0,41s nền, 0,25s database, **1,9s scrypt** — và 1,9s đó là **cố ý**, đúng mức OWASP. Không phải lỗi hiệu năng. Máy local nhanh gấp 10 lần chỉ vì CPU mạnh hơn.

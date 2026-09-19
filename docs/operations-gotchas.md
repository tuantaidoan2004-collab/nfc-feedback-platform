# Bẫy đã dính, đừng dính lại

Mỗi mục là **triệu chứng → nguyên nhân → cách xử**. Tất cả đều là chuyện đã xảy ra thật trong dự án này, không phải lo xa. Đọc trước khi dựng môi trường, deploy, hoặc thêm migration.

## Vercel

**`vercel ls` hiện `UNKNOWN`, build `0ms`, nhiều bản liên tiếp.** CLI hiển thị `Blocked` thành `UNKNOWN`. Đọc CLI sẽ tưởng hàng đợi build bị treo và đi tìm giới hạn gói. **Mở dashboard xem lý do thật.** Lần đó lý do là commit author email không thuộc tài khoản Git nào.

**Deployment bị chặn vì commit author email.** Máy không có `~/.gitconfig` nên Git tự dựng danh tính từ tên máy và IP (`doantai@192.168.2.26`). Vercel từ chối. **Đặt `git config --global user.email` bằng email của tài khoản GitHub.** Commit cũ giữ nguyên author; chỉ commit mới cần đúng.

**Vừa đẩy `main` mà production đã trả 200 ngay lần kiểm đầu.** Đó là bản cũ: khi thêm biến, Vercel có thể redeploy bản đang chạy với biến mới. Kiểm bằng một dấu hiệu **chỉ bản mới có**, và xem `vercel ls --prod` còn `Building` không (lát F6).

**Đổi biến môi trường xong mà không thấy tác dụng.** `vercel deploy` từ CLI **không di chuyển alias theo branch**. Bản CLI chạy đúng khi gọi thẳng URL của nó, nhưng alias vẫn trỏ bản cũ. **Ship thay đổi env bằng cách push một commit**, đừng dùng `vercel deploy`.

**Xoay mật khẩu database xong thì mọi thứ trả 503, trong khi kiểm tay đều bình thường.** Vercel **chụp ảnh biến môi trường tại thời điểm tạo deployment**. Tích hợp cập nhật cấu hình project, nhưng bản đang phục vụ giữ ảnh chụp cũ. `vercel env pull` lấy về chuỗi mới nên càng gây hiểu nhầm. **Xoay credential là phải deploy lại.**

**`vercel env pull` thiếu biến.** Biến do tích hợp quản lý được gắn phạm vi theo git branch. **Thêm `--git-branch=<branch>`**, nếu không nó im lặng bỏ qua.

**Thêm biến cho cả Production và một branch preview thì báo "Environment Variables with `gitBranch` can only be used with `target=preview`".** Một biến gắn branch chỉ được là Preview. Muốn dùng cho cả hai thì chọn Production + Preview (mọi branch), hoặc lưu hai biến riêng. Tài dính khi thêm `NFC_SUPPORT_CONTACT` (lát F2); giá trị công khai nên chọn **Config**, không phải Secret.

**Mọi request tới preview trả 302 về `vercel.com/sso-api`.** Deployment Protection bật mặc định. Dùng `vercel curl <url>` để đi xuyên qua khi cần kiểm, hoặc tắt trong Settings → Deployment Protection.

## Neon

**Branch preview do Vercel tạo thì rỗng bảng.** Nó nhánh ra từ **branch mặc định** của project. Nếu branch mặc định chưa migrate thì mọi branch preview sinh sau đều rỗng. **Migrate branch mặc định**, đừng migrate từng branch preview một.

**Reset mật khẩu ở một branch không đổi branch khác.** Mỗi branch giữ mật khẩu role riêng. Xoay thì xoay trên mọi branch đang dùng.

## macOS / Node

**Terminal mới không thấy `node`, `npm`, hay CLI cài toàn cục.** Máy này không có `~/.zshrc` nên nvm không được nạp. File đó giờ đã có; nếu mất thì cần lại `export NVM_DIR="$HOME/.nvm"` và nạp `nvm.sh`.

**`pnpm <script>` đòi xoá `node_modules`.** `node_modules` ở worktree là **symlink** sang checkout khác; pnpm coi là lệch trạng thái. Không có TTY thì nó tự huỷ, trong terminal thật thì **xoá dependency của cả hai bản**. **Gọi thẳng `node node_modules/<tool>`** như harness vẫn làm.

**`node_modules` không bị `.gitignore` bắt.** Pattern `node_modules/` có gạch chéo cuối **không khớp symlink**. Cần dòng `node_modules` không gạch chéo, ở cả `.gitignore` lẫn `.vercelignore` — thiếu thì upload đi theo symlink và gửi 1.9GB.

**Log Vercel đầy dòng `error` mà không có lỗi nào.** Mỗi lần khởi động, `pg` in một cảnh báo SSL (`prefer`, `require`, `verify-ca` sẽ đổi nghĩa ở bản sau), và Vercel ghi nó với nhãn error. Đã xử lý trong mã: `lib/db-url.ts` đổi các chế độ đó thành `verify-full`, đúng hành vi hiện tại, cho cả hai pool và cho `scripts/migrate.mjs`. Không cần sửa chuỗi kết nối, vốn do tích hợp Neon quản lý.

**Đăng nhập trên điện thoại báo sai dù gõ đúng.** Bộ gõ tiếng Việt (Telex/VNI) đổi chữ trước khi tới trang: `r` là dấu hỏi, `s` là dấu sắc, nên "yourshop" thành "yoủshop". Trang đăng nhập giờ cảnh báo ngay khi ô @handle có chữ có dấu (lát F5). Cũng kiểm xem có đang mở **tên miền production** (đóng) thay vì alias preview không.

**Mật khẩu gõ tay vào prompt bị sai dù gõ đúng.** Nghi bộ gõ tiếng Việt biến đổi ký tự ngay tại Terminal (số ký tự khớp, nội dung không). Chưa chứng minh được, nhưng **đưa mật khẩu qua đường ống** thì hết: `printf '%s' 'mat-khau' | node scripts/... --reset`.

**Script `.mjs` không import được module TypeScript của dự án.** Mã dùng constructor parameter property, thứ type stripping của Node từ chối. Nên `scripts/bootstrap-admin.mjs` **nhân bản tham số scrypt**. Chống trôi lệch bằng test chạy chính script đó rồi đăng nhập qua thư viện — đừng bỏ test ấy.

**Đọc qua ống bị treo.** `readline` đợi hết một **dòng**; `printf '%s'` không có ký tự xuống dòng nên chờ vĩnh viễn rồi thoát với "unsettled await" mà **không ghi gì và không báo lỗi**. Đọc tới **hết luồng**.

## Next.js

**Cookie đặt cho hai `path` mà trình duyệt chỉ nhận một.** `response.cookies.set` **lưu theo tên**: gọi hai lần cùng tên với hai `path` thì lần sau ghi đè lần trước, không báo gì. Mạo danh cần cùng một cookie trên `/ZZZ/<slug>` và `/api/owner/v2/<slug>`, và dashboard đẩy admin về form đăng nhập owner vì chỉ đường API nhận được. **Tự ghi từng header `Set-Cookie`** — xem `setImpersonationCookies()`. Repository test không bắt được lỗi này, chỉ test qua HTTP mới bắt.

**Giá trị từ URL đi vào thuộc tính cookie.** Slug trong `params` là đầu vào người dùng; đưa thẳng vào `Path=` thì một `;` là chèn thêm thuộc tính. Kiểm định dạng trước.

## Test

**Đăng nhập báo `LOGIN_FAILED` như thể sai mật khẩu.** `login()` giữ `pg_try_advisory_xact_lock` **phạm vi toàn database**, còn test cô lập bằng **schema**. Hai case đăng nhập cùng lúc — trong một file hay hai file — thì một cái mất lock. **`playwright.repository.config.ts` phải `workers: 1`.** Muốn song song lại thì phải cấp **database riêng cho mỗi file**, không phải schema riêng.

**Mười mấy test repository và admin đỏ với lỗi CHECK trên chữ tiếng Việt** (`reason_check`, `feedback_message_check`). Cluster test tạo bằng `initdb` trong shell không có locale thì ra **`SQL_ASCII`**: `char_length` đếm byte và `[[:cntrl:]]` khớp byte của chữ có dấu. Luôn `initdb … -E UTF8 --locale=en_US.UTF-8`, rồi kiểm `SHOW server_encoding` ra `UTF8`. Lỗi của agent ở lát F1.

**Bộ repository thoát 1 mà không chạy test nào** ("No tests found", "Set NFC_TEST_DATABASE_URL"). Bộ này cần `NFC_TEST_DATABASE_URL=postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test`; harness tự đặt biến, còn lệnh repository thì không. Lỗi của agent ở lát F1.

**Có 7 bộ test, không phải 5.** Ngoài repository và bốn lệnh harness còn hai bộ không cần database, rất dễ quên:

```
node node_modules/@playwright/test/cli.js test --config=playwright.contracts.config.ts
node node_modules/@playwright/test/cli.js test --config=playwright.client.config.ts
```

`playwright.config.ts` mặc định là bộ UI cũ, cần bản build đang chạy ở cổng 3000, và không nằm trong danh sách kiểm của các lát.

**Chạy cả bộ integration một lệnh thì 11 test đỏ.** Ba lệnh harness **loại trừ nhau**, vì `publishing = owner || --publishing` nên `--owner`/`--admin` bật luôn publishing và đổi cách `/one` render:

```
node integration-tests/run-local.mjs public-v2.spec.ts browser-hardening.spec.ts --build
node integration-tests/run-local.mjs --publishing publishing.spec.ts --build
node integration-tests/run-local.mjs --owner owner-dashboard.spec.ts --build
node integration-tests/run-local.mjs --admin admin-http.spec.ts --build
```

**Một test không bao giờ pass được.** Nó gọi cổng 3319 (bản build production) nhưng harness dựng cổng đó **sau** pha test chính — `ECONNREFUSED` kể cả có `--build`. Trước khi sửa một test đỏ, hỏi: **nó có từng chạy được bao giờ chưa?**

**Thêm migration thì phải sửa hai chỗ.** Danh sách trong fixture `repository-tests/*.spec.ts` **và** trong `integration-tests/run-local.mjs`. Quên chỗ thứ hai thì cột thiếu và trang hiện "Dịch vụ đang gián đoạn" — trông hệt lỗi hạ tầng. Kể cả khi mã **cũ** bắt đầu đọc bảng mới: dashboard owner giờ đọc `admin_impersonation_sessions`, nên `owner-dashboard.spec.ts` và chế độ `--owner` của harness đều phải áp 005–007, dù chúng không phải test admin.

**Migration chạm bảng của 002 thì thêm vào mọi fixture dùng 002, không chỉ fixture có 009.** Migration 010 đổi `rating_experiences`, nên `visit-ratings.spec.ts` và `visit-v2-api.spec.ts` (chỉ áp 001–002) cũng phải áp nó. Trong `run-local.mjs`, 010 nằm ngay sau 002 và **ngoài** nhánh `publishing`/`owner`, vì chế độ public-v2 cũng ghi góp ý không sao.

**Đổi một luật sản phẩm thì test cũ đỏ theo; đọc xem test đó thật sự bảo vệ điều gì.** Khi bỏ `RATING_REQUIRED`, test "synthetic resume" đỏ ở câu "nút Gửi bị khoá". Câu đó chỉ đúng dưới luật cũ; bất biến thật của test là **nháp không tự gửi** (`feedback_message` vẫn null), và phần đó giữ nguyên. Sửa câu kiểm phụ, ghi lý do ngay trong test; đừng xoá phần kiểm bất biến.

**Khi bỏ một hành vi giao diện, tìm mọi test dùng nó bằng `grep` trên cả thư mục, đừng dựa vào danh sách nhớ.** Lát F1 có `grep` và thấy `admin-http.spec.ts` dùng `data-customer-link`, nhưng chỉ đọc đúng dòng khớp, bỏ sót **dòng ngay sau** kiểm link luôn hiện; bộ admin đỏ. Đọc cả đoạn quanh chỗ khớp. Lát B3 sửa test của public-v2, browser-hardening và publishing nhưng quên `owner-dashboard.spec.ts` (nó cũng bấm sao trên trang khách). Và một fixture chỉ áp 001–003 vẫn đỏ khi repository bắt đầu ghi cột của 011: fixture nào gọi `VisitRatingRepository` đều cần mọi migration đụng tới bảng của 002.

**`day` là từ khoá của PostgreSQL.** `SELECT to_char(d.day,'…') day` báo `syntax error at or near "day"`; phải viết `AS day`. Lỗi hiện ra ở dòng gọi `db.query`, không phải ở chuỗi SQL, nên dễ tìm nhầm chỗ.

**Hai lần `clock_timestamp()` trong một câu lệnh cho hai giá trị khác nhau.** Test đặt `created_at=clock_timestamp()-31 phút, expires_at=clock_timestamp()-1 phút` lúc xanh lúc đỏ: lần gọi sau muộn hơn vài micro giây nên khoảng cách vượt CHECK 30 phút. Lấy **một** mốc (`WITH t AS (SELECT clock_timestamp() n)`) và để khoảng cách cách xa giới hạn.

**Chỉnh thời hạn trong test thì kiểm CHECK của bảng.** `admin_auth_sessions` và `owner_auth_sessions_v2` đòi `expires_at > created_at`; chỉ lùi `expires_at` là vi phạm. Lùi cả `created_at`. `admin_impersonation_sessions` còn có trigger cấm sửa: test phải tạm `DISABLE TRIGGER` rồi bật lại.

**Chạy riêng một test UI của harness thì đỏ, chạy cả file thì xanh.** Harness chạy test chính trên `next dev`. Server dev biên dịch một trang ở lần tải đầu tiên, rồi **ra lệnh tải lại cho mọi trang đang mở**. Test nào mở trang lần đầu trong khi đang có trang khác mở thì một trang bị tải lại giữa chừng: ô vừa gõ mất trắng, người dùng rơi về form đăng nhập dù `POST /login` trả 200. Các test chạy trước biên dịch sẵn trang nên cả file ổn định; chạy lẻ bằng `--grep`, hoặc khi một test phía trước đỏ sớm, thì test sau đỏ theo. Làm nóng bằng request chỉ biên dịch phía server, **không đủ**. Kết luận phải dựa trên **cả file**; đừng sửa sản phẩm vì lỗi này. Đã mất một vòng bỏ nhầm `router.refresh()` trước khi tìm ra nguyên nhân.

**Test "nút nằm trong màn hình" phải dùng vùng nhìn thấy thật của Safari.** Ở 320×568, từ nút Google tới đáy khung góp ý chỉ ~507px, nên một bản cố tình cuộn hết khung vẫn qua test. Safari trên iPhone SE chỉ còn khoảng 375×548 và 320×460 sau thanh công cụ; với các cỡ đó bản lỗi bị bắt. Khi test mới xanh ngay lần đầu, **cố tình phá mã** một lần để chắc test bắt được lỗi.

**Canvas gắn vào `body` vẫn đè lên popup dù `z-index` thấp hơn.** `.guest` có `isolation: isolate`, tức một stacking context riêng; mọi thứ bên trong nó so thứ tự với nhau, còn cả khối so với canvas ở cấp `body`. Pháo giấy phải gắn **vào trong** `.guest`.

**"Chạm ra ngoài thì thu gọn" phải trừ mọi nút thuộc cùng luồng.** Bản đầu thu khung khi bấm "Thử lại lần gửi" (nút nằm ngoài khung), test public-v2 bắt được vì ô nhập biến mất. Vùng trạng thái, nút thử lại, sao và nút mở khung đều tính là bên trong.

**Playwright không bấm được nút đang có animation lặp.** Nút máy bay nổi lên xuống liên tục; `click()` chờ phần tử đứng yên nên hết giờ (60 giây mỗi test, cả bộ publishing mất hơn 5 phút). Nút nổi là cố ý: test bấm bằng `click({ force: true })`.

**Chữ trong SVG tính vào text của link.** Logo Zalo có `<text>Zalo</text>`, nên `toHaveText` của link đọc ra "ZaloZalo". Logo đã `aria-hidden`; kiểm nhãn bằng `span` hoặc `getByRole('link', { name })`.

**macOS không có lệnh `timeout`.** Lệnh báo exit 127 mà không chạy gì.

**Phần tử render phía server hiện ra trước khi trang hydrate.** Banner mạo danh có sẵn trong HTML, nên chờ nó rồi bấm nút menu thì cú bấm rơi vào nút chưa có trình xử lý: nút nhận focus nhưng không có gì xảy ra. Chờ một thứ do client tải (ô số liệu) trước khi bấm.

**Playwright xoá `test-results/` mỗi lần chạy.** Ảnh chụp của bộ trước mất khi chạy bộ sau; chép ra scratchpad ngay sau khi chạy.

**Kiểm "không lộ" bằng cả giá trị, không bằng một đoạn ngắn.** `expect(text).not.toContain('961')` đỏ ngẫu nhiên vì UUID và mốc thời gian cũng chứa chữ số. Kiểm cả số đầy đủ.

**Radio hoặc checkbox chỉ đổi sau khi server trả lời thì `check()` của Playwright báo "did not change its state"**, và người dùng thật cũng thấy bấm không ăn. Hiện lựa chọn ngay (trạng thái tạm) rồi để giá trị đã lưu thay vào.

**`toBeDisabled` không đọc `<option disabled>`.** Kiểm bằng `toHaveAttribute('disabled','')`.

**Biên dịch lần đầu một API cũng làm trang đang mở tải lại.** Test đặt mật khẩu qua giao diện: trang `/owner/setup/<link>` gọi `POST /api/owner/v2/setup` lần đầu; `next dev` biên dịch API rồi tải lại trang, lúc đó link đã dùng nên hiện "Liên kết không dùng được". Làm nóng bằng một request tới đúng API **trước khi** mở trang (lát F3).

**`getByLabel` không khớp `select` nằm trong `label`.** Tên truy cập của nó gồm cả chữ của lựa chọn đang chọn ("Vai Nhân viên"). Chọn bằng `locator('select')` trong khung đó. Ngược lại, chữ của mọi lựa chọn nằm trong nhãn, nên `getByLabel('X')` không `exact` còn khớp cả `select` có lựa chọn tên X (lát F5).

**`.app label`, `.app input` và `.app button` thắng mọi class đơn.** `.app button` đặt lại `font`, nên một nút tròn nhỏ (ⓘ) bị kéo thành bầu dục (lát F4). Một `label` có class riêng (ô tìm kiếm, hàng công tắc) vẫn bị đổi thành lưới và ô nhập bị thêm viền. Viết `.app .ten-class`. Chỉ ảnh chụp bắt được lỗi này, test không bắt được (lát F3).

**Test mở `/preview` hoặc trang khách lần đầu trong lúc một trang khác đang giữ trạng thái thì trang đó bị tải lại** (bẫy `next dev` ở trên). Mở trước các route đó trong một tab riêng ở đầu test.

**Vào thẳng `/gov` hay `/ZZZ/…` mà không phải đăng nhập là do phiên còn hạn, không phải lỗ hổng.** Kiểm bằng request không cookie (`vercel curl`) hoặc cửa sổ ẩn danh: phải thấy 307 về trang đăng nhập và 401 ở API.

**Công cụ ghi file của agent biến `\u0000` trong chuỗi thành ký tự NUL thật.** Git coi file đó là nhị phân (`Bin` trong `git diff --stat`), và `grep -P` trên macOS không bắt được. Đọc `git diff --cached --stat` trước khi commit; quét ký tự điều khiển bằng Python. Lát E1 dính ở `lib/owner/cards.ts`. Lát F2 dính lại ở `lib/owner/profile.ts` (cả `\u007f`); lần này quét ngay sau khi ghi nên bắt được trước commit. **Mỗi lần ghi file có regex ký tự điều khiển, quét ngay.** Lát F3: công cụ đổi **mọi** escape `\\uXXXX`, kể cả `\\u0300-\\u036f` (dấu kết hợp, không phải ký tự điều khiển, nên bản quét cũ không bắt). Sau khi ghi, `grep` xem chuỗi escape còn nguyên không. Lát F4: escape trong **lệnh shell** (heredoc) cũng bị đổi, và lệnh bị chặn vì chứa ký tự điều khiển. Trong mã, viết `String.fromCharCode(0)` thay cho `\\u0000`.

**Mã thẻ ghi vào chip gồm cả tên miền.** Đổi tên miền sau khi đã ghi thẻ thì thẻ cũ trỏ về tên miền cũ.

**Đừng kiểm database ngay sau khi bấm một nút.** Nút gửi request rồi mới hiện thông báo; đọc bảng một lần ngay sau đó thấy 0 dòng và trông như nút hỏng. Dùng `expect.poll`.

**Selector theo tên class CSS module không khớp gì.** Class bị băm lúc build. Dùng thuộc tính `data-`.

**`getByRole('alert')` vi phạm strict mode.** Next render `__next-route-announcer__` cũng mang `role="alert"` trên mọi trang. Thu hẹp bằng `getByRole('main')`.

**Đặt con trỏ trong ô nhập sau khi đổi giá trị: dùng `useLayoutEffect`, đừng dùng `requestAnimationFrame`.** Khung vẽ sau đến trễ hơn các phím gõ tiếp theo, kéo con trỏ lùi và làm chữ nhảy chỗ. Test gõ bằng `pressSequentially` bắt được, nhưng chỉ lúc có lúc không (lát F5).

## Kỷ luật khi làm

**Đừng nối `git commit` sau các bước kiểm mà không có `&&`.** Đã lỡ push một lần khi typecheck đang đỏ vì các lệnh nằm trên dòng riêng. Chuỗi phải là `tsc && eslint && test && git commit && git push`.

**Hai phiên agent cùng sửa một worktree thì `git add <file>` gom luôn việc của phiên kia.** Một task tách ra chạy ngay trong worktree này (không tạo worktree riêng), sửa `shop-provisioning.spec.ts` đúng lúc lát mạo danh cũng sửa file đó. Commit lát mạo danh lấy cả test gọi `links.reissue()`, hàm chỉ có trong phần chưa commit của phiên kia, nên **commit đứng riêng không qua được `tsc`**, trong khi `tsc` trên working tree vẫn xanh. **Trước khi commit, đọc `git diff --cached --stat` và so số dòng với việc mình đã làm.** Nghi thì kiểm commit trong một worktree tạm (`git worktree add --detach`), đừng kiểm working tree. **Kiểm đủ cả bốn lệnh harness, không chỉ tsc và repository**: lần đầu sửa chỉ gỡ được file repository test; một test HTTP của phiên kia vẫn nằm trong commit và chỉ harness mới lộ ra.

**Lệnh đưa cho Tài chạy phải tự đủ.** Ở lát B1, agent đưa `DATABASE_URL='<chuỗi kết nối …>' node scripts/migrate.mjs`: không có `cd`, còn chỗ trống thì trông như chữ để dán nguyên. Tài chạy trong `~` với nguyên chuỗi đó và nhận `Cannot find module '/Users/doantai/scripts/migrate.mjs'` (không chạm database). Lệnh cho Tài luôn **bắt đầu bằng `cd` tới đúng worktree** (checkout ở `Documents` đang ở `main`, có thể thiếu migration mới), và **đọc bí mật bằng `read -rs`** thay vì chỗ trống trong lệnh.

**zsh không tách biến thành nhiều tham số.** Vòng `for m in "--owner owner-dashboard.spec.ts" …; do node run-local.mjs $m; done` truyền cả chuỗi làm **một** tham số; harness báo `unknown option` và thoát 1, trông như ba bộ test cùng đỏ. Lỗi của agent ở lát B1. Viết từng lệnh ra, hoặc dùng mảng `${=m}`.

**Đừng để lỗi bị nuốt vào một mã chung.** `adminFailure` từng trả `SERVICE_UNAVAILABLE` mà vứt nguyên nhân. Một lỗi chỉ xảy ra trên deployment thì không còn gì để lần. Ghi `name: message` ra log máy chủ — không stack, không giá trị từ request. Chính dòng log đó tìm ra lỗi mật khẩu database. `ownerFailure` giờ ghi `OWNER_UNEXPECTED` theo cùng quy tắc (sửa ở lát mạo danh).

**Đừng giữ advisory lock trên một kết nối pool trong khi việc bên trong cần thêm kết nối.** Bản đầu của `ensureTemplate` khoá trên một kết nối, rồi `PublishingAdmin` mở kết nối khác để tạo nháp và phát hành. Mười lần gọi cùng lúc giữ hết pool để chờ khoá, còn bên giữ khoá không lấy được kết nối nào: treo cho tới khi test hết giờ. Pool production chỉ có **3 kết nối**, nên 3 lần tạo shop cùng lúc là đủ treo. Làm từng bước chịu được việc chạy trùng (unique index, khoá chính, revision), bên chậm chân thì thử lại ngắn. Test đồng thời phải chạy qua pool **cỡ production**.

**Danh tính là toàn hệ thống, quyền là theo shop.** Một người có thể ở nhiều shop. Mọi thao tác trên **danh tính** (đặt lại mật khẩu, cấp link, khoá tài khoản) mà chỉ dựa trên quyền **ở một shop** là lỗ hổng: shop A chiếm được tài khoản đang làm chủ shop B (F-008, lỗi của Claude ở lát F3, Astra bắt 20/09). Khi so quyền giữa hai người, dùng **quyền hiệu lực** (vai cộng quyền cấp riêng), không dùng quyền của vai (F-007).

**Thứ tự các bước là thứ giữ cho lỗi vô hại.** Khi một chuỗi thao tác không thể nằm trong một transaction, xếp sao cho hỏng giữa chừng là vô hại: kiểm điều kiện dễ sai nhất **trước khi ghi gì**, và để bước làm-cho-công-khai **cuối cùng**. Bản đầu của `ShopProvisioning` làm ngược và để lại một trang công khai không có chủ.

**Đo trước khi tối ưu.** Login mất 2,5s trên preview. Đo ra: 0,41s nền, 0,25s database, **1,9s scrypt** — và 1,9s đó là **cố ý**, đúng mức OWASP. Không phải lỗi hiệu năng. Máy local nhanh gấp 10 lần chỉ vì CPU mạnh hơn.


## Astra worktree riêng — 20/09/2026

- Git common-dir nằm ngoài worktree: tạo branch/worktree cần quyền ghi Git common-dir. Không đổi branch Claude hoặc dùng stash.
- initdb/test PostgreSQL trong sandbox lần đầu thất bại shared memory/EPERM; chạy có quyền trên cluster local riêng 55449 mới cho bằng chứng test. initdb UTF8/en_US.UTF-8.
- Client tests cũng cần localhost/Chrome: lần sandbox 4 failed + 5 did not run do EPERM, chạy có quyền 75 passed. Không ghi lỗi môi trường thành lỗi sản phẩm.
- Fixture repository cũ hardcode 55439. Lượt này dùng script ngoài repo tạm đổi cổng trong worktree Astra rồi phục hồi byte-for-byte trong finally; không đụng cổng Claude. Spec owner-setup mới chỉ chấp nhận hai URL localhost test chính xác 55439/55449.
- Chờ callback audit để giữ giao dịch cấp link thứ nhất; đợi giao dịch thứ hai thật sự có wait_event_type=Lock rồi mới nhả. Tránh dùng sleep để đoán tranh chấp F-001.

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

**CI trên GitHub chạy đúng 7 bộ này** (`.github/workflows/ci.yml`, lát A4): bốn job song song — static (tsc, eslint, build, contracts), client, repository, và integration chạy ma trận 4 lệnh harness. Job nào cần database thì tự dựng PostgreSQL **cổng 55439**, `--encoding=UTF8 --locale=C.UTF-8`, và `.github/scripts/check-encoding.mjs` dừng sớm nếu cluster không phải UTF8. Bộ mặc định `playwright.config.ts` (tests/feedback, tests/server-storage của giao diện cũ) **không** nằm trong CI; nó sẽ đi cùng đợt dọn mã cũ A3.

**Một tệp test có thể tự trỏ Chrome, bỏ qua cấu hình chung.** `browser-hardening.spec.ts` khai báo `test.use({ launchOptions: { executablePath: … } })` và còn gọi `chromium.launch({ executablePath: … })` trong hai ca, nên sửa cấu hình chung không đủ: trên CI bảy ca đỏ mà tên lỗi trông như lỗi sản phẩm (BFCache, tab ẩn hiện). Khi đổi cách chọn trình duyệt, `grep` cả `executablePath` lẫn `chromium.launch` (lát A4).

**Test mở trình duyệt có cửa sổ (`headless: false`) cần màn hình ảo trên CI**: `xvfb-run -a`. **Nhưng `xvfb-run` chỉ đặt `DISPLAY` và `XAUTHORITY` cho tiến trình nó gọi.** Harness dựng môi trường cho tiến trình con bằng **danh sách cho phép** (`CI`, `CHROME_PATH`), nên hai biến đó không qua được và Chrome có cửa sổ chết với `Missing X server or $DISPLAY` — trông y như lỗi cấu hình Chrome. Thêm `xvfb` vào workflow **không đủ**; phải cho `DISPLAY` và `XAUTHORITY` vào danh sách cho phép. Lỗi của Claude ở lát A4: tám lần chạy CI đỏ liên tiếp chỉ vì đúng dòng này.

**Một ca skip trên máy dev là một ca chưa từng chạy.** Ca `3E foreground visibility` tự `test.skip` khi môi trường không tạo được trạng thái tab `hidden` thật — macOS không tạo được, nên tại máy nó **luôn skip**. Lên Linux + `xvfb` nó chạy lần đầu, và lần đầu ấy là trên CI, nơi không ai gắn được debugger. Khi một ca chỉ chạy trên CI: cho nó **tự in bằng chứng** (gom mọi thứ quan sát được vào **một** `expect.poll(...).toEqual({...})` để thông báo lỗi in cả hai vế, và `info.attach` trong `finally`), đừng để bốn câu `expect` rời nhau chỉ nêu điểm khác đầu tiên.

**Log lỗi của Playwright bị chôn dưới log app.** Khi harness thất bại nó đổ 4000 ký tự cuối của `on.log`/`off.log`/`production.log`, nên phần Playwright in tên ca đỏ và câu `expect` nằm **phía trên**, cách cuối log hơn 100 dòng. Đọc log CI thì tìm `✘` hoặc `1 failed`, đừng đọc từ dưới lên.

**Chrome thật trong test không còn trỏ cứng đường dẫn macOS.** `playwright.chrome.ts` chọn: `CHROME_PATH` nếu có, `channel: 'chrome'` khi `CI=1`, còn lại là app trên máy Tài. Harness chuyển tiếp đúng hai biến `CI` và `CHROME_PATH` vào tiến trình con (danh sách cho phép, không đổ cả môi trường).

**Thêm một biến môi trường mới thì có bốn chỗ phải nhớ, không phải một.** `NFC_TOTP_KEY` ở lát A2 cần: (1) Vercel Production, (2) Vercel Preview, (3) **danh sách môi trường của harness** trong `run-local.mjs` (cả tiến trình app lẫn tiến trình Playwright), (4) **nơi bộ test chạy không qua harness** — ở đây là `playwright.repository.config.ts`. Claude nhớ ba chỗ đầu, quên chỗ thứ tư, chạy local bằng cách **tự gõ biến vào dòng lệnh**, báo "7 bộ xanh", và CI đỏ 21 test với `TOTP_KEY_MISSING`. Vercel không liên quan gì tới GitHub Actions.

**Kiểm bằng cách xoá biến, đừng bằng cách nhớ.** Chạy lại bộ test bằng `env -u TEN_BIEN …` là tái hiện đúng điều kiện CI. Nếu một lần chạy local chỉ xanh nhờ thứ gì đó gõ tay, thì nó **không** chứng minh được CI sẽ xanh — và đừng báo "xanh" như thể có. Tốt hơn nữa: đặt giá trị fixture ngay trong config của bộ test, để không ai phải nhớ lần sau.

**Bật một luật bảo mật mới thì mọi fixture có tài khoản liên quan phải theo.** Lát A2 bắt admin phải có 2FA ở **`authorizeAdmin`**, nên 17 test ở 6 tệp đỏ cùng lúc với `TWO_FACTOR_REQUIRED`. Đó là dấu hiệu **đúng** — nó cho thấy luật chặn ở đâu — nhưng phải sửa fixture, không phải nới luật. Cách làm: fixture đăng nhập bằng mật khẩu **trước**, rồi bật 2FA bằng SQL (`enrolAdmin` trong `owner-fixture.ts`); test nào đăng nhập lại sau đó phải kèm mã thật. Và fixture nào **không** áp migration 005 thì đừng thêm 019 vào (nó `ALTER TABLE platform_admins`).

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

**Bảng đếm tần suất là bảng dữ liệu cá nhân, và nó phải tự dọn.** Lát A1 ghi **IP nguyên** vào `public_request_limits.bucket` và **không bao giờ xoá dòng cũ**, nên mỗi địa chỉ từng ghé một thẻ ở lại vĩnh viễn — trong khi bảng tương đương của admin đã tự dọn từ migration 005. Claude còn **báo cáo sai với Tài** rằng IP đã được băm. Tìm ra khi ngồi viết trang chính sách quyền riêng tư, tức là **viết cam kết pháp lý buộc phải đọc lại mã**, và đó là giá trị thật của lát đó. Sửa: băm có tách miền, và `DELETE` dòng quá một giờ ở mỗi lượt `register`. Nói đúng tên: băm IP là **giả danh**, không phải ẩn danh — chỉ có bốn tỉ địa chỉ IPv4, ai cầm bảng cũng dò ngược được; thứ làm dữ liệu thật sự ngắn hạn là việc xoá.

**Khớp từ khoá bằng `includes` là khớp chuỗi con, không phải khớp từ.** Bộ lọc chính sách Google từ chối *"Đánh giá của bạn rất quan trọng với quán"* — câu trung lập nhất một shop có thể viết — vì `qua` nằm trong `quán` và `quan trọng`. Đệm hai đầu bằng dấu cách rồi tìm `' từ '` thì thành khớp theo từ mà vẫn khớp được cụm nhiều từ. Lỗi của Claude ở lát F-013; test bắt được vì có sẵn câu trung lập trong danh sách phải qua.

**Một module dùng chung kéo theo `node:crypto` sẽ làm hỏng build khi client import nó.** `lib/publishing/policy.ts` chạy cả ở trình duyệt; nó import `fold` từ `lib/owner/activity.ts`, và `next build` đỏ với `Reading from "node:crypto" is not handled`. Tách helper thuần sang module riêng không import gì (`lib/text-fold.ts`). **`tsc` và `eslint` đều xanh trước đó** — chỉ `next build` bắt được, nên đừng bỏ bước build.

**Đổi một ô nhập thành `select` thì test UI cũ hỏng theo kiểu khó đọc.** `locator.fill` trên `<select>` không báo "sai loại phần tử" mà **hết giờ 60 giây**. Khi đổi kiểu điều khiển, `grep` luôn `getByRole('textbox'` cho nhãn đó.

**`pg` trả `timestamptz` về thành đối tượng `Date`, không phải chuỗi.** `Date.parse(row.when)` ra `NaN`, mọi phép so sánh với `NaN` đều `false`, nên cả một tín hiệu an toàn **im lặng tắt** mà không có lỗi nào. Dùng `new Date(value).getTime()` (nhận cả hai), hoặc lấy chuỗi bằng helper `utc()` sẵn có. Lỗi của Claude ở lát A1; chỉ có test bắt được.

**Script sửa hàng loạt dừng giữa chừng thì phần sau không chạy.** Một script Python sửa 11 tệp danh sách migration ném `AssertionError` ở tệp thứ 9, nên `integration-tests/run-local.mjs` — nằm ở cuối script — **không được cập nhật**, đúng cái bẫy "thêm migration phải sửa hai chỗ" ngay bên dưới. Sau khi chạy script sửa nhiều tệp, **`grep` lại từng tệp trong danh sách** thay vì tin là nó chạy hết.

**PostgreSQL từ chối số lặp regex lớn hơn 255.** `CHECK (col ~ '^...{16,512}$')` báo `invalid regular expression: invalid repetition count(s)` — và lỗi hiện ra ở **câu `UPDATE` đầu tiên chạm cột đó**, không phải ở lúc chạy migration, nên rất dễ tìm nhầm chỗ. Giới hạn độ dài bằng `length(col) BETWEEN a AND b`, để regex chỉ lo hình dạng. Lỗi của Claude ở lát A2.

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

**Ghi "bắn rồi quên" sống lâu hơn test sinh ra nó.** Beacon đo hành vi của lát mục 7 vẫn đang `INSERT` khi test kế tiếp chạy `TRUNCATE shops … CASCADE`, và vì bảng sự kiện có khoá ngoại tới `shops` nên nó bị kéo vào cuộc: **`deadlock detected`**, ở một ca chẳng liên quan, mỗi lần một ca khác nhau. Hai bài học: **bảng ghi nhật ký đừng có khoá ngoại vào bảng biến đổi** (giá trị đã do server tự phân giải, khoá ngoại không mua thêm gì), và **test đọc bảng đó phải lọc theo dữ liệu của chính nó**, đừng giả định bảng rỗng.

**Thêm một route mới thì phải thêm vào danh sách làm nóng của harness.** Lát mục 7 thêm route beacon; beacon bắn từ trang khách khi một test khác đang có form đăng nhập điền dở, `next dev` biên dịch route lần đầu rồi **tải lại mọi trang đang mở**, và test admin hỏng ở một dòng không liên quan gì tới sự kiện (`locator.click: Test ended` chờ `[data-view="settings"]`), chạy 1,5 phút thay vì 33 giây. Thêm vào `warm()` trong `run-local.mjs` là hết. Triệu chứng đặc trưng: **một test đỏ ở chỗ chẳng dính gì tới thay đổi, và cả bộ chạy chậm bất thường.**

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

**`read -p "prompt"` là bash; máy Tài dùng zsh.** Trong zsh `-p` nghĩa là "đọc từ coprocess", nên lệnh chết ngay với `read: -p: no coprocess`. Hậu quả **không phải** lệnh lỗi vô hại: `&&` cắt mạch, dấu nhắc không hiện, Tài dán **chuỗi kết nối Neon production thẳng vào dòng lệnh** — vào màn hình và vào `~/.zsh_history`, tức là **lộ mật khẩu**, phải xoay credential và deploy lại. Viết cho zsh: `printf 'nhãn: ' && read -rs BIEN` (chạy được ở cả bash lẫn zsh), hoặc `read -rs 'BIEN?nhãn: '` kiểu zsh. Lỗi của Claude ở lát A1. **Mọi lệnh đưa cho Tài phải viết cho zsh**, vì đó là shell của máy này.

**Lệnh đưa cho Tài chạy phải tự đủ.** Ở lát B1, agent đưa `DATABASE_URL='<chuỗi kết nối …>' node scripts/migrate.mjs`: không có `cd`, còn chỗ trống thì trông như chữ để dán nguyên. Tài chạy trong `~` với nguyên chuỗi đó và nhận `Cannot find module '/Users/doantai/scripts/migrate.mjs'` (không chạm database). Lệnh cho Tài luôn **bắt đầu bằng `cd` tới đúng worktree** (checkout ở `Documents` đang ở `main`, có thể thiếu migration mới), và **đọc bí mật bằng `read -rs`** thay vì chỗ trống trong lệnh.

**zsh không tách biến thành nhiều tham số.** Vòng `for m in "--owner owner-dashboard.spec.ts" …; do node run-local.mjs $m; done` truyền cả chuỗi làm **một** tham số; harness báo `unknown option` và thoát 1, trông như ba bộ test cùng đỏ. Lỗi của agent ở lát B1. Viết từng lệnh ra, hoặc dùng mảng `${=m}`.

**Đừng để lỗi bị nuốt vào một mã chung.** `adminFailure` từng trả `SERVICE_UNAVAILABLE` mà vứt nguyên nhân. Một lỗi chỉ xảy ra trên deployment thì không còn gì để lần. Ghi `name: message` ra log máy chủ — không stack, không giá trị từ request. Chính dòng log đó tìm ra lỗi mật khẩu database. `ownerFailure` giờ ghi `OWNER_UNEXPECTED` theo cùng quy tắc (sửa ở lát mạo danh).

**`PoolClient` của `pg` cũng có `connect()`.** Muốn một lớp nhận cả `Pool` lẫn client (để nhập vào transaction của bên gọi) thì **đừng** phân biệt bằng `typeof db.connect === 'function'` — client là một `Client`, có `connect`, và gọi nó ném `Client has already been connected. You cannot reuse a client.` Phân biệt bằng **`release`**: chỉ client được mượn từ pool mới có. Lỗi của Claude ở lát F-011.

**Một lỗi ném ra giữa chuỗi ghi không có transaction để lại dấu vết khó đọc.** `design.save` ghi nháp trên một kết nối rồi ghi sổ trên kết nối sau; ghi sổ hỏng thì nháp **đã nhảy revision**, nên lần thử lại báo `DRAFT_CONFLICT` — nghe như có người khác đang sửa, trong khi thật ra là chính lần trước của mình. Gộp kiểm quyền + ghi + sổ + hoạt động vào **một** transaction.

**Đừng giữ advisory lock trên một kết nối pool trong khi việc bên trong cần thêm kết nối.** Bản đầu của `ensureTemplate` khoá trên một kết nối, rồi `PublishingAdmin` mở kết nối khác để tạo nháp và phát hành. Mười lần gọi cùng lúc giữ hết pool để chờ khoá, còn bên giữ khoá không lấy được kết nối nào: treo cho tới khi test hết giờ. Pool production chỉ có **3 kết nối**, nên 3 lần tạo shop cùng lúc là đủ treo. Làm từng bước chịu được việc chạy trùng (unique index, khoá chính, revision), bên chậm chân thì thử lại ngắn. Test đồng thời phải chạy qua pool **cỡ production**.

**Tra bảng trắng bằng chuỗi của người dùng thì phải dùng `Map`.** `const TYPES: Record<string,Rule> = {...}; TYPES[type]` trả **thứ thừa kế từ `Object.prototype`** khi `type` là `constructor`, `toString`, `__proto__`, `valueOf`, `hasOwnProperty`. Giá trị đó **truthy**, nên câu `if (!rule) throw UNSUPPORTED` cho đi qua, rồi `rule.max` là `undefined` và `size > undefined` luôn `false`: trần dung lượng biến mất, app ký PUT 1 GiB lên R2 (F-012, lỗi của Claude ở lát R2, Astra bắt 20/09). TypeScript **không** cảnh báo, vì `Record<string,Rule>` khai rằng mọi chuỗi đều trả `Rule`. Dùng `Map` (không có khoá thừa kế) hoặc `Object.hasOwn`, và đặt thêm **một trần tuyệt đối không phụ thuộc bảng tra** cho mọi giới hạn an toàn lấy từ dữ liệu tra cứu.

**Danh tính là toàn hệ thống, quyền là theo shop.** Một người có thể ở nhiều shop. Mọi thao tác trên **danh tính** (đặt lại mật khẩu, cấp link, khoá tài khoản) mà chỉ dựa trên quyền **ở một shop** là lỗ hổng: shop A chiếm được tài khoản đang làm chủ shop B (F-008, lỗi của Claude ở lát F3, Astra bắt 20/09). Khi so quyền giữa hai người, dùng **quyền hiệu lực** (vai cộng quyền cấp riêng), không dùng quyền của vai (F-007).

**Thứ tự các bước là thứ giữ cho lỗi vô hại.** Khi một chuỗi thao tác không thể nằm trong một transaction, xếp sao cho hỏng giữa chừng là vô hại: kiểm điều kiện dễ sai nhất **trước khi ghi gì**, và để bước làm-cho-công-khai **cuối cùng**. Bản đầu của `ShopProvisioning` làm ngược và để lại một trang công khai không có chủ.

**Đo trước khi tối ưu — nhưng đo xong phải hỏi từng con số có bình thường không.** Login mất 2,5s trên preview. Đo ra: 0,41s nền, 0,25s database, **1,9s scrypt**. Kết luận lúc đó: 1,9s là **cố ý** (đúng mức OWASP), không phải lỗi hiệu năng — đúng. Nhưng **0,25s cho database bị bỏ qua như thể bình thường**, và nó không bình thường: hàm Vercel chạy ở `iad1` (Washington DC) còn Neon ở `ap-southeast-1` (Singapore), nên mỗi truy vấn là một vòng Thái Bình Dương ~250ms. Tìm ra 21/09 bằng `curl -D - | grep x-vercel-id` → `hkg1::iad1::…`. **Một phép đo chỉ có ích khi từng thành phần của nó bị chất vấn**; "phần còn lại nhỏ nên bỏ qua" là cách một lỗi hạ tầng sống sót một tuần. Máy local nhanh gấp 10 lần vì CPU mạnh hơn **và** vì database nằm cùng máy.


## Astra worktree riêng — 20/09/2026

- Git common-dir nằm ngoài worktree: tạo branch/worktree cần quyền ghi Git common-dir. Không đổi branch Claude hoặc dùng stash.
- initdb/test PostgreSQL trong sandbox lần đầu thất bại shared memory/EPERM; chạy có quyền trên cluster local riêng 55449 mới cho bằng chứng test. initdb UTF8/en_US.UTF-8.
- Client tests cũng cần localhost/Chrome: lần sandbox 4 failed + 5 did not run do EPERM, chạy có quyền 75 passed. Không ghi lỗi môi trường thành lỗi sản phẩm.
- Fixture repository cũ hardcode 55439. Lượt này dùng script ngoài repo tạm đổi cổng trong worktree Astra rồi phục hồi byte-for-byte trong finally; không đụng cổng Claude. Spec owner-setup mới chỉ chấp nhận hai URL localhost test chính xác 55439/55449.
- Chờ callback audit để giữ giao dịch cấp link thứ nhất; đợi giao dịch thứ hai thật sự có wait_event_type=Lock rồi mới nhả. Tránh dùng sleep để đoán tranh chấp F-001.

- Client tests cũng cần localhost/Chrome: lần sandbox 4 failed + 5 did not run do EPERM, chạy có quyền 75 passed. Không ghi lỗi môi trường thành lỗi sản phẩm.
- Fixture repository cũ hardcode 55439. Lượt này dùng script ngoài repo tạm đổi cổng trong worktree Astra rồi phục hồi byte-for-byte trong finally; không đụng cổng Claude. Spec owner-setup mới chỉ chấp nhận hai URL localhost test chính xác 55439/55449.
- Chờ callback audit để giữ giao dịch cấp link thứ nhất; đợi giao dịch thứ hai thật sự có wait_event_type=Lock rồi mới nhả. Tránh dùng sleep để đoán tranh chấp F-001.

### Astra A7 — SSR test khác JSX của Playwright (20/09/2026)

- Playwright test ở dự án chạy CommonJS: `import.meta` gây lỗi trước discovery. Dùng cwd khi cần resolve helper.
- Import TSX qua Playwright transform cho object `__pw_type`, React SSR không render được. Helper `tests/fixtures/render-guest.cjs` chạy Node riêng, transpile bằng TypeScript JSX runtime thật; chỉ bỏ CSS trong môi trường SSR, không mock component/hook.
- React SSR serialize boolean data attribute thành `data-google="true"`, không phải chuỗi rỗng như test ban đầu đoán. Tách lỗi fixture này khỏi phát hiện sản phẩm.
- ESLint cấm require mặc định; chỉ helper CommonJS có exemption kèm lý do. Không nới rule toàn app.
- A3 đã thử bỏ từng component/store trong worktree riêng, luôn khôi phục byte gốc bằng finally; lỗi import là bằng chứng caller còn sống, không phải lý do xoá luôn caller/test.
- Lệnh commit của Astra ban đầu vẫn chạy sau diff-check báo dòng trắng cuối file vì các lệnh không nối điều kiện; đã bỏ dòng trắng và kiểm lại trước amend. Luôn dừng khi check lỗi.

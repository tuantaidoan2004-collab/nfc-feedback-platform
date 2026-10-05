# Kết nối Antigravity + đường ra Vercel/Neon/R2 — 2026-09-15

Lát này **chỉ chuẩn bị kết nối và khảo sát**. Không sửa source, không chạy app/test, không đọc `.env`, không deploy, không nhập credential.

## 1. Đã làm

- Xác nhận worktree `/Users/doantai/Desktop/QuiteSensational`, branch `feat/local-app-foundation`, HEAD `172af2f`.
- `python3 scripts/verify-handoff.py` → **MATCH**, 178 file khớp inventory. Không ai ghi đè sau mốc Astra.
- Tạo `.agents/mcp_config.json` (workspace scope của Antigravity) với 3 remote MCP server.

File mới duy nhất của lát này: `.agents/mcp_config.json` và `docs/antigravity-connect.md`.

## 2. MCP config

Antigravity đọc MCP theo thứ tự: global `~/.gemini/config/mcp_config.json`, workspace `.agents/mcp_config.json`.
Chọn workspace vì server chỉ liên quan dự án này và file đi kèm repo.

| Server | serverUrl | Trạng thái |
|---|---|---|
| neon | `https://mcp.neon.tech/mcp` | bật — Tài đã có project Neon |
| vercel | `https://mcp.vercel.com` | `disabled: true` — bật sau khi có tài khoản |
| cloudflare | `https://mcp.cloudflare.com/mcp` | `disabled: true` — bật sau khi R2 hoạt động |

Cả ba dùng **OAuth trong trình duyệt**, nên **không có API key/secret nào nằm trong file này** và file an toàn để commit. Bật một server: xoá dòng `"disabled": true` rồi reload Antigravity; lần gọi đầu sẽ mở trình duyệt xin cấp quyền.

**MCP không phải sandbox.** Grant OAuth cấp quyền thật trên tài khoản thật: Neon MCP xoá được branch/project, Cloudflare MCP sửa được DNS/Workers/R2. Antigravity gọi được gì là do phạm vi Tài bấm đồng ý lúc OAuth, không phải do file config. Cấp hẹp nhất có thể; không đưa quyền production cho agent trong giai đoạn dev.

## 3. Chặn: máy này chưa có Node

`node`, `npx`, `pnpm` đều không có trên PATH (không Homebrew, không nvm/fnm/volta). `node_modules` symlink có sẵn dependency và `node_modules/.bin` có `next`/`playwright`/`tsc`, nhưng **không có interpreter để chạy chúng**.

Nghĩa là hiện tại **không chạy được** `pnpm dev`, `pnpm build`, `pnpm test`, `scripts/migrate.mjs`. Toàn bộ evidence test trong `docs/decisions.md` là từ môi trường Codex sandbox của Astra, không phải từ shell này.

MCP ở mục 2 **không cần Node** (remote `serverUrl`), nên kết nối vẫn dùng được. Nhưng trước lát code đầu tiên cần cài **Node 24** (`.nvmrc` = `24`, `package.json` yêu cầu `>=22`) + bật corepack cho `pnpm@11.19.0`. Việc cài phần mềm cần Tài quyết định và tự chạy.

## 4. Bốn chặn thật khi lên Vercel

Khảo sát code, không phải suy đoán. Đây là việc phải giải trước khi deploy có ý nghĩa.

### 4.1 Gate `NODE_ENV === 'development'` giết toàn bộ v2 trên Vercel

```
server/owner-v2.ts:5       NODE_ENV==='development' && NFC_OWNER_V2_ENABLED==='true'
server/visit-v2-runtime.ts:7  NODE_ENV === 'development' && NFC_VISITS_V2_ENABLED === 'true'
```

Vercel luôn đặt `NODE_ENV=production`. Publishing kế thừa gate này qua `publishingEnabled()`. Deploy nguyên trạng → owner dashboard, visit v2 và publishing **đều tắt**, chỉ còn legacy/demo.

Đây là chặn an toàn Astra cố ý đặt, **không được lặng lẽ gỡ**. Cần Tài chốt tiêu chí mở: đổi sang flag riêng (ví dụ `NFC_ENV=preview|production`) kèm điều kiện auth/HTTPS/rate-limit đã đạt, chứ không phải xoá điều kiện cho test xanh.

### 4.2 `scripts/migrate.mjs` mới chỉ chạy `001_core`

Script hardcode đúng một migration. `002_visit_ratings`, `003_publishing`, `004_owner_dashboard` **không nằm trong runner** — Astra áp bằng test harness. Neon production sẽ thiếu bảng.

Cần một runner đọc thư mục `db/migrations/` theo thứ tự, giữ `schema_migrations` và advisory lock đã có. Không sửa nội dung 001–004.

### 4.3 `pg.Pool` + serverless

`server/db.ts` mở `Pool({ max: 3 })` và pool thứ hai `max: 2` cho export cursor. Trên Vercel mỗi lambda là một process riêng → số kết nối nhân theo số instance, dễ vượt hạn mức Neon.

Hai lựa chọn: dùng **connection string pooled của Neon** (endpoint có `-pooler`), hoặc đổi sang driver HTTP của Neon. Cảnh báo: export cursor stream (`FETCH 256`) cần session Postgres thật — **không chạy được qua PgBouncer transaction mode**. Lát này chưa chốt; cần quyết định riêng, có thể phải tách export sang đường khác.

### 4.4 `output: 'standalone'` xung đột với Vercel

`next.config.ts` đặt `output: 'standalone'` và `build` gọi thêm `scripts/prepare-standalone.mjs`. Vercel có builder riêng và khuyến nghị không đặt `standalone`. Cần tách config theo target thay vì bỏ standalone (bản self-host đang phụ thuộc nó).

## 5. Vercel / R2 — khuyến nghị đăng ký

**Nên đăng ký ngay, chưa tích hợp.** Lý do: `docs/decisions.md` ghi HTTPS cookie thật và owner flow trên iPhone/Safari vẫn chưa xác minh được vì thiếu endpoint HTTPS mà iPhone truy cập được. Cookie owner đang `HttpOnly + SameSite=Strict + Secure`; hành vi trên `http://127.0.0.1` khác HTTPS thật. Có một preview URL là gỡ đúng blocker đó, độc lập với việc web đã hoàn chỉnh hay chưa.

- **Vercel**: Hobby miễn phí nhưng **cấm dùng thương mại**. Bán thẻ NFC cho shop là thương mại → khi có shop trả tiền phải lên **Pro**. Giai đoạn dev/test riêng dùng Hobby được.
- **R2**: free tier ~10 GB lưu trữ, 1M Class A + 10M Class B ops/tháng, **egress miễn phí** (điểm hơn S3 rõ nhất). Cloudflare **bắt nhập thẻ thanh toán mới bật R2** kể cả ở mức free. Tài tự nhập, agent không đụng credential.
- **Neon**: đã có project. Giữ **database dev tách riêng** với database sẽ dùng cho pilot.

Thứ tự: đăng ký → preview deploy không bật flag v2 → giải 4.1–4.4 → mới bật từng flag.

## 6. Ranh giới giữ nguyên

Áp dụng nguyên `START-HERE-ANTIGRAVITY.md`. Nhấn lại phần dễ vi phạm khi bắt đầu nối hạ tầng:

- Không hạ gate ở 4.1 để deploy cho chạy; trình quyết định cho Tài trước.
- Không sửa/backfill migration 001–004; migration mới phải additive.
- Không đưa `DATABASE_URL`, R2 key hay token Vercel vào repo, prompt, log hay `.agents/mcp_config.json`. Secret sống trong Vercel env và Neon dashboard.
- Không thay owner-v2 bằng `lib/demo-store.ts`; legacy `/t/demo`, `/demo/dashboard` giữ nguyên.
- Chưa có admin editor và media/R2 boundary. Schema đã có field `logo`/`background`/`watermark` **không** nghĩa là visual đã dựng.
- Commit/push/deploy cần Tài cho phép riêng từng lần.

## 7. Điểm dừng

Kết nối MCP đã sẵn sàng; Neon bật, Vercel/Cloudflare chờ tài khoản. Chưa gọi MCP tool nào, chưa OAuth, chưa tạo tài nguyên. Bốn chặn ở mục 4 chưa được sửa — chờ Tài chọn lát tiếp theo.

---

# Lát A — mở đường deploy — 2026-09-15

**Trạng thái: đạt một phần trên Node24.21.0/macOS.** Typecheck, lint, contract, client, hai build target và gate qua HTTP thật đã chạy và đạt. Phần cần PostgreSQL chưa chạy được: máy không có PostgreSQL. Chi tiết ở mục "Kết quả kiểm chứng".

## Quyết định nền

Tài chốt: thay gate bằng biến `NFC_ENV` riêng, mặc định tắt. Tài giao Claude quyết phần pool/export, kèm ràng buộc **ưu tiên tự chủ, không khoá vào Vercel**. Nguyên tắc áp cho cả lát: hành vi mặc định là hành vi self-host; mọi thứ riêng của một nền tảng phải khai báo tường minh mới bật, và không file nào trong repo nhắc tên nền tảng nào.

## Thay đổi

### A.1 Gate môi trường — `server/env.ts` (mới)

`nfcEnv()` chỉ nhận `local` | `preview` | `production`. Không set hoặc giá trị lạ → `undefined` → `nfcEnvDeclared()` false.

- `server/owner-v2.ts:6` và `server/visit-v2-runtime.ts:8`: `NODE_ENV==='development'` → `nfcEnvDeclared()`.
- `publishingEnabled()` kế thừa qua `visitsV2Enabled()`, không phải sửa.
- Không còn chuỗi `NODE_ENV` nào trong `server/`, `lib/`, `app/` (đã grep).

Bất biến giữ được: **feature flag một mình không bao giờ đủ để mở v2.** Trước đây lớp chặn là `NODE_ENV`, giờ là khai báo tường minh `NFC_ENV`. Khác biệt có chủ ý: production giờ *có thể* mở được — đó là điều kiện cần để ship — nhưng phải cố ý khai báo, không xảy ra do set nhầm một flag.

### A.2 Export pool — `server/db.ts`

`ownerExportDatabase()` dùng `DATABASE_URL_DIRECT || DATABASE_URL`. Không set → hai pool dùng chung chuỗi kết nối, **hành vi y hệt trước**. Chỉ deployment nào để `DATABASE_URL` đi qua pooler transaction-mode mới cần set, vì cursor `FETCH 256` cần session-mode. `database()` giữ nguyên.

Không chọn phương án tắt export trên nền tảng serverless: nó tạo hành vi lệch giữa Vercel và self-host, đúng thứ cần tránh.

### A.3 Migration runner — `scripts/migrate.mjs`

Quét `db/migrations/*.sql` sắp xếp theo tên, áp mọi migration chưa có trong `schema_migrations`. Giữ nguyên `pg_advisory_xact_lock(7834251)` và một transaction cho cả lượt: deploy song song xếp hàng, lỗi giữa chừng rollback sạch.

Tương thích ngược: tên ghi vào bảng là tên file bỏ `.sql`, tức `001_core` — trùng đúng giá trị script cũ đã ghi, nên DB cũ không áp lại 001. Nội dung 001–004 **không đụng**. Đã kiểm: không migration nào chứa `CONCURRENTLY`/`VACUUM`, nên gộp chung transaction là an toàn.

### A.4 Build target — `next.config.ts`, `scripts/prepare-standalone.mjs`

`NFC_BUILD_TARGET` mặc định `standalone`. Khác `standalone` → không phát `output`, và script chuẩn bị static tự no-op. Headers bảo mật giữ nguyên từng ký tự. Nền tảng tự lo server thì set `NFC_BUILD_TARGET=vercel` ở env của nền tảng, repo không biết gì.

### A.5 Harness — `integration-tests/run-local.mjs`

App dev đặt `NFC_ENV=local`; **bản build production cố ý không đặt**. Nhờ vậy test `production gate stays closed even with flag true` (`integration-tests/public-v2.spec.ts:223`) **không phải sửa** và giờ kiểm đúng bất biến mới: flag bật + `NFC_ENV` chưa khai báo → toàn bộ v2 trả 404, không request `/api/v2/`, `visit_sessions` = 0.

### A.6 `.env.example`

Thêm `NFC_ENV`, `DATABASE_URL_DIRECT`, `NFC_BUILD_TARGET`, và ba feature flag vốn đã dùng trong code nhưng chưa từng được ghi ra.

## Kết quả kiểm chứng — 2026-09-15, Node24.21.0 (nvm), macOS

**Không dùng `pnpm <script>` trong worktree này.** `node_modules` là symlink sang checkout Documents; `pnpm` coi đó là lệch trạng thái và đòi **xoá thư mục modules** trước khi chạy (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). Không có TTY nên nó tự huỷ, nhưng chạy trong terminal thật sẽ hỏng dependency của cả hai bản. Gọi thẳng binary như harness vẫn làm.

| Kiểm tra | Lệnh | Kết quả |
|---|---|---|
| Typegen | `node node_modules/next/dist/bin/next typegen` | ✓ |
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit` | exit0, 0dòng output |
| Lint | `node node_modules/eslint/bin/eslint.js .` | exit0 |
| Contract | `… @playwright/test/cli.js test --config=playwright.contracts.config.ts` | **60 passed** |
| Client | `… --config=playwright.client.config.ts` (Chrome thật) | **73 passed** |
| Build target vercel | `NFC_BUILD_TARGET=vercel next build --webpack` | exit0, **không** sinh `.next/standalone`; `prepare-standalone.mjs` in "nothing to prepare" |
| Build mặc định | `next build --webpack` | exit0, có `.next/standalone/server.js`; prepare copy đủ `.next/static` + `public` |

### Gate kiểm qua HTTP thật trên bản build standalone

Chạy `node .next/standalone/server.js` với env cô lập (`env -i`), `DATABASE_URL` trỏ cổng chết, cả ba feature flag = `true`:

| Endpoint | `NFC_ENV` chưa set | `NFC_ENV=production` |
|---|---|---|
| GET `/api/owner/v2/one` | **404** | 503 (DB không nối được → đã qua gate) |
| GET `/api/owner/v2/one/export` | **404** | 503 |
| GET `/owner/login?next=…` | **404** | 200 |
| POST `/api/owner/v2/login` | **404** | 403 (chặn origin → đã qua gate) |
| POST `/preview/exchange` | **404** | 403 |
| POST `/api/v2/shops/one/visits` | **404** | 404 ¹ |

¹ Không phải gate hỏng: `visit-v2-runtime.ts:12` cố ý tắt route v2 không-publishing khi `NFC_PUBLISHING_ENABLED=true`, hành vi có sẵn từ trước. Chạy lại với `NFC_PUBLISHING_ENABLED=false` → **401**, tức đã vào handler. Đã xác nhận riêng.

Kết luận: bất biến "feature flag một mình không mở được v2" **giữ nguyên và đã chứng minh trên bản build production**, không phải suy luận từ đọc code.

## Chưa chạy được — thiếu PostgreSQL

Máy không có `postgres`, `pg_ctl`, `initdb`, `psql` hay `docker`; cổng fixture 127.0.0.1:55439 đóng. Docs lát trước ghi "dependencies có sẵn" là đúng với sandbox Codex của Astra, không đúng với máy này.

Do đó **chưa chạy**: `repository-tests`, `integration-tests` (gồm test `production gate` và toàn bộ owner/publishing suite), và **`scripts/migrate.mjs` — A.3 hoàn toàn chưa kiểm chứng**, chưa từng áp 001–004 lên một database nào.

`repository-tests` và `integration-tests` vẫn chưa chạy. A.3 thì đã gỡ được bằng Neon, xem mục dưới.

## A.3 đã kiểm chứng trên Neon — 2026-09-15

Trạng thái phát hiện được trước khi chạy, qua SQL Editor của Neon console:

- Branch `production`: **không có bảng nào**. Không đụng tới.
- Branch `development`: đúng5 bảng của `001_core` (`shops`,`owner_users`,`memberships`,`owner_sessions`,`experiences`) + `schema_migrations` chứa đúng một dòng `001_core`.

Tức là **đã có người chạy `scripts/migrate.mjs` bản cũ lên branch `development`** — bản chỉ biết áp mỗi 001. Điều này **mâu thuẫn với checkpoint các lát trước**, vốn ghi "không Neon/env thật" ở mọi lượt. Không nghiêm trọng vì 001 chỉ là schema rỗng, không có dữ liệu khách, nhưng là bằng chứng cụ thể rằng tài liệu bàn giao không phải lúc nào cũng khớp hiện trạng: phải kiểm trước khi tin.

Ngẫu nhiên đây lại là ca thử tốt nhất cho runner mới, vì nó buộc cả hai nhánh logic cùng chạy trong một lượt.

| Lượt | Kết quả |
|---|---|
| Lần1 | `Applied 002_visit_ratings.` / `Applied 003_publishing.` / `Applied 004_owner_dashboard.` / `Migrations applied: 3.` — **không** áp lại 001 |
| Lần2 | `Migrations already up to date.` |
| Kiểm độc lập | `schema_migrations` =4 dòng đủ 001–004; **23 bảng**, khớp đúng tổng 5+4+8+6 của bốn file migration |

A.3 đạt: áp đúng phần thiếu, bỏ qua phần đã có, idempotent, tương thích ngược với tên `001_core` do script cũ ghi.

### Cảnh báo SSL cần xử lý trước production

`pg` in cảnh báo: hiện tại nó hiểu `sslmode=require` **như `verify-full`**, nhưng từ `pg` v9 sẽ đổi sang ngữ nghĩa libpq, **yếu hơn** (không xác thực chứng chỉ). Connection string Neon cấp mặc định có `sslmode=require`.

Khi đặt biến môi trường thật, dùng `sslmode=verify-full` thay vì `require` để hành vi không âm thầm đổi khi nâng dependency. Chưa sửa trong lát này vì chuỗi kết nối nằm ở cấu hình deployment, không nằm trong repo.

### Vệ sinh credential

Connection string branch `development` đã bị dán vào hội thoại. Nó chỉ tồn tại tạm trong scratchpad của phiên và đã bị xoá; không ghi vào repo, `.env` hay Git. **Cần reset password `neondb_owner`** trong Neon Settings. Branch `production` chưa từng được kết nối trong lát này.

## Giới hạn còn lại

- **A.3 migration runner chưa chạy lần nào.** Không có PostgreSQL. Idempotency và tính tương thích tên `001_core` với DB cũ mới chỉ là lập luận trên code.
- `integration-tests` và `repository-tests` chưa chạy trong lát này. Gate đã được kiểm độc lập qua HTTP (bảng trên), nhưng suite owner/publishing/browser thì chưa.
- Chưa có test tự động cho nhánh dev + flag true + `NFC_ENV` chưa set; bản build đã kiểm tay, dev thì chưa.
- Chưa deploy, chưa tạo tài nguyên Vercel/R2, chưa chạy migration lên Neon, chưa xác minh cookie `Secure` trên HTTPS thật, chưa test iPhone/Safari.
- `DATABASE_URL_DIRECT` mới là đường code, chưa chạy thật qua pooler Neon lần nào.
- Chưa đụng admin editor, media/R2, renderer showcase.

---

# Deploy Vercel — 2026-09-15

## Đã làm

- `npm i -g vercel` → CLI59.17.0. Tài tự `vercel login` (agent không nhập credential).
- Máy Tài **chưa từng có `~/.zshrc`**, nên node/nvm chỉ sống trong phiên terminal lúc cài. Đã tạo `~/.zshrc` nạp nvm; shell tương tác mới thấy `v24.21.0` và `vercel`.
- Project `mount-pro/nfc-feedback-platform`. Lượt deploy đầu bị Vercel gán vào **production** (hành vi mặc định cho deployment đầu tiên), không phải preview.
- Bản production đó **không có biến môi trường nào** → gate đóng. Kiểm qua HTTPS thật tại `https://nfc-feedback-platform.vercel.app`: `/api/owner/v2/one` và `/owner/login` trả **404**; legacy `/one`, `/t/demo`, `/demo/dashboard` trả200; header `no-store`/`DENY`/CSP `frame-ancestors 'none'`/`nosniff`/`no-referrer` áp đúng. **Lần đầu gate được chứng minh trên hạ tầng thật, không phải localhost.**
- Đặt6 biến cho môi trường Preview: `NFC_BUILD_TARGET=vercel`, `NFC_ENV=preview`, `SERVER_DATA_ENABLED=true`, `NFC_VISITS_V2_ENABLED=true`, `NFC_OWNER_V2_ENABLED=true`, `NFC_PUBLISHING_ENABLED=false`.

## Hai cái bẫy đã gỡ

- **`node_modules` symlink không bị `.gitignore` bắt.** Pattern `node_modules/` có gạch chéo cuối không khớp symlink, nên nó nằm trong danh sách untracked và Vercel CLI sẽ đi theo symlink mà upload **1.9GB** dependency của checkout khác. Đã thêm `node_modules` (không gạch chéo) vào `.gitignore` và `.vercelignore`.
- **`vercel link` nối thêm `.vercel` và `.env*` vào `.gitignore` nhưng đặt sau `!.env.example`**, làm `.env.example` bị ignore ngược lại vì luật cuối thắng. Đã thêm lại `!.env.example` ở cuối.

## Rà secrets trước khi push

Quét189 file sắp commit: không chuỗi kết nối thật, không token (`npg_`/`sk-`/`ghp_`/`AKIA`/`xox`), không private key, không secret gán cứng, không file >500KB. Chỉ `.github/workflows/ci.yml` có `postgresql://nfc_test:test_only@127.0.0.1:5432` — container CI tạm, không phải secret. `.env.example` không dòng nào có giá trị thật. Host và mật khẩu Neon không xuất hiện ở đâu.

Repo GitHub là **private** (API ẩn danh trả404), nên push source không phơi công khai.

## Commit

Tài cho phép; một commit `2dd90b2` trên `feat/local-app-foundation`, push `172af2f..2dd90b2`. **Không đụng `main`.** 106 file: 94 file nền Astra chưa từng lên GitHub + 12 file sửa của lát A. Gộp một commit vì vài file Astra tạo đã bị lát A sửa, tách ra phải dựng lại nội dung cũ, rủi ro hơn lợi.

## Đang chặn

`vercel git connect` thất bại: tài khoản Vercel đăng nhập bằng email, chưa có Login Connection tới GitHub, nên không thấy repo private. Cần Tài nối GitHub trong Vercel rồi mới có preview URL ổn định theo branch.

Không có Git integration thì preview deployment nhận URL ngẫu nhiên mỗi lượt, trong khi `APP_ORIGIN` phải khớp chính xác để chặn origin hoạt động (`server/http.ts`, `server/owner-v2.ts:13`). Đó là lý do phải có alias ổn định trước khi bật app.

## Chưa làm

`APP_ORIGIN`, `DATABASE_URL`, `DATABASE_URL_DIRECT` chưa đặt. Chưa seed shop demo nên `/<shop>` chưa có gì hiện. Chưa kiểm rating/feedback/cookie `Secure` trên HTTPS thật. Chưa test iPhone. Production giữ trạng thái đóng, không đặt biến.

## Vì sao mọi deployment sau bản đầu bị chặn

Ba deployment liên tiếp hiện `UNKNOWN` với build `0ms` trong `vercel ls`. Dashboard cho lý do thật: **Deployment Blocked — commit author email `doantai@192.168.2.26` không hợp lệ.**

Máy chưa từng có `~/.gitconfig` và repo không có `user.email`/`user.name`, nên Git tự dựng danh tính từ tên máy và IP nội bộ. Vercel chặn deployment mà commit author email không thuộc tài khoản Git nào. Không liên quan gói dịch vụ, hàng đợi build hay code: cùng commit đó build sạch ở local, và bản production đầu tiên (`vercel deploy` trước khi có commit nào) build được 57s.

Dấu hiệu dễ đọc sai: commit `e2529fe` có **một bản Ready và một bản Blocked** cùng lúc — hai đường kích hoạt khác nhau, chỉ đường mang danh tính commit bị chặn. `vercel ls` hiển thị `Blocked` thành `UNKNOWN`, nên chỉ đọc CLI thì tưởng là hàng đợi bị treo.

Đã đặt `git config --global user.email/user.name`. Ba commit đã push (`2dd90b2`, `e2529fe`, `848af8f`) vẫn giữ author cũ; không viết lại lịch sử đã push. Commit mới trở đi mang danh tính đúng, và Vercel chỉ xét commit của deployment đó nên deploy sau sẽ thông.

## Deployment Protection đang bật trên Preview

`GET` bất kỳ đường nào trên alias branch đều trả `302` tới `https://vercel.com/sso-api`. Preview yêu cầu đăng nhập Vercel. Đúng ý Tài đã chọn (production đóng, preview bảo vệ), nhưng **ảnh hưởng trực tiếp tới mục tiêu test iPhone/Safari**: mở link trên điện thoại sẽ ra trang đăng nhập Vercel chứ không phải app, trừ khi đăng nhập Vercel trên thiết bị đó trước. Chưa tự tắt.

## Neon sau khi sửa gốc

`production` và `preview/feat/local-app-foundation`: mỗi branch4 migration, đủ23 bảng. Shop demo `caphe-demo` đã seed vào branch preview qua SQL Editor, không dùng chuỗi kết nối.

`vercel-dev` (môi trường Development của Vercel, chưa dùng) vẫn rỗng — `insert` vào đó báo `relation "shops" does not exist`, đúng như dự kiến vì nó tách ra từ `production` lúc còn rỗng. Không phải sự cố mới.

Branch mặc định `production` giờ đã có schema, nên branch preview Vercel tạo về sau tự kế thừa đủ bảng; đây là lý do migrate `production` thay vì chỉ migrate từng branch preview.

---

# Bộ test cần PostgreSQL — đã chạy — 2026-09-16

## Dựng fixture trên macOS không có Homebrew

Postgres.app (PostgreSQL18.6) cài vào `/Applications`; binary ở `/Applications/Postgres.app/Contents/Versions/latest/bin`. **Không dùng server mặc định của nó**; dựng cluster riêng đúng fixture mô tả trong `visit-rating-repository.md`:

```
PGBIN=/Applications/Postgres.app/Contents/Versions/latest/bin
$PGBIN/initdb -D <datadir> -U nfc_test --auth=trust --encoding=UTF8 --locale=C
$PGBIN/pg_ctl -D <datadir> -l <log> -o "-p 55439 -h 127.0.0.1" start
$PGBIN/createdb -h 127.0.0.1 -p 55439 -U nfc_test -O nfc_test nfc_repo_test
```

Dừng bằng `pg_ctl -D <datadir> stop -m fast`. Cluster đã dừng sau khi chạy xong.

## Kết quả

| Bộ | Lệnh | Kết quả |
|---|---|---|
| repository | `--config=playwright.repository.config.ts`, `NFC_TEST_DATABASE_URL=postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test` | **53 passed**, exit0 |
| public-v2 + browser-hardening | `run-local.mjs public-v2.spec.ts browser-hardening.spec.ts --build` | **15 passed,1 skipped** + **1 passed** (production gate), exit0 |
| publishing | `run-local.mjs --publishing publishing.spec.ts --build` | **4 passed** + **1 passed**, exit0 |
| owner dashboard | `run-local.mjs --owner owner-dashboard.spec.ts --build` | **3 passed** + **1 passed**, exit0 |

Test skip duy nhất là `3E foreground visibility` với `test.skip(true, …)` do Astra đặt sẵn: môi trường automation desktop không sinh chuyển đổi visibility giữa tab. Có từ trước, không phải hồi quy.

## Hai lỗi trong bộ test, không phải ở sản phẩm

### `playwright.repository.config.ts` chạy song song trong khi login không cho

Lần chạy đầu:48 passed,5 failed — toàn bộ `owner-dashboard.spec.ts` chết ở `OwnerAuth.login` với `LOGIN_FAILED`. `--workers=1` thì 8/8 pass.

Nguyên nhân: `login()` giữ `pg_try_advisory_xact_lock` **phạm vi toàn database** để chỉ một KDF chạy mỗi lúc — hành vi sản phẩm đúng và cố ý. Nhưng test cô lập nhau bằng **schema**, không phải database, nên hai case login song song thì một case không lấy được lock và trả `null` → `LOGIN_FAILED`. Đọc log rất dễ nhầm thành lỗi xác thực.

Sửa: `fullyParallel: false`, giữ `workers: 2`. Case trong cùng file chạy tuần tự, các file vẫn song song. Chỉ `owner-dashboard.spec.ts` login nên không còn trùng. Không giảm số test, không sửa sản phẩm.

### `gate off retains legacy…` chứa assertion không bao giờ chạy được

Test ở `public-v2.spec.ts:169` gọi `http://127.0.0.1:3319` — app build production. Harness **build và dựng cổng3319 sau** giai đoạn test chính, nên3319 chưa tồn tại lúc test chạy: `ECONNREFUSED`, **kể cả khi có `--build`**.

Bốn dòng đó trùng y nguyên với test `production gate stays closed even with flag true` (dòng223), và test kia có `test.skip(process.env.NFC_TEST_PRODUCTION !== 'true')` nên chạy đúng pha. Mấy dòng này được thêm ở lát owner dashboard, mà lệnh của lát đó (`--owner owner-dashboard.spec.ts`) **không chạy file public-v2.spec.ts** — nên chúng chưa từng được chạy lại sau khi thêm.

Sửa: bỏ ba dòng3319 khỏi test `gate off`, giữ phần thuộc chủ đề thật của nó (cổng3318 và `experiences > 0`). Coverage không giảm vì test `production gate` đã phủ đúng những assertion đó ở pha đúng.

## Lệnh sai tôi đã chạy, ghi lại để khỏi lặp

`run-local.mjs --owner --build` với toàn bộ spec cho 11 failed. Trong harness `publishing = owner || --publishing`, nên `--owner` bật luôn publishing và `/one` chuyển sang renderer publishing, mất nút sao — trong khi `public-v2`/`browser-hardening` được viết cho publishing tắt, và fixture chưa publish shop nào. **Ba lệnh trong bảng trên loại trừ nhau, phải chạy riêng.**

## Ghi chú môi trường

Có một `next-server` chạy liên tục hơn5 ngày từ phiên trước (PID25489) dù checkpoint ghi Next đã dừng. Chưa tắt, chờ Tài quyết.

Production Vercel sau khi `main` được cập nhật: gate vẫn đóng (`/api/owner/v2/*`,`/owner/login` →404). `/caphe-demo` trả **200 kèm trang "Trang chưa sẵn sàng"**, tức nhánh xử lý lỗi DB, vì `SERVER_DATA_ENABLED` chỉ đặt cho Preview. Production trơ đúng như chủ ý. Đáng lưu ý cho sau này: cấu hình thiếu lại trả200 nên giám sát uptime sẽ tưởng site khoẻ; nên trả503.

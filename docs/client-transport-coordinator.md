# Trạng thái hiện hành: Client3C.4B aggregate mutation lane

Các mục3B.2–3B.4R dưới đây là lịch sử. Semantics FIFO/acknowledge chung và autoresume recovery đã bị thay thế bởi mục3B.4fix cuối file; không dùng chúng làm hướng dẫn tích hợp hiện tại.

# Client3B.2 — coordinator APIv2

Module: `lib/client/visit-coordinator.ts`. Contract nền: `visit-v2-api.md`; identity/lifecycle: `client-identity-lifecycle.md`.

Coordinator nhận identity provider của3B.1, event từ lifecycle và transport được inject. Adapter sau này bind URL shop vào ports; coordinator không nhận shop/scope/entry attribution hoặc browser time để chọn session. UUID phải dùng CSPRNG ở adapter thật. Không có fetch, React, storage trực tiếp, DB hay timer trong module này.

## Trạng thái và trách nhiệm caller

- `open(event)` đăng ký event. Cùng key hiện tại không gửi lại khi remount; khác navigation cùng key trả lỗi. Rating chỉ được gửi sau snapshot open hợp lệ.
- `rate(score)` tạo intent với revision snapshot. Success phân biệt receipt gốc và experience hiện tại; replay không rollback experience mới hơn.
- `pending` nghĩa là chưa biết chắc kết quả, không phải đã lưu hay thất bại. `retry()` dùng chính secret/event/visit/intent/score cũ. `open`/`rate` mới trong lúc pending không được thực hiện và không được tự xếp hàng. Caller phải giữ event mới, xử lý pending trước rồi gửi event theo đúng thứ tự; không được bỏ mất load/resume. `busy` cũng không chấp nhận thao tác mới.
- `REVISION_CONFLICT` refresh snapshot bằng open cũ (không tạo activity mới), trả `conflict` và chờ lựa chọn mới. Nếu refresh unknown, retry vẫn giữ mục đích conflict.
- Snapshot inactive trước action hoặc rating bị từ chối `SESSION_EXPIRED`: đăng ký resume mới, sau đó mới tạo intent trên visit/revision server trả về, giữ điểm người dùng vừa chọn. Action chỉ tự resume một lần; expiry tiếp theo trả lỗi rõ ràng. Unknown intent cũ phải replay trước, không tự chuyển phiên hoặc hồi sinh phiên cũ.
- Mặc định2 attempt mỗi request, cấu hình1–3. Transport throw/malformed success/unknown giữ pending. Definitive rejection không tự retry ngoài conflict/expiry nói trên. Optional pause được inject, không có vòng chạy nền.

HTTP adapter sau này phải phân loại timeout/network/5xx/malformed thành unknown và parse/validate contract đầy đủ. Budget ở đây giới hạn số attempt đã kết thúc; transport phải tự giới hạn thời gian I/O. Coordinator không timeout một Promise treo. Pending hiện chỉ tồn tại trong document, chưa có outbox bền qua reload/crash. Một coordinator cho mỗi document/shop, không dùng chung nhiều shop. Adapter React còn phải giải quyết queue lifecycle/remount/SPA và UI trạng thái pending/conflict; chưa có bằng chứng tích hợp.

## Kiểm chứng

11 test thuần trong `client-tests/visit-coordinator.spec.ts`: gate registration, dedup, snapshot isolation, unknown open/rating, replay/current revision, conflict và refresh unknown, inactive/expiry/resume, retry bound, malformed receipt, concurrent busy, lỗi input/identity.

Lệnh focused: `pnpm exec playwright test --config=playwright.client.config.ts client-tests/visit-coordinator.spec.ts`. Không dùng browser fixture, không mở Chrome/HTTP/PG. Typecheck toàn project và lint hai file mới đạt. Không đổi foundation, dependency, UI hay dịch vụ thật.

## Prompt đề xuất3B.3 — chưa thực hiện

Đọc checkpoint, docs/visit-v2-api.md và docs/client-transport-coordinator.md. Làm một lát ngắn: HTTP adapter APIv2 được inject fetch và kiểm thử thuần bằng response giả; bind shop path ở adapter, Bearer/no-store, validate response/error, giới hạn timeout và map unknown chính xác. Giữ nguyên coordinator intent/visit khi retry; kiểm tra abort không đồng nghĩa rollback server. Chưa nối React/ShopFeedback, chưa mạng thật/Next/browser/PG/Neon/secrets/dependency/UI/auth/R2/deploy/commit. Test focused/typecheck/lint/diff, cập nhật checkpoint rồi dừng báo Tài. Chỉ tiến hành khi được giao.

## Client3B.3 — fetch transport đã thực hiện

`lib/client/visit-fetch-transport.ts` nhận public shop slug, fetch và timer inject; trả hai ports register/rating cho coordinator. Slug được giới hạn theo route, không nhận URL tùy ý. Visit ID kiểm tra UUIDv4 trước ghép path. Request chỉ serialize allowlist; không truyền shopId/scope/entry/session/time. Bearer nằm trong header, không URL/log; POST JSON, same-origin, credentials omit, redirect error, cache no-store. Origin/Fetch-Metadata do browser quản lý, chưa kiểm chứng bằng request browser thật.

Success cần HTTP200, JSON content-type và schema snapshot/receipt hợp lệ (UUID, timestamp, score/revision, session match, navigation đúng request). Coordinator tiếp tục kiểm tra receipt khớp intent/score/revision. Chỉ mã lỗi allowlist khớp status của handler được trả rejected. Network/abort/timeout/5xx/JSON hoặc schema sai/status hay mã lỗi lạ đều unknown để giữ pending. Không tự sinh key/intent hoặc retry tại adapter.

Timeout mặc định10giây, cấu hình1–60000ms; đây là lựa chọn kỹ thuật, không SLA đã chốt. Timer inject bao phủ fetch và đọc body; Promise.race vẫn kết thúc nếu fetch giả không tôn trọng abort. AbortController phát tín hiệu hủy, timer được clear trong finally. Abort không đồng nghĩa server rollback; response đến muộn không đổi kết quả đã trả. Timer port phải có set/clear hoạt động đúng; adapter chưa có browser wiring. Chưa bổ sung giới hạn kích thước response hoặc pending bền qua reload.

Bằng chứng3B.3:17 test adapter thuần +11 coordinator =28 đạt; typecheck/lint/diff đạt. Mocked fetch, Response/AbortController thật trong Node, timer điều khiển bằng test; không mạng/HTTP/browser/PG. Một lỗi khai báo type navigation được sửa rồi typecheck lại đạt. Foundation/server/API/DB/UI không đổi, không dependency mới/secrets/commit/deploy.

### Đề xuất lát tiếp theo — cần brainstorm rà trước

Rà thiết kế hàng đợi lifecycle giữa document adapter và coordinator: giữ mọi event load/resume đang đến khi busy/pending; giải quyết intent cũ trước event mới, tránh duplicate remount/StrictMode và định nghĩa hành vi khi document mất. Viết adapter/kiểm thử thuần theo phạm vi được giao, chưa tự nối UI hoặc mở mạng thật. Sau khi cơ chế này rõ mới tiến tới tích hợp React development và Next+browser+PG local riêng. Dừng sau3B.3 để brainstorm rà, không tự làm tiếp.

## Client3B.4 — lifecycle queue thuần

Module `lib/client/lifecycle-queue.ts` là caller duy nhất của một coordinator. Mọi rating phải đi qua queue.rate; không gọi coordinator bên ngoài. Queue không biết session/time, không sinh loadKey/intent hoặc tự resume. Nó lưu từng OpenEvent theo thứ tự tới, dedup loadKey cả đã hoàn tất trong cùng instance; cùng key khác navigation trả key-conflict. Không gộp key khác nhau.

API: enqueue/start/stop/state/subscribe/rate/retry/acknowledge; settled là hook đợi công việc hiện tại để test/adapter, không đợi thao tác người dùng. start/stop idempotent; stop dừng drain sau request hiện tại, không abort hoặc xóa queue. Kết quả in-flight vẫn được nhận khi stopped. Cần giữ instance ngoài React mount; tạo instance mới mỗi remount sẽ mất bảo đảm dedup. Subscription không sở hữu lifecycle; unsubscribe không stop queue, callback lỗi không làm gián đoạn drain.

Policy kỹ thuật đang expose cho adapter, chưa phải UX đã chốt:
- Chỉ một coordinator call in-flight. Rating chỉ nhận khi started và queue hoàn toàn rảnh; trả false khi bận, không tự lưu score rồi áp vào một session tương lai. UI sau này phải hiển thị trạng thái chưa nhận thao tác.
- Unknown giữ job đầu, block pending; event mới tiếp tục xếp sau. retry gọi coordinator.retry, không gọi lại rate hay tạo intent. Không tự retry khi start/remount và không acknowledge bỏ pending.
- Error/conflict xác định giữ job và result, block decision. acknowledge là hành động caller rõ ràng chấp nhận kết quả từ chối/conflict, bỏ job đó rồi cho các event sau chạy; không có nghĩa event đã được ghi thành công. Không tự gửi lại điểm sau conflict. Cách trình bày nút/feedback cho người dùng chưa được quyết định.
- Coordinator trả busy dù queue độc quyền hoặc throw ngoài contract là gap; giữ toàn bộ job, không đoán đã ghi hay chưa, không cung cấp skip/retry tự động. Cần kiểm tra ownership/integration trước khi khôi phục.

Bằng chứng:10 test queue thuần +11 coordinator +17 fetch adapter =38 đạt; typecheck/lint/diff đạt. Có test coordinator thật với transport giả xác nhận replay cùng intent/visit trước event mới. Burst/dedup/order, register/rating in-flight, pending retries, definitive error/conflict acknowledgement, stop/remount, subscriptions và ownership gap đều được kiểm tra. start/stop thêm guard idempotent được chạy lại10 queue test đạt. Không browser/HTTP/PG/foundation test trong lát này.

Giới hạn: memory-only; document crash/reload mất queue/pending. Seen keys giữ đến hết instance, chưa retention/size cap. Remount chỉ kiểm chứng bằng gọi start/stop/subscribe thuần, chưa React StrictMode/BFCache thật. Các open bị chậm sẽ có server time lúc thực sự đăng ký, không bịa thời gian browser; ảnh hưởng gom phiên cần được rà trong thiết kế lifecycle. Không sửa bất kỳ lớp dưới/server/UI nào.

Đề xuất tiếp, chưa làm: brainstorm rà policy acknowledge, rating bị từ chối khi queue bận, timestamp của deferred open và pending qua reload. Sau khi chốt phạm vi, làm document-owned composition/React development adapter trong một lát riêng; bảo toàn Google/VI-EN/pulse/demo. Chưa mở mạng thật hoặc tích hợp Next/PG khi chưa được giao.

## Memo3B.4R — rà kiến trúc, chưa triển khai

Kết luận: chưa nối UI trên FIFO3B.4.38 test trước chứng minh policy đã viết, không chứng minh policy đó đúng về thời gian phiên. Khuyến nghị thay bằng hai lane có trạng thái tách biệt; đây là đề xuất3B.4fix, chưa thay code/contract.

**Invariant.** DB clock sau khóa quyết định session; client không quyết định bằng timestamp. Mỗi loadKey được ghi tối đa một event nhờ idempotency server, không thể hứa chỉ một HTTP request khi mất response. Pending intent đóng băng secret/source visit/session/score/revision; replay receipt không gia hạn phiên, không chuyển intent sang phiên mới. Snapshot từ open mới không được đổi target của rating cũ. Không được coi lựa chọn chưa gửi là đã lưu.

**Timeline hỏng hiện tại.** Rating củaS1 đã commit lúc00:00 nhưng mất response; last_activity=00:00. ResumeB xảy ra14:50, bị queue chặn sau rating unknown.15:10 người dùng retry: receipt replay không tăng activity; registerB lúc15:10 tạoS2. Nếu dispatchB kịp14:50, server sẽ tái dùngS1. Đây là độ trễ client có thể tránh, không phải DB tính sai. Nhiều open bị giữ lâu rồi drain sát nhau còn có thể gom các lần trở lại xa nhau thành một phiên. Mạng/offline/server lock vẫn có thể gây trễ ngay cả khi tách lane; không hứa khôi phục thời điểm thực tế bằng DB receive time. observedAt chỉ có thể là metadata ở contract tương lai, không gửi thêm trường vào API hiện tại.

**Hai lane khuyến nghị.** Open được dispatch sớm, độc lập rating pending/conflict/lỗi. Ledger theo loadKey giữ immutable event và trạng thái mỗi request; retry vẫn cùng key. Dispatch theo thứ tự client nhận khi có thể, nhưng không giữ mọi open mới vô hạn chỉ vì một open cũ unknown. Nếu cho request khác tiến lên khi request cũ chưa rõ kết quả, thứ tự DB có thể khác thứ tự quan sát; cần chấp nhận server processing order theo foundation hiện tại, hoặc thiết kế server protocol khác nếu sản phẩm đòi chronological order tuyệt đối. Hai lane không tự giải quyết nghịch lý này. Không chạy nhiều retry đồng thời của cùng key. Snapshot chọn cho UI phải gắn local event generation để response cũ không kéo UI về visit trước; không dùng generation làm thời gian/session authoritative.

Rating lane giữ một immutable in-flight intent và context gốc. Open mới có thể rollover/đóngS1 trong lúc ratingS1 unknown: vẫn replayS1; nếu chưa từng áp dụng và nhận SESSION_EXPIRED thì đánh dấu intentS1 bị từ chối, không tự gửi điểm đó vàoS2. Hiện3B.2 tự resume rồi giữ score sau SESSION_EXPIRED, kể cả sau unknown; hành vi này phải được tách khỏi recovery cũ trongfix. Fresh action sau resume đã xác nhận là trường hợp khác. Không thể chỉ gọi register song song bên ngoài coordinator hiện tại: current/pending/busy của nó dùng chung và không có API nhận snapshot độc lập.

**Đổi sao nhanh.** Ví dụ gửi5 đang pending, khách chọn2 rồi3:3B.4 trả false cho cả hai nên dễ để UI hiển thị3 nhưng DB giữ5. Giữ một latestDesired chưa dispatch (3) gắn đúng session/experience và click generation; không sửa intent5. Sau kết quả xác định, nếu context vẫn cùng phiên và không có external revision conflict thì gửi một intent mới cho3 bằng revision xác nhận. Không cần ghi2 chưa được dispatch. Replay trả revision mới hơn receipt là dấu hiệu thay đổi khác: dừng để reconcile, không tự ghi đè tab khác. Nếu session đổi/hết hạn, giữ trạng thái cần người dùng chọn lại, không áp desiredS1 sangS2. Click khi open chưa xác định target chỉ là draft gắn event, chưa là rating intent; không đoán thuộcS1.

**Error/conflict.** Acknowledge chung của queue là cơ chế tạm, không nên chặn thu open. Open lỗi xác định lưu status lỗi riêng; event sau tiếp tục. Rating pending có trạng thái đang xác nhận/thử lại; conflict cần snapshot cùng target và hành động rõ ràng trước overwrite; lỗi xác định hiển thị chưa lưu. Không cần hỏi Tài về enum/nút kỹ thuật ngay lúc này; UX sau phải phản ánh trạng thái, không dùng acknowledge để bỏ unknown hay báo lưu thành công.

**Lifetime.** Một service registry theo Document + shop/context giữ identity, ledger và rating lane; React chỉ subscribe/unsubscribe, không tạo service hay stop công việc theo remount. BFCache có thể giữ document nhưng không được giả định timer/network hoàn tất khi frozen; pageshow phải reconcile/dedup, callback cũ vẫn theo generation. Reload/crash/BFCache eviction mất memory. Cần outbox ghi trước dispatch nếu muốn recovery qua reload: original secret binding, key/nav, source visit/context và intent immutable; storage lỗi phải báo không bảo đảm phục hồi. Cơ chế storage/coordination/retention chưa triển khai; không hứa exactly-once delivery sau crash. Identity dài hạn đơn lẻ không đủ khôi phục intent đã mất.

**Phạm vi tối thiểu3B.4fix.** Chỉ sửa core thuần: (1) tách open ledger khỏi rating state, bỏ global busy/pending dùng chung; (2) snapshot/response correlation theo event + session; (3) freeze rating target và chặn auto-migrate recovery; (4) giữ latestDesired cùng context, explicit conflict/expired; (5) tests timeline14:50→15:10, out-of-order open response, rollover trong unknown,5→2→3 và external revision. Không sửa DB clock/server/API, không UI hoặc claim durable reload trongfix. Registry/browser composition và durable outbox là lát riêng.

**Phân quyền quyết định.** Có thể tự chốt kỹ thuật: dispatch open độc lập, per-key idempotency, immutable retry, chống response cũ, không silent overwrite/cross-session, trạng thái lỗi trung thực. Coalesce điểm chưa gửi trong cùng experience phù hợp mục tiêu đổi sao cập nhật cùng experience, không tự thêm KPI từng click. Chỉ cần Tài chốt phạm vi sản phẩm trướcpilot: có bắt buộc tự khôi phục đánh giá chưa xác nhận sau reload/đóng tab/mất mạng hay chấp nhận báo chưa lưu và chọn lại; mức bảo đảm thời gian khi offline (server receipt time hiện tại hay nhu cầu lưu lịch sử observed time riêng). Không cần hỏi lại cửa sổ15phút đã chốt. Mặc định an toàn trongfix: không chuyển điểm cũ sangS2; UX chọn lại được rà trước khi đưa vào giao diện.

Lát3B.4R chỉ đọc implementation và cập nhật memo/checkpoint; không code/test/commit. Các kết luận trên là phân tích, chưa có bằng chứng test cho kiến trúc hai lane. Dừng để brainstorm rà.

## Client3B.4fix — hai lane cùng coordinator, hiện hành

Phạm vi MVP được giao: DB processing/receipt time là canonical cho session15phút. Không observedAt client. Chưa durable outbox/recovery qua crash/reload/offline; không production-ready. Quyết định này giải quyết các câu hỏi phạm vi của3B.4R cho lát hiện tại, không suy ra bảo đảm delivery tương lai.

### Core và API

`visit-coordinator.ts` sở hữu cả open ledger và rating lane. `open(event)` đưa event mới thành UI context hiện tại ngay khi nhận, dispatch register độc lập rating. Mỗi key chỉ có một request in-flight; duplicate/remount đọc kết quả/promise hiện có, không tự retry unknown. `retryOpen(loadKey)` retry riêng key unknown, giữ event/nav/secret, không thay UI context. Key khác được dispatch dù key cũ unknown/error. Local arrival order chỉ chọn context hiển thị, DB processing order vẫn chọn session. Response open cũ không kéo UI về event cũ; cache experience theo session giữ revision cao nhất đã xác nhận.

Rating pending giữ immutable secret/source visit/session/intent/score/expectedRevision. `retry()` chỉ giải quyết rating hoặc conflict refresh gốc, không phải retry open tổng quát. Open mới vẫn có thể rollover khi rating cũ unknown. SESSION_EXPIRED kết thúc intent bị từ chối, không autoresume/reapply nó; chỉ `rate` mới của người dùng trên context inactive mới được tạo resume rồi intent mới. Nếu resume của fresh action lại unknown, chỉ ghi pending open, cần retryOpen rồi chọn điểm mới; không âm thầm gửi score sau này.

`rate(score)` khi rating cùng load/session đang in-flight/unknown giữ latestDesired, trả pending. Sau outcome xác định, nếu vẫn cùng load/session và điểm còn khác, tạo intent mới bằng revision đã xác nhận.5→2→3 gửi5 rồi3;5→2→5 không cần intent thứ hai. Open khác—even cùng session—xóa desired cũ và expose notice DESIRED_CONTEXT_CHANGED. Rate ở context mới khi recovery cũ chưa xong trả RATING_RECOVERY_REQUIRED; khi open chưa xác nhận trả OPEN_PENDING. Các mã này nghĩa chưa nhận/lưu điểm đó, UI phải phản ánh; không coi pending/saved của context cũ là điểm hiện tại.

REVISION_CONFLICT refresh bằng source open cũ, không đổi head; refresh unknown giữ phase reconciliation và không block open lane. Experience revision lớn hơn receipt (hoặc revision đã biết từ open khác) trả conflict, xóa buffered desire, không tự overwrite tab khác. Receipt cùng revision nhưng khác score bị coi malformed/unknown. State có current event+snapshot, opens từng key, rating pending target/result/desired và notice; caller phải dùng current cùng target, không dùng một promise cũ làm UI source of truth.

`lifecycle-queue.ts` hiện là wrapper document-owned, không còn FIFO chung hay acknowledge. Nó chỉ giữ event chưa dispatch khi stopped, dedup key/remount và chuyển open/rating/retry tới cùng coordinator. start dispatch các key chờ theo thứ tự gọi, không đợi response trước. Stop không abort hay xóa pending; React unsubscribe không stop service. Rate/retry/retryOpen trả Promise kết quả thay vì boolean của3B.4. Subscription/settled phục vụ adapter và test; chưa có document registry/React wiring thật.

### Bằng chứng và giới hạn

38 test focused đạt:16 coordinator +5 queue +17 adapter; typecheck/lint/diff đạt. Thay các test cũ vốn encode FIFO/autoresume recovery bằng regressions: timeline00:00 lostresponse→14:50 register→15:10 replay (clock server giả chỉ trong test), out-of-order response, same-key concurrency/remount, unknown/error open độc lập, rollover khi unknown/in-flight,5→2→3/latest-equal, external revision/conflict refresh, malformed receipt và fresh resume unknown. Không phải cùng38 test của3B.4. Không chạy browser/Next HTTP/PostgreSQL/foundation trongfix.

Không đổi identity/lifecycle/fetch adapter/server/API/DB/migration/UI, không dependency/secrets/commit/deploy. Timer/storage/network thật chưa được kiểm chứng tại integration. Ledger/revision cache/desired vẫn memory-only và chưa size cap; document mới không khôi phục intent. Mạng/DB lock có thể đảo hoặc trì hoãn processing order, hai lane chỉ bỏ head-of-line delay do rating ở client. Nhiều open khác key có thể cùng in-flight, chưa concurrency cap. Không hứa mỗi event chỉ có một HTTP request hoặc đúng chronological observed time.

Đề xuất tiếp: brainstorm rà diff core và explicit UI states OPEN_PENDING/RATING_RECOVERY_REQUIRED/conflict/context-changed; sau đó mới giao một lát document-owned composition/React development adapter có test remount, bảo toàn demo/Google/VI-EN/pulse. Chưa tự mở HTTP/browser/PG hoặc làm outbox. Dừng3B.4fix để rà.

## Client3B.5 — composition service theo Document

`lib/client/document-feedback-service.ts` ghép browserIdentity + documentLifecycle + queue + coordinator + fetch transport. `documentFeedbackService(window, {shop})` trả cùng service cho cùng Document/Window; normalize slug lowercase, từ chối config đổi shop/window trên document đã sở hữu service. Chỉ nhận shop slug hợp lệ, không base URL/context override. Route/API same-origin cố định ở fetch adapter. Chuyển shop qua SPA trong cùng document chưa hỗ trợ, phải định nghĩa riêng trước khi nối router.

Import không đọc browser globals. Browser dependencies chỉ resolve khi gọi factory: identity lazy, UUID từ crypto, fetch bound Window, timer từ Window. `createDocumentFeedbackRegistry(resolvePorts)` cung cấp DI cho tests; production dùng registry module-private. Config sai bị từ chối trước khi tạo lifecycle/listener.

Public surface: state/subscribe/start/stop/rate/retry/retryOpen. State trả bản copy typed deep-readonly, không secret; bao gồm queue/coordinator state đầy đủ, actionsRunning và lastAction. lastAction là kết quả command gần nhất, không thay thế rating state hiện hành hoặc snapshot theo context. UI phải dùng pending/opens.running/actionsRunning để hiển thị đang chuẩn bị/xác nhận; OPEN_PENDING/QUEUE_STOPPED/RATING_RECOVERY_REQUIRED là thao tác chưa được nhận/lưu, không nuốt click hoặc hiển thị saved. Command cũ chậm không ghi đè lastAction của command mới hơn. Conflict/notice từ core được giữ nguyên.

Factory không tự start gửi request. Initial lifecycle current enqueue một lần; gọi start mới dispatch. Service giữ một lifecycle subscription kể cả stopped, nên mọi resume trong lúc stop được buffer, không chỉ giữ event cuối. start/stop idempotent, stop không abort in-flight. Component subscribe/unsubscribe chỉ quan sát, không dispose/stop service; remount phải lấy lại registry instance. Test-only registry có settledForTests/disposeForTests: tháo composition subscriptions và ngừng queue, không abort intent. Production service không expose dispose. Các browser listeners của documentLifecycle tồn tại cùng document theo3B.1, chưa sửa cleanup của lớp đó.

Bằng chứng:10 composition +38 core client =48 tests thuần đạt; typecheck/lint/diff đạt. Test import Node không có window/document; same/different Document, initial/dedup/remount/resume, stop/start buffer, state/error/conflict/notice, config sai/đổi shop, observer isolation, retryOpen và test cleanup. Dùng lifecycle/identity core cùng fetch giả và document token giả; không kiểm chứng browser DOM, BFCache thực, Web Locks/storage thật, Next HTTP hoặc PostgreSQL. Không chạy lại browser/PG/foundation, không sửa core/identity/lifecycle/fetch/server/API/DB/UI/dependency/commit/deploy.

Giới hạn giữ nguyên: DB processing time canonical, memory-only, không durable recovery qua reload/crash/offline, chưa production-ready. Registry module-scoped không hứa tồn tại qua HMR/module reload. UI phải chủ động start sau khi chọn đúng shop; chưa React component/hook. Bước đề xuất tiếp: brainstorm rà composition API rồi giao lát React development adapter riêng, kiểm thử mount/unmount/StrictMode và hiển thị pending/error/conflict phù hợp, giữ Google/VI-EN/pulse/demo. Chưa tự làm lát này hoặc bật network/backend thật.

## Client3B.6 — hook React mỏng, chưa tích hợp UI

`lib/client/use-document-feedback.ts` dùng useSyncExternalStore trên DocumentFeedbackService được truyền vào. Null là mặc định tắt; hook không tự resolve window/shop/factory hoặc bật gate ứng dụng. Service phải được lấy từ document registry sau development gate ở composition caller tương lai. useEffect gọi start idempotent; cleanup chỉ unsubscribe, không stop/abort document service.

Service.state trả bản copy mỗi lần, không thể dùng trực tiếp làm getSnapshot của React. Hook có WeakMap store theo service, cache snapshot theo notification để repeated getSnapshot giữ cùng reference. Chỉ một service subscription khi có React subscribers, tháo khi subscriber cuối rời; remount reconnect lấy snapshot mới nhất. getServerSnapshot trả null cố định để server/hydration không cần browser globals. Không tạo rating trong effect. rate/retry/retryOpen trả nguyên promise/result từ service; khi null trả FEEDBACK_DISABLED. State pending/saved/conflict/error/notice/current-target không bị quy về một trạng thái thành công giả; UI sau phải phân biệt lastAction và rating state theo context.

Kiểm chứng:3 test React19 development + DOM Chrome thật trong profile tạm đạt,10 composition pure tests liên quan đạt; typecheck/lint/diff đạt. Harness nhỏ bundle module/dependency đã có vào page.setContent, fetch giả và route abort tất cả request mạng; không chạy Next/server/API/PG. StrictMode/effect replay, rerender, unmount/remount, một initial open/một rating, không stop lúc cleanup, cập nhật khi resume lúc unmounted, pending/retry/saved/conflict/error/retryOpen, null gate đều được kiểm tra. Không có console/page errors trong test ổn định snapshot. Chrome không khởi động trong sandbox;3 test được chạy lại ngoài sandbox với profile tạm và đạt. Lỗi test loader/module/type/lint được sửa trước lần kiểm tra cuối, không nới rule hay thêm dependency.

Files test: client-tests/react-feedback.spec.ts + fixtures/react-feedback-harness.tsx. Không có jsdom/react-test-renderer trong dependency hiện tại nên dùng browser harness như phạm vi được giao.10 composition tests tái kiểm tra, không chạy lại toàn bộ core/browser identity/PG/foundation. Không sửa ShopFeedback,/t/demo,gate,private-feedback contract,core/service,server/DB/Neon/visual/dependency/commit/deploy.

Giới hạn: chỉ component boundary test, chưa Next hydration/route integration hoặc BFCache thực. Test browser dùng composition thật với transport giả, không chứng minh HTTP/DB persistence. Hook không hỗ trợ tự đổi shop cùng document; giữ giới hạn registry/memory-only/no durable reload của3B.5. Đề xuất tiếp: rà riêng contract private-feedback v2 và đường tích hợp development trước khi thay ShopFeedback; chưa tự triển khai endpoint hay nối UI. Dừng3B.6.

##3C.4A — feedback fetch port, chưa mutation coordinator

createVisitFetchTransport thêm feedback(secret,visitId,{intentId,expectedRevision,topic,message}), dùng cùng same-origin/Bearer/no-store/redirect error/timeout+abort cleanup. Chỉ serialize4fields, không normalize message phía adapter; caller giữ immutable payload khi retry. RATING_REQUIRED409 được phân loại rejected; network/timeout/JSON/schema sai/5xx vẫnunknown. Response schema feedback exact whitelist: outcome,current experience rating/revision/time,receipt intentId/revision/updatedAt; private text hoặc field lạ khiếnunknown, không forward vào state. Receipt phải khớp intent và expectedRevision+1, currentrevision>=receipt. Không có score trong feedbackreceipt.

20adapter tests đạt (3feedback mới+17liênquan);7wirehandler pure tests đạt; typecheck/lint/diff đạt. Không coordinator/service/hook/UI/private form integration, không browser/HTTPthật/PG/dependency/commit. Tiếp theo đề xuất3C.4B: mutation coordinator chia sẻ revision rating/feedback, immutable unknown recovery, explicit conflict và pending; chưa thực hiện.

##3C.4B — aggregate mutation lane hiện hành

Coordinator vẫn sở hữu2lane: open độc lập và một mutation lane chung rating/feedback. feedback transport là optional port để caller rating-only cũ vẫn chạy; nếu chưa inject trả FEEDBACK_UNAVAILABLE. Service thật đã inject transport3C.4A; queue/service/hook thêm feedback(topic,message) pass-through. ShopFeedback/form chưa đổi.

~~Chỉ nhận feedback khi current snapshot đã có rating~~ — bỏ ở lát B1 (2026-09-17): feedback gửi được khi chưa có experience, với `expectedRevision` 0; `RatingSnapshot.rating` có thể là `null`, còn reply của rating vẫn phải có sao. Open/preparing chưa có context trả OPEN_PENDING; context mới trong lúc mutation cũ unknown trả RATING_RECOVERY_REQUIRED. Những lỗi này là thao tác chưa nhận, UI sau không được báo lưu. Feedback không tự resume một session expired; rating fresh-action resume cũ vẫn giữ.

Một immutable mutation in-flight đóng băng kind/secret/source visit/session/intent/revision/payload. Unknown retry gửi lại chính request đó. Fresh action cùng load/session được buffer rõ: tối đa một latest desired rating và một latest explicitly submitted feedback; thay cùng loại đưa nó về vị trí của lần submit mới nhất. Chỉ feedback() là submit, không có listener input/auto-submit khi gõ. Dispatch tuần tự lấy shared revision sau kết quả xác nhận;5→2→3 vẫn gửi5 rồi3 nếu khác điểm cuối. Rating→feedback hoặc feedback→rating không gửi expectedRevision cũ.

Open khác loadKey (kể cả cùng session) xóa buffered action với DESIRED_CONTEXT_CHANGED; không di chuyển sang session mới. Original pending vẫn replay source cũ. Rejection/conflict/external revision xóa buffer và khi có buffer expose BUFFERED_MUTATIONS_DISCARDED, trả error/reconcile rõ. REVISION_CONFLICT hoặc currentrevision>receipt dùng source open refresh rồi trả conflict; unknown refresh giữ phase và không block open lane. Không silent overwrite sau reconcile; không migrate recovery khi expired.

Public state thêm mutation; rating giữ alias cùng metadata để caller cũ truy cập được, nhưng result nay có thể thuộc feedback. Pending có kind,source,phase,intentId; buffered chỉ có kind/context và score cho rating, không topic/message. saved feedback trả `{kind:'saved',mutation:'feedback',snapshot,reply}` với reply whitelist public từ API; rating saved shape cũ giữ. Caller phải xem mutation discriminator/target thay vì hiểu mọi saved là rating. Promise đang drain có thể trả kết quả mutation cuối batch; các lệnh buffer trả pending, không có nghĩa đã lưu. lastAction service là phản hồi command gần nhất, mutation.result là tiến độ aggregate; không dùng lastAction thay source of truth.

Payload riêng chỉ giữ trong starting/pending/buffer nội bộ để retry; success/rejection/clear context bỏ references, conflict refresh xóa private command content vì không cần gửi lại. Không giữ feedback snapshot/text trong public state/result, không log. Đây là bỏ tham chiếu ứng dụng, không bảo đảm xóa byte vật lý khỏi heap; fetch/GC do runtime quản lý. Không lưu durable outbox; reload/crash vẫn mất pending theo scope MVP.

Bằng chứng:62focused pure tests đạt =10aggregate mutation +16coordinator +5queue +11service +20adapter; typecheck/lint/diff đạt. Bao gồm cross-type serialization/revision, unknown immutable replay, rapidrating, latest explicit feedback resubmit, external/conflict refresh, load/session changes, no-rating/expiry, publicstate privacy và servicepass-through. Testsyntax sửa trong quá trình edit trước lần đạt; không nới rules. Không React/browser tests trong lát này, hook chỉ thêm pass-through và typecheck; không server/DB/PG/Neon/dependency/commit/deploy.

Đề xuất tiếp: rà shared mutation result/UX mapping rồi làm development-only form adapter trong lát riêng, bảo toàn Google/VI-EN/pulse và legacy. Chưa tự thay ShopFeedback hoặc bật network/API thật. Dừng3C.4B.

##3D — caller UI

Public `/<shop>` gọi service+hook qua gate development phía server. Core3C.4B không đổi; UI chờ mutation kết thúc mới nhận submission feedback, vẫn coalesce rapid rating, không dựa lastAction để khẳng định đã lưu. Retry giữ payload; draft xóa sau feedback success xác định. Chi tiết và kiểm thử tích hợp ở [public-v2-integration.md](public-v2-integration.md).

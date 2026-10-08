# NFC project working context

**Since 2026-10-05 the source for everything is `rieng/kich-ban.md`** — the script of the product (landing, onboarding,
Orb home, Canva-like library and canvas editor, Google connection, pricing, build order), kept current by the agent; when Tài
changes something, edit that spot and delete the old idea. `rieng/thiet-ke-goc.md` is his original text, verbatim, with his
answers; `rieng/google-api.md` is the Google setup. `rieng/` is **never committed** (the repo is public — Tài, 05/10); it
lives only in `~/Desktop/QuiteSensational` (orange Finder tag "Cam"), which is where to work, not a Codex worktree. Where an
older doc disagrees with the script, the script wins; `docs/google-policy.md` still outranks it.

Read `docs/decisions.md` before planning or editing this project, then `docs/kien-truc-nen-tang.md`. Sections 1–8 of the first say what the product is, what its data is for, and what must be built before what; the second (Tài's full review, 2026-09-26) is the target architecture — the site as a **composition of modules** (sections, field types, effects, template packages), a Canva-like template library, **runnable without Vercel or any rented service**, and ready for hired coders and designers; the day-by-day history is in `docs/decisions-archive.md` and is not the place to start. Tài's rule since 2026-09-21: **build from first principles, upgrade in a line** — everything starts at its basic level and is raised from there, and a leap is allowed only along the branch already chosen. Slices that do not sit on that line are what made the work scattered before. Keep replies brief, in Vietnamese, and work incrementally from first principles.

If context is missing, read the local decision checkpoint first, then the Obsidian project note `20 Work/Projects/NFC Branded Feedback Platform.md` in the connected OBSIDIAN BR1 vault. Ask Tai only for the specific gap that remains. Never claim perfect conversational recall.

Memory is on demand only. Do not create daily sync, reminders, or background project work. Refresh the decision checkpoint when needed for continuity or explicitly requested. Do not mirror full transcripts. Obsidian is the canonical durable product context; GitHub holds source and a concise decision checkpoint. Keep newer explicit owner instructions authoritative and flag conflicting records.

Design and template work reads `rieng/kich-ban.md` first, then Tài's reference images in `rieng/` as he sends them.
`PRODUCT.md`, `DESIGN.md`, `docs/thiet-ke-va-template.md` and `docs/ui-ux-nguon-tham-khao.md` describe the interface being
replaced: use them only for what the script keeps, and rewrite or delete them as each part is rebuilt.

Working loop, Tài 2026-10-05 (replaces the 23/09 shipping rule): **code → run locally → look → Tài reviews → fix → look
again.** `node scripts/local.mjs` (also the `nfc-local` preview in `.claude/launch.json`) brings up PostgreSQL, every
migration, the owner with the Google Maps tool's shop (its real reviews; no sample shop since 05/10) and the app at `http://127.0.0.1:3321` in one command; logins are printed on start
(`docs/local-development.md`). The agent opens the pages itself, screenshots them and sends Tài the images — Tài should
never have to set anything up to see a change. **Commit as little as possible:** no commit per step; one commit per batch
Tài has seen and accepted. **Work directly on `main`** (Tài, 08/10): no feature branch and no Vercel Preview; the local app
is the preview. A push to `main` goes live in ~40 seconds and does not wait for CI. Before the push, run the fast suites
(tsc, eslint, contracts, client) plus whatever `node scripts/test-areas.mjs origin/main` names for the changed files — CI
uses the same script, so a change to the landing never waits on the owner or admin harness. Never call a suite green
without its output, and look at the CI run after the push.
**No migrations during the rebuild (Tài, 05/10):** the database is one file, `db/schema.sql`; the local database is rebuilt
from it whenever it changes. Production stays as it is until the new frame replaces it; that day its test shops are wiped
and the schema applied fresh — ask Tài again on that day. Do not add tools or services to this loop; it is Node,
Postgres.app and the built-in browser.

Product invariants: identical Google review invitation at every rating; low scores may open private feedback without hiding Google; internal stars update the same experience; Vietnamese by default with a switch to English, Vietnamese text may use familiar English words (Dashboard, Library, My Card), and a missing English string falls back to Vietnamese instead of blocking work; private tenant-isolated owner data. Every Google-related rule is in `docs/google-policy.md`; it overrides any other request. The remaining work, grouped by stream, is `docs/roadmap-slices.md`. When Tài changes direction, **edit or delete the old idea everywhere** (code, docs, tests) instead of stacking the new one beside it — his words: "Những gì mới ở đây là cần chỉnh sửa và xoá các ý cũ".

Production is live since 2026-09-19 at `https://quitesensational-review-bio.com` (since 2026-09-21; the old `.vercel.app` redirects there) (Vercel, deployed from `main`; Neon production; R2); no preview since 08/10. **Every URL, what it is, how to sign in and whether it exists yet is in the "Đường vào" section at the top of `docs/production-launch.md`** — read it instead of asking Tài. As of 2026-09-26 production has the template shop and a handful of test shops Tài made, and no NFC card has been written; the old demo code is gone (A3). Never infer real customers or completed Google reviews from test shops, and never claim a test passed without its output. Do not treat assistant-suggested technologies and dashboard details as accepted scope.

Keep NFC separate from Campus Laundry. Do not upload secrets, personal vault contents, supplier/payment data, or whole chat histories to GitHub. No paid service setup is currently selected.

## Project skill integration

Skills come from `addyosmani/agent-skills`, `rohitg00/agentmemory`, and (since 2026-09-17) `mattpocock/skills`, `anthropics/skills`, `ui-ux-pro-max`, `hyperframes-cli`, `agent-browser`, and `nano-banana-2`. They live in `.agents/skills/`; `.claude/skills` links there. **Pick skills from the table at the top of `docs/agent-skills.md`**: it names one primary skill per kind of work, because the sets overlap. Read only the skills the current task needs, and follow the project overrides in that file. The agentmemory skills need an MCP runtime that is not installed, so they are not used: continuity lives in `docs/decisions.md` (the "TIẾP TỤC TỪ ĐÂY" block), `docs/operations-gotchas.md`, and Obsidian. Never claim a memory tool call occurred. Owner instructions and project invariants override upstream workflows, including automatic capture and mandatory per-turn saves. No background hooks, transcript import, or paid services are authorized by this integration.

## Several sessions on one project

Only Claude Code works on this project since 08/10 (Codex/Astra is no longer involved, and nobody reviews before a push).
Tài may run several Claude sessions at once: **`docs/agents-board.md` is their shared channel**. Read it at the start of
every session, claim work there before starting, and do not run test suites while another session's run is going (they
share port 55439 and the harness ports).


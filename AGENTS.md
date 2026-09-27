# NFC project working context

Read `docs/decisions.md` before planning or editing this project, then `docs/kien-truc-nen-tang.md`. Sections 1–8 of the first say what the product is, what its data is for, and what must be built before what; the second (Tài's full review, 2026-09-26) is the target architecture — the site as a **composition of modules** (sections, field types, effects, template packages), a Canva-like template library, **runnable without Vercel or any rented service**, and ready for hired coders and designers; the day-by-day history is in `docs/decisions-archive.md` and is not the place to start. Tài's rule since 2026-09-21: **build from first principles, upgrade in a line** — everything starts at its basic level and is raised from there, and a leap is allowed only along the branch already chosen. Slices that do not sit on that line are what made the work scattered before. Keep replies brief, in Vietnamese, and work incrementally from first principles.

If context is missing, read the local decision checkpoint first, then the Obsidian project note `20 Work/Projects/NFC Branded Feedback Platform.md` in the connected OBSIDIAN BR1 vault. Ask Tai only for the specific gap that remains. Never claim perfect conversational recall.

Memory is on demand only. Do not create daily sync, reminders, or background project work. Refresh the decision checkpoint when needed for continuity or explicitly requested. Do not mirror full transcripts. Obsidian is the canonical durable product context; GitHub holds source and a concise decision checkpoint. Keep newer explicit owner instructions authoritative and flag conflicting records.

Design and template work reads four files first: **`PRODUCT.md`** (who uses this and for what), **`DESIGN.md`**
(how it must look), **`docs/thiet-ke-va-khuon.md`** (the template decisions of 22–23/09) and
**`docs/ui-ux-nguon-tham-khao.md`** (Tài's UI/UX reference, the basis for every design since 27/09). They outrank any
design skill or upstream style guide; `docs/google-policy.md` outranks all of them. Since 27/09 the word is
**template**, not "khuôn". Other kinds of work do not need them.

Shipping rule, relaxed by Tài on 2026-09-23: **a slice does not have to be seen on preview first.** Finish it, get
the seven suites green with real output, push `main`. Two rules are not relaxed: a slice **with a migration** waits
until Tài has run it on Neon (the code and the schema ship together — lát 022 broke the guest page without it), and
**no suite is ever called green without its output**.

Product invariants: identical Google review invitation at every rating; low scores may open private feedback without hiding Google; internal stars update the same experience; Vietnamese default plus manual English only; private tenant-isolated owner data. Every Google-related rule is in `docs/google-policy.md`; it overrides any other request. The remaining work, grouped by stream, is `docs/roadmap-slices.md`. When Tài changes direction, **edit or delete the old idea everywhere** (code, docs, tests) instead of stacking the new one beside it — his words: "Những gì mới ở đây là cần chỉnh sửa và xoá các ý cũ".

Production is live since 2026-09-19 at `https://quitesensational-review-bio.com` (since 2026-09-21; the old `.vercel.app` redirects there) (Vercel, deployed from `main`; Neon production; R2), with a preview on the `feat/local-app-foundation` branch. **Every URL, what it is, how to sign in and whether it exists yet is in the "Đường vào" section at the top of `docs/production-launch.md`** — read it instead of asking Tài. As of 2026-09-26 production has the template shop and a handful of test shops Tài made, and no NFC card has been written; the old demo code is gone (A3). Never infer real customers or completed Google reviews from test shops, and never claim a test passed without its output. Do not treat assistant-suggested technologies and dashboard details as accepted scope.

Keep NFC separate from Campus Laundry. Do not upload secrets, personal vault contents, supplier/payment data, or whole chat histories to GitHub. No paid service setup is currently selected.

## Project skill integration

Skills come from `addyosmani/agent-skills`, `rohitg00/agentmemory`, and (since 2026-09-17) `mattpocock/skills`, `anthropics/skills`, `ui-ux-pro-max`, `hyperframes-cli`, `agent-browser`, and `nano-banana-2`. They live in `.agents/skills/`; `.claude/skills` links there. **Pick skills from the table at the top of `docs/agent-skills.md`**: it names one primary skill per kind of work, because the sets overlap. Read only the skills the current task needs, and follow the project overrides in that file. The agentmemory skills need an MCP runtime that is not installed, so they are not used: continuity lives in `docs/decisions.md` (the "TIẾP TỤC TỪ ĐÂY" block), `docs/operations-gotchas.md`, and Obsidian. Never claim a memory tool call occurred. Owner instructions and project invariants override upstream workflows, including automatic capture and mandatory per-turn saves. No background hooks, transcript import, or paid services are authorized by this integration.

## Several agents on one project

Claude Code (Opus) and Codex (Astra) work on this project in parallel, coordinated by Tài. They do not talk to each other directly: **`docs/agents-board.md` is the shared channel**. Read it at the start of every session, claim work there before starting, and write findings, patches and questions there. The rules for worktrees, test databases, ports, migrations and who integrates are in that file.


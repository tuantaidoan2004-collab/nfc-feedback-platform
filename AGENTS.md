# NFC project working context

Read `docs/decisions.md` before planning or editing this project. It records accepted decisions separately from proposals. Keep replies brief, in Vietnamese, and work incrementally from first principles.

If context is missing, read the local decision checkpoint first, then the Obsidian project note `20 Work/Projects/NFC Branded Feedback Platform.md` in the connected OBSIDIAN BR1 vault. Ask Tai only for the specific gap that remains. Never claim perfect conversational recall.

Memory is on demand only. Do not create daily sync, reminders, or background project work. Refresh the decision checkpoint when needed for continuity or explicitly requested. Do not mirror full transcripts. Obsidian is the canonical durable product context; GitHub holds source and a concise decision checkpoint. Keep newer explicit owner instructions authoritative and flag conflicting records.

Product invariants: identical Google review invitation at every rating; low scores may open private feedback without hiding Google; internal stars update the same experience; Vietnamese default plus manual English only; private tenant-isolated owner data. Every Google-related rule is in `docs/google-policy.md`; it overrides any other request. The slice backlog, ordered by readiness, is `docs/roadmap-slices.md`.

Production is live since 2026-09-19 at `https://quitesensational-review-bio.vercel.app` (Vercel, deployed from `main`; Neon production; R2), with a preview on the `feat/local-app-foundation` branch; see `docs/production-launch.md`. Older demo code (browser-only storage, archived prototype) still exists and is scheduled for removal (roadmap A3). Never infer real customers, completed Google reviews or successful tests from the demo, and never claim a test passed without its output. Do not treat assistant-suggested technologies and dashboard details as accepted scope.

Keep NFC separate from Campus Laundry. Do not upload secrets, personal vault contents, supplier/payment data, or whole chat histories to GitHub. No paid service setup is currently selected.

## Project skill integration

Skills come from `addyosmani/agent-skills`, `rohitg00/agentmemory`, and (since 2026-09-17) `mattpocock/skills`, `anthropics/skills`, `ui-ux-pro-max`, `hyperframes-cli`, `agent-browser`, and `nano-banana-2`. They live in `.agents/skills/`; `.claude/skills` links there. **Pick skills from the table at the top of `docs/agent-skills.md`**: it names one primary skill per kind of work, because the sets overlap. Read only the skills the current task needs, and follow the project overrides in that file. The agentmemory skills need an MCP runtime that is not installed, so they are not used: continuity lives in `docs/decisions.md` (the "TIẾP TỤC TỪ ĐÂY" block), `docs/operations-gotchas.md`, and Obsidian. Never claim a memory tool call occurred. Owner instructions and project invariants override upstream workflows, including automatic capture and mandatory per-turn saves. No background hooks, transcript import, or paid services are authorized by this integration.

## Several agents on one project

Claude Code (Opus) and Codex (Astra) work on this project in parallel, coordinated by Tài. They do not talk to each other directly: **`docs/agents-board.md` is the shared channel**. Read it at the start of every session, claim work there before starting, and write findings, patches and questions there. The rules for worktrees, test databases, ports, migrations and who integrates are in that file.


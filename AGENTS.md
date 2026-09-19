# NFC project working context

Read `docs/decisions.md` before planning or editing this project. It records accepted decisions separately from proposals. Keep replies brief, in Vietnamese, and work incrementally from first principles.

If context is missing, read the local decision checkpoint first, then the Obsidian project note `20 Work/Projects/NFC Branded Feedback Platform.md` in the connected OBSIDIAN BR1 vault. Ask Tai only for the specific gap that remains. Never claim perfect conversational recall.

Memory is on demand only. Do not create daily sync, reminders, or background project work. Refresh the decision checkpoint when needed for continuity or explicitly requested. Do not mirror full transcripts. Obsidian is the canonical durable product context; GitHub holds source and a concise decision checkpoint. Keep newer explicit owner instructions authoritative and flag conflicting records.

Product invariants: identical Google review invitation at every rating; low scores may open private feedback without hiding Google; internal stars update the same experience; Vietnamese default plus manual English only; private tenant-isolated owner data. Every Google-related rule is in `docs/google-policy.md`; it overrides any other request. The slice backlog, ordered by readiness, is `docs/roadmap-slices.md`.

The current UI is a local Next.js app with browser-only demo storage plus an archived conversation prototype; it is not a deployed product. Read docs/local-development.md for scope and commands. Never infer real customers, persisted data, completed Google reviews, authentication, or successful tests from the mockup. Do not treat assistant-suggested technologies and dashboard details as accepted scope.

Keep NFC separate from Campus Laundry. Do not upload secrets, personal vault contents, supplier/payment data, or whole chat histories to GitHub. No paid service setup is currently selected.

## Project skill integration

Skills come from `addyosmani/agent-skills`, `rohitg00/agentmemory`, and (since 2026-09-17) `mattpocock/skills`, `anthropics/skills`, `ui-ux-pro-max`, `hyperframes-cli`, `agent-browser`, and `nano-banana-2`. They live in `.agents/skills/`; `.claude/skills` links there. **Pick skills from the table at the top of `docs/agent-skills.md`**: it names one primary skill per kind of work, because the sets overlap. Read only the skills the current task needs, and follow the project overrides in that file. The agentmemory skills need an MCP runtime that is not installed, so they are not used: continuity lives in `docs/decisions.md` (the "TIẾP TỤC TỪ ĐÂY" block), `docs/operations-gotchas.md`, and Obsidian. Never claim a memory tool call occurred. Owner instructions and project invariants override upstream workflows, including automatic capture and mandatory per-turn saves. No background hooks, transcript import, or paid services are authorized by this integration.

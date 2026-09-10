# NFC project working context

Read `docs/decisions.md` before planning or editing this project. It records accepted decisions separately from proposals. Keep replies brief, in Vietnamese, and work incrementally from first principles.

If context is missing, read the local decision checkpoint first, then the Obsidian project note `20 Work/Projects/NFC Branded Feedback Platform.md` in the connected OBSIDIAN BR1 vault. Ask Tai only for the specific gap that remains. Never claim perfect conversational recall.

Memory is on demand only. Do not create daily sync, reminders, or background project work. Refresh the decision checkpoint when needed for continuity or explicitly requested. Do not mirror full transcripts. Obsidian is the canonical durable product context; GitHub holds source and a concise decision checkpoint. Keep newer explicit owner instructions authoritative and flag conflicting records.

Product invariants: identical Google review invitation at every rating; low scores may open private feedback without hiding Google; internal stars update the same experience; Vietnamese default plus manual English only; private tenant-isolated owner data.

The current UI is a local Next.js app with browser-only demo storage plus an archived conversation prototype; it is not a deployed product. Read docs/local-development.md for scope and commands. Never infer real customers, persisted data, completed Google reviews, authentication, or successful tests from the mockup. Do not treat assistant-suggested technologies and dashboard details as accepted scope.

Keep NFC separate from Campus Laundry. Do not upload secrets, personal vault contents, supplier/payment data, or whole chat histories to GitHub. No paid service setup is currently selected.

## Project skill integration

Tai requested `rohitg00/agentmemory` and `addyosmani/agent-skills`. Read `docs/agent-skills.md` for scope and overrides. Skills live in `.agents/skills/`; use `using-agent-skills/SKILL.md` to select a relevant engineering workflow, then read only the relevant skill. For memory use the selected agentmemory skills with the on-demand checkpoint/Obsidian adaptation in that document. Their MCP/runtime is not installed; never claim a memory tool call occurred. Owner instructions and project invariants override upstream workflows, including automatic capture and mandatory per-turn saves. No background hooks, transcript import, or paid services are authorized by this integration.

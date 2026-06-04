# Episteme - Agent Conventions

This file defines cross-agent conventions, output expectations, and handoff rules for Episteme sessions.

For **overall architecture and design**, see [ARCHITECTURE.md](./docs/ARCHITECTURE.md).

---

## What Belongs Here

Keep this file focused on cross-agent conventions:

- Output locations and file naming expectations
- Workspace-level continuity for long-running work
- Provenance and verification requirements
- Handoff rules between agents

Do **not** restate per-agent prompt text here unless there is a session-wide constraint that applies to all agents.

---

## Episteme Subagents

Episteme ships three bundled research subagents:

- `researcher` — Reads and comprehends sources, extracts findings
- `writer` — Synthesizes research into coherent narratives
- `librarian` — Organizes outputs, manages exports

They are defined in `.episteme/agents/` and invoked via the pi `subagent` tool.

---

## Output Conventions

### Directory Structure

Within each session workspace (`~/.episteme/sessions/<uuid>/workspace/`):

```
workspace/
├── sources/              # Imported Zotero/Obsidian sources
│   └── <slug>-<id>.md     # Source files with frontmatter
├── plans/                # Research plans, outlines, approaches
│   └── <slug>-plan.md
├── notes/                # Research findings, synthesis, analysis
│   └── <slug>-notes.md
└── artifacts/            # Final outputs, exports, deliverables
    └── <slug>-artifact.md
```

### File Naming

Every workflow that produces artifacts should derive a short **slug** from the topic:

- Lowercase, hyphens, no filler words
- At most 5 words (e.g., `attention-mechanisms`, `climate-llm-impact`)

All files in a single run use that slug as a prefix:

```
<slug>-research.md      # Researcher output
<slug>-draft.md         # Writer output
<slug>-export.md        # Librarian staged export
<slug>.provenance.md    # Source tracking (if applicable)
```

Never use generic names like `research.md`, `draft.md`, or `summary.md`. Concurrent runs must not collide.

---

## Agent Collaboration Model

Agents work with **iterative overlap** on shared files, not strict sequential handoffs:

```
sources/*.md → researcher → <slug>-research.md
                                    ↓
                        writer ←→ <slug>-draft.md
                                    ↓
                        librarian → Obsidian vault
```

- Agents read from and write to the same workspace files
- Multiple agents may work on the same files in different turns
- The workspace is the communication medium, not direct agent-to-agent messaging

---

## Workspace Changelog

For long-running or resumable sessions, use `notes/CHANGELOG.md` as a lab notebook:

```
## Session: <topic> - <date>

### Progress
- [x] Initial source import
- [x] Researcher identified 3 key themes

### Blockers
- One Zotero PDF conversion failed (marked in source frontmatter)

### Next Steps
- Writer to draft section on theme #2
- Librarian to prepare export template

### Status
verified: theme #1 claims
unverified: theme #2-3 (pending writer review)
```

Rules:
- Read `notes/CHANGELOG.md` before resuming substantial work
- Append entries after meaningful progress, failed approaches, or verification results
- Do not create or update for trivial one-shot tasks

---

## Provenance and Verification

- Source files include YAML frontmatter with metadata (title, authors, date, tags)
- Researcher findings cite source files by filename, not inline content
- Claims without direct source backing should be marked as `inferred` or `unverified`
- Librarian exports preserve source citations in frontmatter

Example frontmatter:

```yaml
---
title: "Attention Is All You Need"
authors: ["Vaswani et al."]
date: 2017
source: zotero
zoteroKey: ABCD1234
tags: ["transformers", "attention-mechanism"]
imported: 2024-01-15
---
```

---

## Source Management

Sources are copied into `sources/` with full metadata. Originals are untouched.

- **Add**: User runs `/source add-zotero` or `/source add-obsidian`
- **List**: Run `/source list` to see current sources
- **Remove**: Run `/source remove <id>` to remove from workspace (not from original)

---

## Delegation Rules

- The active agent plans, delegates, synthesizes, and delivers
- Use subagents when work is meaningfully decomposable
- Prefer file-based handoffs over dumping large intermediate results
- The active agent is responsible for reconciling task completion
- Subagents may not silently skip assigned tasks; skipped tasks must be recorded
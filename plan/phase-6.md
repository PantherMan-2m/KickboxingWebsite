# Phase 6 — Progress notes and competency

**Status**: Mapped at phase level only; not yet detailed into tasks. Depends on Phase 1.

Coach-defined skill taxonomy with a level per student, plus **one running free-text note per
student, overwritten in place** — no dated history, per Giovanni's preference. Store
`updated_at`/`updated_by`, and keep a hidden append-only copy purely as an undo safety net
against accidental overwrite; the UI stays a single field. Discipline tags (boxer / kickboxer /
Muay Thai) are **multi-valued** — a junction table, not a delimited column — and purely
informational, restricting nothing. Coach-only visibility; students do not see their own notes.

**Open question** (see `PLAN.md`): who defines the skill taxonomy, and is it editable in the UI
or seeded in a migration? Current assumption: coach-editable in the UI.

# Phase 3 — Waitlist and coach notifications

**Status**: Mapped at phase level only; not yet detailed into tasks. Depends on Phase 2.

`session_rsvps` gains a `status` column (`going` / `waitlisted`); `created_at` provides FIFO
ordering. At capacity, RSVPs become waitlist entries; on cancellation the oldest waitlisted
student is auto-promoted. **The last-spot race condition must be handled explicitly** — two
simultaneous RSVPs both reading "19 of 20" would both insert. Approach: insert, re-count, demote
anyone past capacity by `created_at`. This is untestable in production and is the concrete
justification for T0.5.

Notifications via a single internal `notifyCoach()` module emitting two events —
`waitlist_joined` (emails the coach) and `waitlist_promoted` (emails the **student**, plus the
coach; non-optional, since a waitlist that promotes silently is worse than no waitlist).

**Both delivery paths are in scope** (confirmed 2026-08-05), and both are built in Phase 3:
1. **Email**, always fires. Stable bracketed subject topic (`[CJN][WAITLIST_JOINED] ...`) and a
   key-value body, so an inbox-watching automation can filter and parse it.
2. **Webhook**, POSTs the same event as structured JSON with a shared-secret header. Target URL
   in `COACH_WEBHOOK_URL`; if unset, this half silently no-ops so the feature ships working
   either way.

Recipient address in `COACH_NOTIFY_EMAIL`, never hardcoded. Note for whoever builds this:
Cloudflare env vars are readable only by the Functions themselves — nothing external can read
them. They configure *where the site sends*, they are not a channel anything subscribes to.

Giovanni's own WhatsApp automation is downstream and out of scope — the site's contract ends at
"emits a well-formed event".

**Open question** (see `PLAN.md`): should the coach be notified when a class merely *reaches*
capacity, or only when someone actually joins the waitlist? Current assumption: waitlist join
only, since that's the actionable signal.

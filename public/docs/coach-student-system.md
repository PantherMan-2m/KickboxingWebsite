# Coach/Student Login & Attendance System — Usage Guide

**Status**: self-signup + approval, class RSVPs, shared `app.js` + navigation fixes,
class capacity + RSVP enforcement (`PLAN.md`'s Phase 2), a waitlist + coach
notifications (Phase 3), and membership plans + payment recording + an overdue flag
(Phase 4) all complete as of 2026-08-08 — see `HANDOVER.md` for current branch state.
This is a living document — update it (don't replace it) as new features land. See
`TODO.md` (outer folder) for what's not built yet.

This is the plain-English usage guide. For schema, endpoints, and security mechanics,
see **`coach-student-system-technical.md`** in this same folder.

---

## Who can do what

- **Coaches** can: manage the student roster, define the weekly class schedule, create
  one-off extra sessions, mark attendance, and see who's RSVP'd "going" to a class.
- **Students** can: log in, see their own attendance history, RSVP to upcoming classes,
  or (if they don't have an account yet) request one.

## Logging in

Go to `cjnacademy.com/login.html`, enter email + password. There's also a **Login** link
in the homepage nav (desktop and mobile) — it swaps to "My dashboard" automatically once
you're logged in.

First login after an account is created (by a coach, or via the bootstrap script) always
forces a password change before anything else works — you'll be redirected to
`change-password.html` automatically.

**Locked out?** After 5 wrong password attempts in a row, the account locks for 15
minutes (even a correct password is rejected during that window, with the same generic
"Invalid email or password" message — this is intentional, so a wrong-password guess
can't be used to figure out whether an account exists at all). It unlocks automatically
after 15 minutes; there's no manual unlock UI yet. If you need to force it open sooner,
see "Common maintenance tasks" below.

## Requesting an account

Don't have an account yet? Go to `cjnacademy.com/request-account.html` (also linked from
the login page) and submit your name + email. This doesn't create a working account
immediately — it creates a **pending** request that a coach has to approve from the
Requests page. You'll get an email with a temporary password once that happens. There's
no signal on the request page itself either way (approved or not), so if you don't hear
back, follow up with a coach directly.

## Coach walkthrough

1. **Dashboard** (`/coach/dashboard.html`) — landing page with shortcuts to everything
   else, plus a **Next class** panel showing the soonest upcoming class (name, date,
   time, and a live "N going" / "N / capacity going (M spots left)" headcount, plus
   "· N waitlisted" once anyone's waiting). Empty if nothing's scheduled in the next 7
   days.
2. **Students** (`/coach/students.html`) — add a student (name + email). This creates
   their account with a random temporary password and emails it to them via Resend. If
   the email fails to send, the temporary password is shown on-screen instead so you can
   hand it over directly. You can also deactivate/reactivate a student here (deactivating
   removes them from future attendance-marking rosters, but keeps their history intact —
   nothing is ever hard-deleted). A search box (name/email, filters as you type) and a
   status filter (all/active/inactive) sit above the roster table, useful once it's grown
   past a quick scan.
3. **Requests** (`/coach/requests.html`) — anyone who submitted the public "request an
   account" form shows up here. **Approve** activates their account and emails a
   temporary password (same mechanics as adding a student directly, including the
   on-screen fallback if the email fails). **Reject** deletes the request outright —
   there's no "rejected" state to revisit, so only reject requests you're sure about.
4. **Schedule** (`/coach/templates.html`) — define the recurring weekly classes (day,
   time, name, and an optional **capacity**). This is the *template*, not actual dated
   sessions. Leave capacity blank for unlimited; each row in the table also has its own
   capacity field + Save button, so you can set or clear it later without re-adding the
   class. Capacity here applies to every future occurrence of that weekly class unless a
   specific date is overridden (see step 6).
5. **Attendance** (`/coach/attendance.html`) — pick a date. If that date matches a
   weekly template (e.g. it's a Tuesday and you have a Tuesday class), you'll see a
   "Create session" button for it. You can also add a one-off extra session for any date
   (e.g. an extra Friday class) without touching the weekly template. Either way, this
   creates a `class_sessions` row you can then open to mark attendance.
6. **Marking attendance** (`/coach/session.html?id=...`) — shows the class's capacity
   (inherited from the weekly template unless you set a **capacity override** just for
   this date, right below the class title — leave it blank to go back to inheriting),
   the full active student roster with an RSVP column (✓ Going if that student RSVP'd
   for this date's class) next to present/absent/excused radio buttons per student.
   **A session that's never been saved pre-fills present for everyone who RSVP'd going**
   (everyone else defaults absent) — turns roster marking from many clicks into
   correcting the couple of exceptions. One-off sessions (no weekly template behind
   them) always default everyone absent, since there's nothing to RSVP against. Save
   writes the whole roster at once. Reopening an already-saved session shows exactly
   what you last saved, not the RSVP pre-fill again — so amending attendance after the
   fact is always safe. A back link at the top returns to Attendance with the same date
   still selected. If anyone's waitlisted for this date, a separate **Waitlisted**
   list appears below the roster, in the order they joined — they're never pre-marked
   present, since they don't have a confirmed spot (unless/until a spot frees up and
   they're auto-promoted).
7. **Raising a class's capacity** (Schedule or a session's own capacity override)
   **auto-promotes** the oldest waitlisted student(s) into the newly-freed spot(s)
   immediately — no separate action needed. Both the promoted student and you get an
   email. Lowering capacity never removes anyone already going, even if that puts the
   class over the new number.
8. **Assigning a membership plan** (`/coach/students.html`) — each student row shows
   their current plan (or "No plan") with an **Assign plan** / **Change plan** button.
   Only the two monthly plans (One Class / week, Unlimited) can be assigned this way —
   Drop-in is paid for per visit, not enrolled in, so it never shows up here. Changing a
   student's plan automatically closes their previous one the day before the new plan
   starts; there's never more than one active plan per student. The optional **price
   override** is for a family discount — leave it blank to charge the plan's normal
   price.
9. **Recording a payment** (`/coach/payments.html`) — pick the student, optionally the
   plan it's for, the amount (in Rands — the amount you actually received), cash or EFT,
   the date it was paid, and the period it covers (defaults to the current calendar
   month). This is a record-only ledger: the site never takes money itself, it just
   tracks what you were handed. The same page also has the **membership plan catalogue**
   — add a new plan or deactivate one that's no longer offered (deactivating a plan
   doesn't touch anyone already on it).
10. **Reading the payment badge** — every student on a class roster (and on the
    waitlist) shows a small badge: **Paid**, **Overdue**, or **No plan**. "No plan"
    covers drop-in-only students and brand-new members who haven't paid yet — it's
    informational, not a warning. "Overdue" means their last payment's coverage plus a
    7-day grace period has passed. **The badge is informational only** — it doesn't stop
    anyone from RSVPing, joining a waitlist, or being auto-promoted off one; there's no
    enforcement anywhere. Students can see their own plan, price, and their **3 most
    recent** payments on their own dashboard (`/student/dashboard.html`) -- older
    payments aren't shown, but the Paid/Overdue/No plan status itself always reflects
    their full payment history, not just those 3.

## Student walkthrough

Log in → lands on `/student/dashboard.html` → see **My membership** (your current plan,
its price, a Paid/Overdue/No plan badge, and your 3 most recent payments) above a table of
every session you've been marked in, with date, class name, and status. The **Upcoming classes**
(`/student/upcoming.html`) nav link shows the next 7 days of recurring weekly classes,
each with a spots-remaining count and an "I'm going" button — tap it to RSVP, tap again
to cancel. This is a heads-up for the coach; it doesn't create or replace an actual
attendance record, and you're not locked out of a class you didn't RSVP to (or penalized
for RSVPing and not showing).

If a coach has set a capacity and the class fills up, the button shows **"Join
waitlist"** — tap it to join the queue. You'll see **"Waitlisted — #N in line (tap to
leave)"**, showing your position (not the total number waiting). If a spot opens up
(someone going cancels, or the coach raises capacity), the oldest waitlisted student is
promoted to going automatically — you'll get an email, and the page will show you as
going next time you load it. Leaving the waitlist (tapping the button again) just
removes your place in line; it doesn't promote anyone else, since you weren't taking up
a spot. Classes with no capacity set behave exactly as before (unlimited, always "I'm
going").

## Bootstrapping a coach account

There's no signup flow yet, so every account is either created by a coach (via the
Students page) or, for the very first coach, via a local script:

```bash
node bootstrap-user.js "email@example.com" "Full Name" coach
```
(run from the outer project folder, not `public/`). It prompts for a password locally
(masked, never sent anywhere) and prints a SQL `INSERT` statement to run via:
```bash
npx wrangler d1 execute cjn-academy --remote --command="<paste the INSERT>"
```

## Common maintenance tasks

All of these use `wrangler` (unpinned — requires Node 22+, see the technical reference's
"Node/Wrangler requirement") from the `public/` folder:

**Back up production before every migration** (standing rule — never run a migration
against production without a fresh export in hand):
```bash
npx wrangler d1 export cjn-academy --remote --output="../backups/cjn-academy-<YYYY-MM-DD>.sql"
```
Run from `public/`. Writes to a `backups/` folder in the **outer** project folder (sibling
to `public/`, not inside it), so the export — which contains real user data, including
password hashes — is never committed to git. Exports schema and data for all tables in one
file. To restore, replay the file's `CREATE TABLE`/`INSERT` statements against a target
database (e.g. `npx wrangler d1 execute cjn-academy --remote --file=../backups/<file>.sql`
— only ever do this deliberately, it's a full overwrite).

**Force-unlock a locked-out account immediately** (instead of waiting 15 min):
```bash
npx wrangler d1 execute cjn-academy --remote --command="UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = 'someone@example.com';"
```

**Reset someone's password** (e.g. they forgot it — there's no self-service "forgot
password" flow yet): generate a new hash with `bootstrap-user.js`'s hashing logic (or
just run the script again mentally — same PBKDF2 format), then:
```bash
npx wrangler d1 execute cjn-academy --remote --command="UPDATE users SET password_hash = '<hash>', must_change_password = 1 WHERE email = '...';"
```

**Deactivate/reactivate a student without the UI**:
```bash
npx wrangler d1 execute cjn-academy --remote --command="UPDATE users SET status = 'inactive' WHERE email = '...';"
```

**Look at the data directly**:
```bash
npx wrangler d1 execute cjn-academy --remote --command="SELECT * FROM users;"
```

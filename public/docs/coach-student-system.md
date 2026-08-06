# Coach/Student Login & Attendance System — Usage Guide

**Status**: Phase 1, Phase 2 (self-signup + approval), and Phase 3 (class RSVPs)
complete and live (2026-08-04); Phase 0 (foundation) and Phase 1 (shared `app.js`,
navigation fixes) complete, Phase 1 pending merge to `main` as of 2026-08-06 — see
`HANDOVER.md` for current branch state. This is a living document — update it (don't
replace it) as new features land. See `TODO.md` (outer folder) for what's not built yet.

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

1. **Dashboard** (`/coach/dashboard.html`) — landing page with shortcuts to everything else.
2. **Students** (`/coach/students.html`) — add a student (name + email). This creates
   their account with a random temporary password and emails it to them via Resend. If
   the email fails to send, the temporary password is shown on-screen instead so you can
   hand it over directly. You can also deactivate/reactivate a student here (deactivating
   removes them from future attendance-marking rosters, but keeps their history intact —
   nothing is ever hard-deleted).
3. **Requests** (`/coach/requests.html`) — anyone who submitted the public "request an
   account" form shows up here. **Approve** activates their account and emails a
   temporary password (same mechanics as adding a student directly, including the
   on-screen fallback if the email fails). **Reject** deletes the request outright —
   there's no "rejected" state to revisit, so only reject requests you're sure about.
4. **Schedule** (`/coach/templates.html`) — define the recurring weekly classes (day,
   time, name). This is the *template*, not actual dated sessions.
5. **Attendance** (`/coach/attendance.html`) — pick a date. If that date matches a
   weekly template (e.g. it's a Tuesday and you have a Tuesday class), you'll see a
   "Create session" button for it. You can also add a one-off extra session for any date
   (e.g. an extra Friday class) without touching the weekly template. Either way, this
   creates a `class_sessions` row you can then open to mark attendance.
6. **Marking attendance** (`/coach/session.html?id=...`) — shows the full active student
   roster with an RSVP column (✓ Going if that student RSVP'd for this date's class) next
   to present/absent/excused radio buttons per student (defaults to absent). The RSVP
   column is only ever populated for sessions created from a weekly template — one-off
   sessions have no RSVPs to show, since students can only RSVP to the recurring
   schedule (see "What's deliberately not built yet" in the technical reference). Save
   writes the whole roster at once. You can reopen a session later and it'll pre-fill
   from whatever was last saved, so amending attendance after the fact is safe. A back
   link at the top returns to Attendance with the same date still selected.

## Student walkthrough

Log in → lands on `/student/dashboard.html` → see a table of every session you've been
marked in, with date, class name, and status. The **Upcoming classes**
(`/student/upcoming.html`) nav link shows the next 7 days of recurring weekly classes,
each with an "I'm going" button — tap it to RSVP, tap again to cancel. This is just a
heads-up for the coach; it doesn't create or replace an actual attendance record, and
you're not locked out of a class you didn't RSVP to (or penalized for RSVPing and not
showing).

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

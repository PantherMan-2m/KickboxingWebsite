// Resets the local D1 database (wiped and re-migrated from scratch) and loads
// deterministic seed data for local development and the test suite.
//
// Usage: node scripts/db-reset-seed.js  (run from the outer project folder)
//
// Deliberately re-implements the same PBKDF2 hash format as bootstrap-user.js
// (pbkdf2:sha256:<iterations>:<salt_b64>:<hash_b64>) so seeded accounts log in
// through the real auth code path, not a shortcut.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PUBLIC_DIR, runWrangler, getD1Config } = require('./lib/devEnv');
// The real app helpers, not a reimplementation -- so seed data agrees with the
// same SAST-aware (UTC+2, no DST) notion of "today" the rest of the app uses.
// Node 24 can require() this ES module directly (no top-level await, plain
// function exports).
const { todayIso, addDaysIso, dayOfWeekFor } = require('../public/functions/api/_utils/dates.js');

const { databaseName } = getD1Config();

const ITERATIONS = 100000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  return `pbkdf2:sha256:${ITERATIONS}:${salt.toString('base64')}:${hash.toString('base64')}`;
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

// Most recent date strictly before today that falls on the given day-of-week
// (0=Sun..6=Sat), for building believable "past session" seed data.
function mostRecentPastDow(dow) {
  let date = addDaysIso(todayIso(), -1); // start from yesterday
  while (dayOfWeekFor(date) !== dow) {
    date = addDaysIso(date, -1);
  }
  return date;
}

// --- 1. Wipe local D1 state entirely, then re-apply migrations from scratch ---
const localD1Dir = path.join(PUBLIC_DIR, '.wrangler', 'state', 'v3', 'd1');
if (fs.existsSync(localD1Dir)) {
  fs.rmSync(localD1Dir, { recursive: true, force: true });
}

console.log('Applying migrations to a fresh local D1...');
runWrangler(['d1', 'migrations', 'apply', databaseName, '--local']);

// --- 2. Build deterministic seed data ---
const coachPassword = 'CoachPass123!';
const studentPassword = 'StudentPass123!';
const tempPassword = 'TempPass123!';
const pendingPassword = 'PendingPass123!';

const coachId = 'seed-coach-1';
const students = [
  {
    id: 'seed-student-active-1',
    email: 'active1@seed.test',
    name: 'Alice Active',
    status: 'active',
    mustChangePassword: 0,
    passwordHash: hashPassword(studentPassword),
  },
  {
    id: 'seed-student-active-2',
    email: 'active2@seed.test',
    name: 'Bob Active',
    status: 'active',
    mustChangePassword: 0,
    passwordHash: hashPassword(studentPassword),
  },
  {
    id: 'seed-student-inactive-1',
    email: 'inactive1@seed.test',
    name: 'Ivy Inactive',
    status: 'inactive',
    mustChangePassword: 0,
    passwordHash: hashPassword(studentPassword),
  },
  {
    id: 'seed-student-pending-1',
    email: 'pending1@seed.test',
    name: 'Pat Pending',
    status: 'pending',
    mustChangePassword: 1,
    // Deliberately a KNOWN password, unlike the real request-account flow (which
    // uses an unguessable placeholder until approval). A test needs to log in with
    // the *correct* password here to prove login is blocked by status='pending'
    // itself, not merely by an unknown/wrong password -- see login.test.mjs.
    passwordHash: hashPassword(pendingPassword),
  },
  {
    id: 'seed-student-mustchange-1',
    email: 'mustchange1@seed.test',
    name: 'Mike MustChange',
    status: 'active',
    mustChangePassword: 1,
    passwordHash: hashPassword(tempPassword),
  },
  {
    // Reserved exclusively for the lockout regression test -- do not log in as
    // this user anywhere else, since the test deliberately locks the account.
    id: 'seed-student-lockout-1',
    email: 'lockout1@seed.test',
    name: 'Lex Lockout',
    status: 'active',
    mustChangePassword: 0,
    passwordHash: hashPassword('LockoutPass123!'),
  },
];

const templates = [
  { id: 'seed-template-mon', dayOfWeek: 1, startTime: '18:00', endTime: '19:00', name: 'Kickboxing Fundamentals', active: 1 },
  { id: 'seed-template-wed', dayOfWeek: 3, startTime: '18:00', endTime: '19:00', name: 'Muay Thai', active: 1 },
  { id: 'seed-template-fri', dayOfWeek: 5, startTime: '17:30', endTime: '18:30', name: 'Kids Class', active: 1 },
  { id: 'seed-template-sat-inactive', dayOfWeek: 6, startTime: '09:00', endTime: '10:00', name: 'Legacy Saturday Class', active: 0 },
];

// Two historical sessions (most recent past Monday and Wednesday), with a mixed
// attendance roster across the active + must-change-password students.
const pastMonday = mostRecentPastDow(1);
const pastWednesday = mostRecentPastDow(3);

const sessions = [
  {
    id: 'seed-session-mon-1',
    date: pastMonday,
    name: 'Kickboxing Fundamentals',
    startTime: '18:00',
    endTime: '19:00',
    templateId: 'seed-template-mon',
  },
  {
    id: 'seed-session-wed-1',
    date: pastWednesday,
    name: 'Muay Thai',
    startTime: '18:00',
    endTime: '19:00',
    templateId: 'seed-template-wed',
  },
];

const attendance = [
  { sessionId: 'seed-session-mon-1', userId: 'seed-student-active-1', status: 'present' },
  { sessionId: 'seed-session-mon-1', userId: 'seed-student-active-2', status: 'absent' },
  { sessionId: 'seed-session-mon-1', userId: 'seed-student-mustchange-1', status: 'present' },
  { sessionId: 'seed-session-wed-1', userId: 'seed-student-active-1', status: 'present' },
  { sessionId: 'seed-session-wed-1', userId: 'seed-student-active-2', status: 'excused' },
  { sessionId: 'seed-session-wed-1', userId: 'seed-student-mustchange-1', status: 'absent' },
];

// --- 3. Render SQL ---
const lines = [];

lines.push(
  `INSERT INTO users (id, email, password_hash, name, role, status, must_change_password) VALUES (${sqlString(coachId)}, ${sqlString('coach@seed.test')}, ${sqlString(hashPassword(coachPassword))}, ${sqlString('Seed Coach')}, 'coach', 'active', 0);`
);

// Reserved for the must-change-password route-protection test on the coach side --
// the primary seeded coach never has this flag set.
lines.push(
  `INSERT INTO users (id, email, password_hash, name, role, status, must_change_password) VALUES (${sqlString('seed-coach-mustchange-1')}, ${sqlString('coachmustchange@seed.test')}, ${sqlString(hashPassword(tempPassword))}, ${sqlString('Coach MustChange')}, 'coach', 'active', 1);`
);

for (const s of students) {
  lines.push(
    `INSERT INTO users (id, email, password_hash, name, role, status, must_change_password, created_by) VALUES (${sqlString(s.id)}, ${sqlString(s.email)}, ${sqlString(s.passwordHash)}, ${sqlString(s.name)}, 'student', ${sqlString(s.status)}, ${s.mustChangePassword}, ${sqlString(coachId)});`
  );
}

for (const t of templates) {
  lines.push(
    `INSERT INTO class_templates (id, day_of_week, start_time, end_time, name, active) VALUES (${sqlString(t.id)}, ${t.dayOfWeek}, ${sqlString(t.startTime)}, ${sqlString(t.endTime)}, ${sqlString(t.name)}, ${t.active});`
  );
}

for (const s of sessions) {
  lines.push(
    `INSERT INTO class_sessions (id, session_date, name, start_time, end_time, template_id, created_by) VALUES (${sqlString(s.id)}, ${sqlString(s.date)}, ${sqlString(s.name)}, ${sqlString(s.startTime)}, ${sqlString(s.endTime)}, ${sqlString(s.templateId)}, ${sqlString(coachId)});`
  );
}

for (const a of attendance) {
  lines.push(
    `INSERT INTO attendance (session_id, user_id, status, marked_by) VALUES (${sqlString(a.sessionId)}, ${sqlString(a.userId)}, ${sqlString(a.status)}, ${sqlString(coachId)});`
  );
}

const sql = lines.join('\n') + '\n';
const tmpFile = path.join(os.tmpdir(), `cjn-academy-seed-${Date.now()}.sql`);
fs.writeFileSync(tmpFile, sql, 'utf8');

console.log('Loading seed data...');
try {
  runWrangler(['d1', 'execute', databaseName, '--local', `--file=${tmpFile}`]);
} finally {
  fs.rmSync(tmpFile, { force: true });
}

console.log('\nSeed complete.');
console.log(`  Coach:   coach@seed.test / ${coachPassword}`);
console.log(`  Coach:   coachmustchange@seed.test / ${tempPassword} (forces password change)`);
console.log(`  Student: active1@seed.test / ${studentPassword} (active)`);
console.log(`  Student: active2@seed.test / ${studentPassword} (active)`);
console.log(`  Student: inactive1@seed.test (inactive, login blocked)`);
console.log(`  Student: pending1@seed.test / ${pendingPassword} (pending, login blocked despite correct password)`);
console.log(`  Student: mustchange1@seed.test / ${tempPassword} (forces password change)`);
console.log(`  Student: lockout1@seed.test / LockoutPass123! (reserved for the lockout test)`);
console.log(`  Templates: Mon/Wed/Fri active, Sat inactive`);
console.log(`  Historical sessions: ${pastMonday} (Mon), ${pastWednesday} (Wed), with mixed attendance`);

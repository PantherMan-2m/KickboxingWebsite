// Local-only helper: prints a SQL INSERT statement for creating a user (coach or
// student) directly in D1, with a correctly-formatted PBKDF2 password hash. Useful for
// bootstrapping the first coach account, since there's no self-signup yet, or for
// manually recovering a locked-out account.
//
// Usage:
//   node bootstrap-user.js "coach@cjnacademy.com" "Coach Name" coach
//   (you'll be prompted for the password -- it's never printed or logged)
//
// Then run the printed SQL via:
//   npx wrangler d1 execute cjn-academy --remote --command="<paste the INSERT>"

const crypto = require('crypto');

const [, , email, name, role] = process.argv;

if (!email || !name || !role || !['coach', 'student'].includes(role)) {
  console.error('Usage: node bootstrap-user.js <email> <name> <coach|student>');
  process.exit(1);
}

const ITERATIONS = 100000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  return `pbkdf2:sha256:${ITERATIONS}:${salt.toString('base64')}:${hash.toString('base64')}`;
}

// Reads a line from stdin with the input masked as asterisks (raw-mode terminal),
// so the password isn't echoed to the screen or left in shell/scrollback history.
function readMaskedPassword(promptText) {
  return new Promise((resolve) => {
    process.stdout.write(promptText);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let input = '';
    const onData = (char) => {
      if (char === '\r' || char === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input);
      } else if (char === '') {
        process.exit(1); // Ctrl+C
      } else if (char === '' || char === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        input += char;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

(async () => {
  const password = await readMaskedPassword('Password for this account: ');
  if (!password || password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = hashPassword(password);
  const id = crypto.randomUUID();
  const emailEscaped = email.replace(/'/g, "''");
  const nameEscaped = name.replace(/'/g, "''");

  const sql =
    `INSERT INTO users (id, email, password_hash, name, role, status, must_change_password) ` +
    `VALUES ('${id}', '${emailEscaped}', '${passwordHash}', '${nameEscaped}', '${role}', 'active', 1);`;

  console.log('\nRun this against D1 (nothing above this line contains your password):\n');
  console.log(sql);
})();

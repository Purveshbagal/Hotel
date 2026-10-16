// Usage: npm run reset-admin -- <new-password> [username]
// Resets (or re-activates) a user's password directly in the SQLite database.
// Run it while the app is stopped, or at least when nobody is logged in as that user.
import Database from 'better-sqlite3';
import { randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [password, username = 'admin'] = process.argv.slice(2);
if (!password || password.length < 6) {
  console.error('Usage: npm run reset-admin -- <new-password (min 6 chars)> [username]');
  process.exit(1);
}

const file = process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : path.join(process.cwd(), 'data', 'hotel.db');
if (!fs.existsSync(file)) {
  console.error(`Database not found at ${file}. Start the app once to create it.`);
  process.exit(1);
}

const N = 16384, r = 8, p = 1;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N, r, p });
const stored = `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;

const db = new Database(file);
const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (user) {
  db.prepare(`UPDATE users SET password_hash = ?, is_active = 1, must_change_password = 0, updated_at = datetime('now','localtime') WHERE id = ?`).run(stored, user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  console.log(`Password for "${username}" has been reset and the account is active.`);
} else {
  db.prepare(`INSERT INTO users(name, username, role, password_hash) VALUES (?, ?, 'admin', ?)`).run('Administrator', username, stored);
  console.log(`Created new admin user "${username}".`);
}
db.close();

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './schema';
import { hashPassword } from './password';
import { DEFAULT_SETTINGS } from './settings-defaults';

type DB = Database.Database;
type Param = string | number | bigint | Buffer | null | undefined | boolean;

const globalForDb = globalThis as unknown as {
  __hmsDb?: DB;
  __hmsStatements?: Map<string, Database.Statement>;
  __hmsMigrationCount?: number;
};

export function databasePath(): string {
  return process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(process.cwd(), 'data', 'hotel.db');
}

function migrate(db: DB) {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
}

function bootstrap(db: DB) {
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
  db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(key, value);
  })();

  const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  if (count === 0) {
    const password = process.env.ADMIN_PASSWORD || '123456';
    db.prepare(
      `INSERT INTO users(name, username, role, password_hash) VALUES ('Administrator', 'admin', 'admin', ?)`,
    ).run(hashPassword(password));
    console.log('[hms] Created default admin account (username: admin).');
  }

  db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now','localtime')`).run();
}

function open(): DB {
  const file = databasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  migrate(db);
  bootstrap(db);
  return db;
}

export function getDb(): DB {
  if (!globalForDb.__hmsDb) {
    globalForDb.__hmsDb = open();
    globalForDb.__hmsStatements = new Map();
    globalForDb.__hmsMigrationCount = MIGRATIONS.length;
  } else if (globalForDb.__hmsMigrationCount !== MIGRATIONS.length) {
    // Next.js preserves global connections across hot reloads. New application
    // code must migrate that connection before preparing queries for new tables.
    migrate(globalForDb.__hmsDb);
    globalForDb.__hmsStatements?.clear();
    globalForDb.__hmsMigrationCount = MIGRATIONS.length;
  }
  return globalForDb.__hmsDb;
}

function stmt(sql: string): Database.Statement {
  const db = getDb();
  const cache = globalForDb.__hmsStatements!;
  let s = cache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    cache.set(sql, s);
  }
  return s;
}

function normalize(params: Param[]) {
  return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));
}

export function all<T = Record<string, unknown>>(sql: string, ...params: Param[]): T[] {
  return stmt(sql).all(...normalize(params)) as T[];
}

export function get<T = Record<string, unknown>>(sql: string, ...params: Param[]): T | undefined {
  return stmt(sql).get(...normalize(params)) as T | undefined;
}

export function run(sql: string, ...params: Param[]): Database.RunResult {
  return stmt(sql).run(...normalize(params));
}

/** Shortcut for `SELECT <expr> AS v ...` queries that return a single number. */
export function scalar(sql: string, ...params: Param[]): number {
  const row = stmt(sql).get(...normalize(params)) as Record<string, unknown> | undefined;
  if (!row) return 0;
  const v = Object.values(row)[0];
  return typeof v === 'number' ? v : Number(v ?? 0);
}

export function transaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}

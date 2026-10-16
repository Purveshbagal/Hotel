import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createHash, randomBytes } from 'node:crypto';
import { get, run } from './db';
import { can, type Permission, type Role } from './permissions';

export const SESSION_COOKIE = 'hms_session';

export type SessionUser = {
  id: number;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: Role;
};

function sessionHours(): number {
  const h = Number(process.env.SESSION_HOURS);
  return Number.isFinite(h) && h > 0 ? h : 24;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const hours = sessionHours();
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  run(
    `INSERT INTO sessions(id, user_id, expires_at, ip, user_agent)
     VALUES (?, ?, datetime('now','localtime', ?), ?, ?)`,
    hashToken(token),
    userId,
    `+${hours} hours`,
    ip,
    h.get('user-agent')?.slice(0, 300) ?? null,
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: hours * 3600,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) run('DELETE FROM sessions WHERE id = ?', hashToken(token));
  jar.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = get<SessionUser>(
    `SELECT u.id, u.name, u.username, u.email, u.phone, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > datetime('now','localtime') AND u.is_active = 1`,
    hashToken(token),
  );
  return user ?? null;
});

/** For pages: redirects to /login when signed out, or to /unauthorized without permission. */
export async function requireUser(permission?: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (permission && !can(user.role, permission)) redirect('/unauthorized');
  return user;
}

// ---- Simple in-memory login throttling (per username + IP) ----
const attempts = (globalThis as unknown as { __hmsLoginAttempts?: Map<string, { count: number; first: number }> });
attempts.__hmsLoginAttempts ??= new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function loginThrottleKey(username: string, ip: string | null) {
  return `${username.toLowerCase()}|${ip ?? ''}`;
}

export function isLoginBlocked(key: string): boolean {
  const entry = attempts.__hmsLoginAttempts!.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    attempts.__hmsLoginAttempts!.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function recordLoginFailure(key: string) {
  const map = attempts.__hmsLoginAttempts!;
  const entry = map.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) map.set(key, { count: 1, first: Date.now() });
  else entry.count++;
}

export function clearLoginFailures(key: string) {
  attempts.__hmsLoginAttempts!.delete(key);
}

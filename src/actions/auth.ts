'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-types';
import { fail, logActivity, ok, parseForm, runAction } from '@/lib/action';
import {
  clearLoginFailures, createSession, destroySession, getCurrentUser, isLoginBlocked, loginThrottleKey, recordLoginFailure,
} from '@/lib/auth';
import { get, run } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { homeFor, type Role } from '@/lib/permissions';

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!username || !password) return { ok: false, error: 'Please enter your username and password.' };

  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  const key = loginThrottleKey(username, ip);
  if (isLoginBlocked(key)) return { ok: false, error: 'Too many failed attempts. Please wait 15 minutes and try again.' };

  const user = get<{ id: number; password_hash: string; is_active: number; role: Role }>(
    'SELECT id, password_hash, is_active, role FROM users WHERE username = ?',
    username,
  );
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordLoginFailure(key);
    return { ok: false, error: 'Invalid username or password.' };
  }
  if (!user.is_active) return { ok: false, error: 'Your account has been deactivated. Contact the administrator.' };

  clearLoginFailures(key);
  await createSession(user.id);
  run(`UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?`, user.id);
  logActivity(user.id, 'Signed in', 'user', user.id, ip ? `IP ${ip}` : null);
  return { ok: true, redirectTo: homeFor(user.role) };
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) logActivity(user.id, 'Signed out', 'user', user.id);
  await destroySession();
  redirect('/login');
}

const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'is required'),
    new_password: z.string().min(6, 'must be at least 6 characters').max(100),
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, { message: 'Passwords do not match', path: ['confirm_password'] });

export async function changeOwnPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(null, async (user) => {
    const data = parseForm(passwordSchema, formData);
    if (data.new_password === data.current_password) fail('The new password must be different from the current one.');
    const row = get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', user.id);
    if (!row || !verifyPassword(data.current_password, row.password_hash)) fail('Current password is incorrect.');
    run(
      `UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
      hashPassword(data.new_password),
      user.id,
    );
    // Sign out every other device.
    run('DELETE FROM sessions WHERE user_id = ?', user.id);
    await createSession(user.id);
    logActivity(user.id, 'Changed own password', 'user', user.id);
    return ok('Password changed successfully.');
  });
}

const profileSchema = z.object({
  name: z.string().trim().min(1, 'is required').max(100),
  email: z.union([z.literal(''), z.email('must be a valid email address')]),
  phone: z.string().trim().max(30),
});

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(null, (user) => {
    const data = parseForm(profileSchema, formData);
    run(
      `UPDATE users SET name = ?, email = ?, phone = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
      data.name,
      data.email || null,
      data.phone || null,
      user.id,
    );
    return ok('Profile updated.');
  });
}


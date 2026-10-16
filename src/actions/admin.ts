'use server';

import { z } from 'zod';
import type { ActionState } from '@/lib/action-types';
import { fail, formId, logActivity, ok, parseForm, runAction, zf } from '@/lib/action';
import { get, run, scalar, transaction } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { ROLES } from '@/lib/permissions';
import { seedDemoData } from '@/lib/services/demo';
import { DEFAULT_SETTINGS, type SettingKey } from '@/lib/settings-defaults';

// ---------------------------------------------------------------- users

const userSchema = z.object({
  id: zf.optionalId,
  name: zf.text(100),
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9._-]{3,40}$/, 'must be 3–40 characters: letters, numbers, dot, dash or underscore'),
  email: zf.email,
  phone: zf.optionalText(30),
  role: zf.enumOf(ROLES),
  is_active: zf.bool,
  password: z.string().optional(),
});

function otherActiveAdmins(excludeId: number) {
  return scalar(`SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1 AND id <> ?`, excludeId);
}

export async function saveUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('users', (user) => {
    const d = parseForm(userSchema, formData);
    if (d.id) {
      const existing = get<{ role: string; is_active: number }>('SELECT role, is_active FROM users WHERE id = ?', d.id);
      if (!existing) fail('User not found.');
      if (d.id === user.id && (d.role !== 'admin' || !d.is_active))
        fail('You cannot remove your own administrator access or deactivate yourself.');
      if (existing.role === 'admin' && (d.role !== 'admin' || !d.is_active) && otherActiveAdmins(d.id) === 0)
        fail('At least one active administrator is required.');
      transaction(() => {
        run(
          `UPDATE users SET name = ?, username = ?, email = ?, phone = ?, role = ?, is_active = ?,
                  updated_at = datetime('now','localtime') WHERE id = ?`,
          d.name, d.username, d.email, d.phone, d.role, d.is_active, d.id,
        );
        if (!d.is_active) run('DELETE FROM sessions WHERE user_id = ?', d.id);
      });
      logActivity(user.id, 'Updated user', 'user', d.id, `${d.username} (${d.role}${d.is_active ? '' : ', inactive'})`);
      return ok('User updated.');
    }
    if (!d.password || d.password.length < 6) fail('Password must be at least 6 characters.');
    const r = run(
      `INSERT INTO users(name, username, email, phone, role, is_active, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      d.name, d.username, d.email, d.phone, d.role, d.is_active, hashPassword(d.password),
    );
    logActivity(user.id, 'Created user', 'user', r.lastInsertRowid, `${d.username} (${d.role})`);
    return ok(`User ${d.username} created.`);
  });
}

const resetSchema = z
  .object({
    id: zf.id,
    password: z.string().min(6, 'must be at least 6 characters').max(100),
    confirm_password: z.string(),
  })
  .refine((v) => v.password === v.confirm_password, { message: 'Passwords do not match', path: ['confirm_password'] });

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('users', (user) => {
    const d = parseForm(resetSchema, formData);
    const target = get<{ username: string }>('SELECT username FROM users WHERE id = ?', d.id);
    if (!target) fail('User not found.');
    transaction(() => {
      run(`UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?`, hashPassword(d.password), d.id);
      if (d.id !== user.id) run('DELETE FROM sessions WHERE user_id = ?', d.id);
    });
    logActivity(user.id, 'Reset password', 'user', d.id, target.username);
    return ok(`Password reset for ${target.username}.`);
  });
}

export async function signOutUserEverywhereAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('users', (user) => {
    const id = formId(formData);
    if (id === user.id) fail('Use "Sign out" to end your own session.');
    const r = run('DELETE FROM sessions WHERE user_id = ?', id);
    logActivity(user.id, 'Ended user sessions', 'user', id);
    return ok(`${r.changes} active session(s) ended.`);
  });
}

// ---------------------------------------------------------------- settings

const CHECKBOX_KEYS: SettingKey[] = ['require_id_at_checkin', 'tax_enabled', 'split_tax'];
const PERCENT_KEYS: SettingKey[] = ['room_tax_rate_low', 'room_tax_rate_high', 'service_tax_rate', 'food_tax_rate'];
const PREFIX_KEYS: SettingKey[] = ['booking_prefix', 'invoice_prefix', 'receipt_prefix', 'order_prefix'];

export async function saveSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('settings', (user) => {
    const updates: [string, string][] = [];
    for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
      if (CHECKBOX_KEYS.includes(key)) {
        updates.push([key, formData.get(key) === 'on' ? '1' : '0']);
        continue;
      }
      const raw = formData.get(key);
      if (raw === null) continue;
      const value = String(raw).trim();
      if (key === 'hotel_name' && !value) fail('Hotel name is required.');
      if (value.length > 2000) fail(`${key} is too long.`);
      if (PERCENT_KEYS.includes(key)) {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0 || n > 100) fail('Tax rates must be between 0 and 100.');
      }
      if (key === 'room_tax_threshold' && (!Number.isFinite(Number(value)) || Number(value) < 0))
        fail('Room tax threshold must be a positive number.');
      if (PREFIX_KEYS.includes(key) && !/^[A-Za-z0-9-]{1,10}$/.test(value))
        fail('Number prefixes must be 1–10 letters, digits or dashes.');
      if ((key === 'check_in_time' || key === 'check_out_time') && !/^\d{2}:\d{2}$/.test(value))
        fail('Check-in/out time must be in HH:MM format.');
      if (key === 'currency_symbol' && (!value || value.length > 5)) fail('Currency symbol must be 1–5 characters.');
      if (key === 'hotel_gstin' && value && !/^[0-9A-Z]{15}$/i.test(value)) fail('GSTIN must be 15 characters.');
      updates.push([key, key === 'hotel_gstin' ? value.toUpperCase() : value]);
    }
    transaction(() => {
      for (const [k, v] of updates)
        run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, v);
    });
    logActivity(user.id, 'Updated settings', 'settings', null);
    return ok('Settings saved.');
  });
}

export async function loadDemoDataAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  return runAction('settings', (user) => {
    if (scalar('SELECT COUNT(*) FROM rooms') > 0 || scalar('SELECT COUNT(*) FROM bookings') > 0)
      fail('Demo data can only be loaded into an empty system (no rooms or bookings).');
    seedDemoData(user.id);
    logActivity(user.id, 'Loaded demo data', 'settings', null);
    return ok('Demo data loaded: rooms, guests, bookings, menu, inventory and expenses.', '/dashboard');
  });
}

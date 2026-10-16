import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from './action-types';
import { getCurrentUser, type SessionUser } from './auth';
import { can, type Permission } from './permissions';
import { run } from './db';

/** An error whose message is safe to show to the user. */
export class UserError extends Error {}

export function fail(message: string): never {
  throw new UserError(message);
}

function friendlyError(e: unknown): string {
  if (e instanceof UserError) return e.message;
  const code = (e as { code?: string })?.code ?? '';
  if (code.startsWith('SQLITE_CONSTRAINT')) {
    if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY')
      return 'A record with the same value already exists.';
    if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY')
      return 'This record is linked to other records and cannot be removed. Deactivate it instead.';
    if (code === 'SQLITE_CONSTRAINT_CHECK') return 'One of the values is not allowed. Please check the form.';
    return 'The data could not be saved because it breaks a database rule.';
  }
  if (code === 'SQLITE_BUSY') return 'The database is busy. Please try again.';
  console.error('[hms] action failed:', e);
  return 'Something went wrong. Please try again.';
}

/**
 * Wraps every server action: checks the session and permission, converts errors into
 * user-facing messages and refreshes cached pages after a successful change.
 */
export async function runAction(
  permission: Permission | Permission[] | null,
  fn: (user: SessionUser) => ActionState | Promise<ActionState>,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Your session has expired. Please sign in again.' };
  const perms = permission === null ? [] : Array.isArray(permission) ? permission : [permission];
  if (perms.length && !perms.some((p) => can(user.role, p)))
    return { ok: false, error: 'You do not have permission to perform this action.' };
  try {
    const result = await fn(user);
    revalidatePath('/', 'layout');
    return result;
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: friendlyError(e) };
  }
}

/** Reads a positive integer ID from the form (hidden input), failing with a friendly message. */
export function formId(formData: FormData, key = 'id'): number {
  const n = Number(formData.get(key));
  if (!Number.isInteger(n) || n <= 0) fail('Invalid record reference. Please reload the page and try again.');
  return n;
}

export function ok(message?: string, redirectTo?: string): ActionState {
  return { ok: true, message, redirectTo };
}

export function logActivity(
  userId: number | null,
  action: string,
  entityType: string | null = null,
  entityId: number | bigint | null = null,
  details: string | null = null,
) {
  run(
    'INSERT INTO activity_logs(user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    userId,
    action,
    entityType,
    entityId === null ? null : Number(entityId),
    details,
  );
}

// ---------- Form parsing ----------

function humanize(key: string) {
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function parseForm<T extends z.ZodType>(schema: T, formData: FormData): z.infer<T> {
  const raw: Record<string, FormDataEntryValue> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith('$')) raw[k] = v;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path?.length ? humanize(String(issue.path[issue.path.length - 1])) : '';
    fail(field ? `${field}: ${issue.message}` : issue?.message ?? 'Invalid input');
  }
  return result.data;
}

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

export const zf = {
  id: z.coerce.number({ error: 'Invalid ID' }).int().positive('Invalid ID'),
  optionalId: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()).transform((v) => v ?? null),
  text: (max = 200) => z.string({ error: 'is required' }).trim().min(1, 'is required').max(max, `must be at most ${max} characters`),
  optionalText: (max = 1000) =>
    z.preprocess(emptyToUndefined, z.string().trim().max(max, `must be at most ${max} characters`).optional()).transform((v) => (v ? v : null)),
  money: z.preprocess(emptyToUndefined, z.coerce.number({ error: 'must be a number' }).min(0, 'cannot be negative').max(1e9).default(0)).transform((v) => Math.round(v * 100) / 100),
  positiveMoney: z.coerce.number({ error: 'must be a number' }).positive('must be greater than zero').max(1e9).transform((v) => Math.round(v * 100) / 100),
  percent: z.preprocess(emptyToUndefined, z.coerce.number({ error: 'must be a number' }).min(0).max(100).default(0)),
  int: (min = 0, max = 1_000_000) => z.preprocess(emptyToUndefined, z.coerce.number({ error: 'must be a number' }).int('must be a whole number').min(min, `must be at least ${min}`).max(max, `must be at most ${max}`).default(min)),
  quantity: z.coerce.number({ error: 'must be a number' }).positive('must be greater than zero').max(1e7),
  bool: z.preprocess((v) => v === 'on' || v === 'true' || v === '1' || v === true, z.boolean()),
  date: z.string({ error: 'is required' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a valid date'),
  optionalDate: z.preprocess(emptyToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a valid date').optional()).transform((v) => v ?? null),
  email: z.preprocess(emptyToUndefined, z.email('must be a valid email address').optional()).transform((v) => v ?? null),
  enumOf: <const T extends readonly [string, ...string[]]>(values: T) => z.enum(values, { error: 'has an invalid value' }),
};

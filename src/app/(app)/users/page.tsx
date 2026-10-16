import type { Metadata } from 'next';
import { KeyRound, LogOut, Pencil, Plus } from 'lucide-react';
import { resetPasswordAction, saveUserAction, signOutUserEverywhereAction } from '@/actions/admin';
import { ActionButton, ActionForm, FormActions, SubmitButton } from '@/components/action-form';
import { Modal } from '@/components/modal';
import { Badge, Card, Checkbox, Field, PageHeader, Select, TableWrap } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { all } from '@/lib/db';
import { ROLE_LABELS, ROLES } from '@/lib/permissions';
import type { User } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Staff & Users' };

const ROLE_HELP: Record<string, string> = {
  admin: 'Full access including users, settings and backups',
  manager: 'Everything except user management and settings',
  receptionist: 'Front desk, bookings, guests, billing, restaurant orders',
  housekeeping: 'Housekeeping board, tasks, maintenance, inventory',
  accountant: 'Billing, payments, expenses and reports',
  restaurant: 'Restaurant orders, menu and kitchen inventory',
};

export default async function UsersPage() {
  const me = await requireUser('users');
  const users = all<User & { sessions: number }>(
    `SELECT u.*, (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > datetime('now','localtime')) AS sessions
       FROM users u ORDER BY u.is_active DESC, u.role, u.name`,
  );
  const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  return (
    <>
      <PageHeader
        title="Staff & Users"
        description="Create staff logins and control what each role can access."
        actions={
          <Modal title="Add user" trigger={<><Plus className="size-4" /> Add user</>}>
            <UserForm roleOptions={roleOptions} />
          </Modal>
        }
      />
      <Card>
        <TableWrap>
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Contact</th>
                <th>Last login</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.is_active ? '' : 'opacity-60'}>
                  <td className="font-medium">
                    {u.name} {u.id === me.id ? <Badge tone="indigo">You</Badge> : null}
                  </td>
                  <td className="font-mono text-xs">{u.username}</td>
                  <td>
                    <Badge tone={u.role === 'admin' ? 'purple' : 'gray'}>{ROLE_LABELS[u.role]}</Badge>
                  </td>
                  <td className="text-xs text-slate-600">{[u.phone, u.email].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="whitespace-nowrap text-xs text-slate-600">
                    {formatDateTime(u.last_login_at)}
                    {u.sessions ? <p className="text-emerald-600">{u.sessions} active session(s)</p> : null}
                  </td>
                  <td>{u.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Modal title={`Edit ${u.name}`} trigger={<Pencil className="size-4" />} triggerVariant="ghost" triggerSize="xs" triggerTitle="Edit">
                        <UserForm roleOptions={roleOptions} user={u} isSelf={u.id === me.id} />
                      </Modal>
                      <Modal title={`Reset password — ${u.username}`} trigger={<KeyRound className="size-4" />} triggerVariant="ghost" triggerSize="xs" triggerTitle="Reset password" size="sm">
                        <ActionForm action={resetPasswordAction}>
                          <input type="hidden" name="id" value={u.id} />
                          <div className="space-y-4">
                            <Field label="New password" required>
                              <input type="password" name="password" className="input" required minLength={6} autoComplete="new-password" />
                            </Field>
                            <Field label="Confirm password" required>
                              <input type="password" name="confirm_password" className="input" required minLength={6} autoComplete="new-password" />
                            </Field>
                          </div>
                          <FormActions>
                            <SubmitButton>Reset password</SubmitButton>
                          </FormActions>
                        </ActionForm>
                      </Modal>
                      {u.sessions && u.id !== me.id ? (
                        <ActionButton action={signOutUserEverywhereAction} fields={{ id: u.id }} variant="ghost" size="xs" confirm={`Sign ${u.name} out of all devices?`} title="Sign out everywhere">
                          <LogOut className="size-4" />
                        </ActionButton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="mb-3 font-semibold">Role permissions</h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r} className="rounded-lg bg-slate-50 p-3">
              <dt className="text-sm font-semibold">{ROLE_LABELS[r]}</dt>
              <dd className="mt-0.5 text-xs text-slate-600">{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}

function UserForm({ roleOptions, user, isSelf }: { roleOptions: { value: string; label: string }[]; user?: User; isSelf?: boolean }) {
  return (
    <ActionForm action={saveUserAction}>
      {user ? <input type="hidden" name="id" value={user.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required>
          <input name="name" className="input" required maxLength={100} defaultValue={user?.name} />
        </Field>
        <Field label="Username" required hint="Used to sign in">
          <input name="username" className="input" required maxLength={40} pattern="[a-zA-Z0-9._\-]{3,40}" defaultValue={user?.username} autoComplete="off" />
        </Field>
        <Field label="Role" required>
          {isSelf ? (
            <>
              <input type="hidden" name="role" value={user?.role} />
              <Select name="role_display" options={roleOptions} defaultValue={user?.role} disabled />
            </>
          ) : (
            <Select name="role" options={roleOptions} defaultValue={user?.role ?? 'receptionist'} />
          )}
        </Field>
        <Field label="Phone">
          <input name="phone" className="input" maxLength={30} defaultValue={user?.phone ?? ''} />
        </Field>
        <Field label="Email" className="sm:col-span-2">
          <input name="email" type="email" className="input" maxLength={150} defaultValue={user?.email ?? ''} />
        </Field>
        {!user ? (
          <Field label="Password" required hint="At least 6 characters">
            <input name="password" type="password" className="input" required minLength={6} autoComplete="new-password" />
          </Field>
        ) : null}
        <div className="sm:col-span-2">
          {isSelf ? (
            <input type="hidden" name="is_active" value="on" />
          ) : (
            <Checkbox name="is_active" label="Active (can sign in)" defaultChecked={user ? !!user.is_active : true} />
          )}
        </div>
      </div>
      <FormActions>
        <SubmitButton>{user ? 'Save changes' : 'Create user'}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

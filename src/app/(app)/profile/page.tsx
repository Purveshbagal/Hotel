import type { Metadata } from 'next';
import { changeOwnPasswordAction, updateProfileAction } from '@/actions/auth';
import { ActionForm, FormActions, SubmitButton } from '@/components/action-form';
import { Card, CardHeader, Field, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/permissions';

export const metadata: Metadata = { title: 'My profile' };

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="My profile" description={`Signed in as ${user.username} · ${ROLE_LABELS[user.role]}`} />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Personal details" />
          <div className="p-5">
            <ActionForm action={updateProfileAction}>
              <div className="space-y-4">
                <Field label="Full name" required>
                  <input name="name" className="input" required maxLength={100} defaultValue={user.name} />
                </Field>
                <Field label="Email">
                  <input name="email" type="email" className="input" maxLength={150} defaultValue={user.email ?? ''} />
                </Field>
                <Field label="Phone">
                  <input name="phone" className="input" maxLength={30} defaultValue={user.phone ?? ''} />
                </Field>
              </div>
              <FormActions>
                <SubmitButton>Save</SubmitButton>
              </FormActions>
            </ActionForm>
          </div>
        </Card>
        <Card>
          <CardHeader title="Change password" description="You will be signed out of other devices." />
          <div className="p-5">
            <ActionForm action={changeOwnPasswordAction} resetOnSuccess>
              <div className="space-y-4">
                <Field label="Current password" required>
                  <input name="current_password" type="password" className="input" required autoComplete="current-password" />
                </Field>
                <Field label="New password" required hint="At least 6 characters">
                  <input name="new_password" type="password" className="input" required minLength={6} autoComplete="new-password" />
                </Field>
                <Field label="Confirm new password" required>
                  <input name="confirm_password" type="password" className="input" required minLength={6} autoComplete="new-password" />
                </Field>
              </div>
              <FormActions>
                <SubmitButton>Change password</SubmitButton>
              </FormActions>
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}

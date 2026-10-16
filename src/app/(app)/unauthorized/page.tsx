import { ShieldAlert } from 'lucide-react';
import { LinkButton } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { homeFor } from '@/lib/permissions';

export default async function UnauthorizedPage() {
  const user = await requireUser();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 rounded-full bg-rose-50 p-4 text-rose-600">
        <ShieldAlert className="size-8" />
      </div>
      <h1 className="text-xl font-bold">Access denied</h1>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Your role does not have permission to open this page. Contact your administrator if you need access.
      </p>
      <LinkButton href={homeFor(user.role)} className="mt-6">
        Go to my home page
      </LinkButton>
    </div>
  );
}

import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/auth';
import { navFor, ROLE_LABELS } from '@/lib/permissions';
import { getSettings } from '@/lib/settings';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = getSettings();
  return (
    <AppShell
      nav={navFor(user.role)}
      hotelName={settings.hotel_name}
      user={{ name: user.name, roleLabel: ROLE_LABELS[user.role] }}
    >
      {children}
    </AppShell>
  );
}

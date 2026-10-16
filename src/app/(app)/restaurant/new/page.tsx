import type { Metadata } from 'next';
import { createOrderAction } from '@/actions/restaurant';
import { LinkButton, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { all } from '@/lib/db';
import { inHouseBookings } from '@/lib/services/booking';
import { effectiveTaxRate, getSettings } from '@/lib/settings';
import type { MenuItem } from '@/lib/types';
import { diningTables } from '@/lib/restaurant';
import { PosTerminal } from './pos-terminal';

export const metadata: Metadata = { title: 'New order' };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  await requireUser('restaurant');
  const settings = getSettings();
  const { table } = await searchParams;
  const menu = all<MenuItem>('SELECT * FROM menu_items WHERE is_available = 1 ORDER BY category, name').map((m) => ({
    ...m,
    tax_rate: effectiveTaxRate(m.tax_rate, settings),
  }));
  return (
    <>
      <PageHeader title="New order" back={{ href: '/restaurant', label: 'Restaurant' }} />
      {menu.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="font-medium">The menu is empty.</p>
          <p className="mt-1 text-sm text-slate-500">Add dishes and drinks to the menu before taking orders.</p>
          <LinkButton href="/restaurant/menu" className="mt-4">Open menu</LinkButton>
        </div>
      ) : (
        <PosTerminal tables={diningTables().filter(t => !t.order_id && ['available', 'reserved'].includes(t.status))} initialTable={table} action={createOrderAction} menu={menu} rooms={inHouseBookings()} currency={settings.currency_symbol} />
      )}
    </>
  );
}

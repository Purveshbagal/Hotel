import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, Plus } from 'lucide-react';
import { Card, EmptyState, LinkButton, PageHeader, StatCard, StatusBadge, TableWrap, Tabs } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { PAYMENT_METHODS, optionLabel } from '@/lib/constants';
import { all, scalar } from '@/lib/db';
import { can } from '@/lib/permissions';
import { getSettings } from '@/lib/settings';
import { formatDateTime, formatMoney, labelize, todayStr } from '@/lib/utils';

export const metadata: Metadata = { title: 'Restaurant' };

export default async function RestaurantPage({ searchParams }: { searchParams: Promise<{ tab?: string; date?: string }> }) {
  const user = await requireUser('restaurant');
  const sp = await searchParams;
  const tab = sp.tab ?? 'open';
  const cur = getSettings().currency_symbol;
  const today = todayStr();
  const date = sp.date ?? today;

  const orders = all<{
    id: number; order_no: string; order_type: string; status: string; table_no: string | null; customer_name: string | null;
    room_number: string | null; guest_name: string | null; total: number; settlement: string | null; payment_method: string | null;
    created_at: string; items: number;
  }>(
    `SELECT o.*, r.room_number, g.name AS guest_name,
            (SELECT COALESCE(SUM(quantity), 0) FROM restaurant_order_items i WHERE i.order_id = o.id) AS items
       FROM restaurant_orders o
       LEFT JOIN bookings b ON b.id = o.booking_id
       LEFT JOIN rooms r ON r.id = b.room_id
       LEFT JOIN guests g ON g.id = b.guest_id
      WHERE ${tab === 'open' ? `o.status IN ('pending','preparing','served')` : `o.status IN ('completed','cancelled') AND date(COALESCE(o.completed_at, o.created_at)) = ?`}
      ORDER BY o.id DESC LIMIT 300`,
    ...(tab === 'open' ? [] : [date]),
  );
  const openCount = scalar(`SELECT COUNT(*) FROM restaurant_orders WHERE status IN ('pending','preparing','served')`);
  const sales = (where: string) =>
    scalar(`SELECT COALESCE(SUM(total), 0) FROM restaurant_orders WHERE status = 'completed' AND date(completed_at) = ? ${where}`, today);

  return (
    <>
      <PageHeader
        title="Restaurant overview"
        description="Take orders, send them to the kitchen and settle bills or charge them to a room."
        actions={
          <>
            <LinkButton href="/restaurant/tables" variant="secondary">Dining floor</LinkButton>
            <LinkButton href="/restaurant/kitchen" variant="secondary">Kitchen board</LinkButton>
            {can(user.role, 'menu') ? (
              <LinkButton href="/restaurant/menu" variant="secondary">
                <BookOpen className="size-4" /> Menu
              </LinkButton>
            ) : null}
            <LinkButton href="/restaurant/new">
              <Plus className="size-4" /> New order
            </LinkButton>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Today's sales" value={formatMoney(sales(''), cur)} tone="green" />
        <StatCard label="Charged to rooms today" value={formatMoney(sales(`AND settlement = 'room'`), cur)} tone="indigo" />
        <StatCard label="Open orders" value={openCount} tone="yellow" />
      </div>
      <Tabs
        active={tab}
        tabs={[
          { key: 'open', label: 'Open orders', href: '/restaurant', count: openCount },
          { key: 'closed', label: 'Completed / Cancelled', href: `/restaurant?tab=closed&date=${date}` },
        ]}
      />
      <Card>
        {tab !== 'open' ? (
          <form method="get" className="flex gap-3 border-b border-slate-200 p-4">
            <input type="hidden" name="tab" value="closed" />
            <input type="date" name="date" defaultValue={date} className="input w-auto" />
            <button className="input w-auto cursor-pointer font-medium hover:bg-slate-50">Show</button>
          </form>
        ) : null}
        {orders.length === 0 ? (
          <EmptyState title={tab === 'open' ? 'No open orders' : 'No orders for this date'} action={tab === 'open' ? <LinkButton href="/restaurant/new">Take an order</LinkButton> : undefined} />
        ) : (
          <TableWrap>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Type</th>
                  <th>For</th>
                  <th className="text-right">Items</th>
                  <th className="text-right">Total</th>
                  <th>Status</th>
                  <th>Settlement</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/restaurant/${o.id}`} className="link">{o.order_no}</Link></td>
                    <td>{labelize(o.order_type)}</td>
                    <td>
                      {o.room_number ? `Room ${o.room_number} · ${o.guest_name}` : o.table_no ? `Table ${o.table_no}` : o.customer_name ?? '—'}
                    </td>
                    <td className="text-right">{o.items}</td>
                    <td className="whitespace-nowrap text-right font-medium">{formatMoney(o.total, cur)}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="text-xs">
                      {o.settlement === 'room' ? 'Charged to room' : o.settlement === 'paid' ? optionLabel(PAYMENT_METHODS, o.payment_method) : '—'}
                    </td>
                    <td className="whitespace-nowrap text-xs text-slate-600">{formatDateTime(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}

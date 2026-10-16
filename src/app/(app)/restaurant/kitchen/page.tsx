import { ChefHat } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { all } from '@/lib/db';
import type { RestaurantOrder, OrderItem } from '@/lib/types';
import { formatDateTime, labelize } from '@/lib/utils';
import { updateOrderStatusAction } from '@/actions/restaurant';
import { ActionButton } from '@/components/action-form';
import { Badge, LinkButton, PageHeader } from '@/components/ui';
import { LiveRefresh } from '@/components/live-refresh';
export const metadata = { title: 'Kitchen board' };
export default async function KitchenPage() {
  await requireUser('restaurant');
  const orders = all<RestaurantOrder & { room_number: string | null }>(`SELECT o.*, r.room_number FROM restaurant_orders o LEFT JOIN bookings b ON b.id = o.booking_id LEFT JOIN rooms r ON r.id = b.room_id WHERE o.status IN ('pending','preparing','served') ORDER BY o.created_at, o.id`);
  const items = all<OrderItem>(`SELECT i.* FROM restaurant_order_items i JOIN restaurant_orders o ON o.id = i.order_id WHERE o.status IN ('pending','preparing','served') ORDER BY i.id`);
  return <><PageHeader title="Kitchen board" description="From order to service. Oldest tickets appear first in each lane." back={{ href: '/restaurant', label: 'Restaurant' }} actions={<><LiveRefresh /><LinkButton href="/restaurant/tables" variant="secondary">Dining floor</LinkButton></>} />
    <div className="grid items-start gap-5 lg:grid-cols-3">{(['pending', 'preparing', 'served'] as const).map(status => <section key={status} className="rounded-2xl bg-slate-200/40 p-3 sm:p-4"><div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><ChefHat className="size-4" />{status === 'pending' ? 'New tickets' : status === 'preparing' ? 'In preparation' : 'Served · awaiting payment'}</h2><Badge>{orders.filter(o => o.status === status).length}</Badge></div>
      <div className="space-y-4">{orders.filter(o => o.status === status).map(o => <article key={o.id} className="card overflow-hidden"><div className="border-b border-slate-100 p-4"><div className="flex justify-between gap-2"><LinkButton href={`/restaurant/${o.id}`} variant="ghost" size="sm">{o.order_no}</LinkButton><Badge tone={status === 'pending' ? 'yellow' : 'indigo'}>{labelize(o.order_type)}</Badge></div><p className="mt-2 text-lg font-semibold">{o.table_no ? `Table ${o.table_no}` : o.room_number ? `Room ${o.room_number}` : o.customer_name || 'Takeaway'}</p><p className="mt-1 text-xs text-slate-500">Ordered {formatDateTime(o.created_at)}</p></div><ul className="space-y-3 p-4">{items.filter(i => i.order_id === o.id).map(i => <li key={i.id} className="flex gap-3"><span className="h-fit rounded-lg bg-indigo-50 px-2 py-1 font-semibold text-indigo-700">{i.quantity}×</span><div><p className="font-medium">{i.name}</p><p className="text-xs text-slate-500">Round {i.kot_batch} <span className="capitalize">{i.kitchen_status}</span></p>{i.notes && <p className="mt-1 text-sm text-amber-800">{i.notes}</p>}</div></li>)}</ul>{o.notes && <p className="mx-4 mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{o.notes}</p>}<div className="flex flex-wrap gap-2 border-t border-slate-100 p-4">{status !== 'served' && <ActionButton action={updateOrderStatusAction} fields={{ id: o.id, status: status === 'pending' ? 'preparing' : 'served' }} variant="primary">{status === 'pending' ? 'Start preparing' : 'Mark served'}</ActionButton>}<LinkButton href={`/print/order/${o.id}?kot=1`} target="_blank" variant="secondary" size="sm">Print KOT</LinkButton></div></article>)}{!orders.some(o => o.status === status) && <p className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">No tickets in this lane</p>}</div>
    </section>)}</div></>;
}

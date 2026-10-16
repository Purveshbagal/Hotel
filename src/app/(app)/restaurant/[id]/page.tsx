import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BedDouble, ChefHat, CircleCheck, Plus, Printer, Trash2, Wallet, XCircle } from 'lucide-react';
import {
  discountOrderAction, transferTableAction, addOrderItemAction, cancelOrderAction, removeOrderItemAction, settleOrderAction, updateOrderStatusAction,
} from '@/actions/restaurant';
import { RestaurantPayment } from '@/components/restaurant-payment';
import { ActionButton, ActionForm, SubmitButton } from '@/components/action-form';
import { Card, CardHeader, DescList, Field, LinkButton, PageHeader, StatusBadge, TableWrap } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { PAYMENT_METHODS, optionLabel } from '@/lib/constants';
import { all, get } from '@/lib/db';
import { can } from '@/lib/permissions';
import { diningTables } from '@/lib/restaurant';
import { inHouseBookings } from '@/lib/services/booking';
import { getSettings } from '@/lib/settings';
import type { MenuItem, OrderItem, RestaurantOrder } from '@/lib/types';
import { formatDateTime, formatMoney, labelize } from '@/lib/utils';

export const metadata: Metadata = { title: 'Order' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser('restaurant');
  const { id } = await params;
  const order = get<RestaurantOrder & { room_number: string | null; guest_name: string | null; created_by_name: string | null }>(
    `SELECT o.*, r.room_number, g.name AS guest_name, u.name AS created_by_name
       FROM restaurant_orders o
       LEFT JOIN bookings b ON b.id = o.booking_id
       LEFT JOIN rooms r ON r.id = b.room_id
       LEFT JOIN guests g ON g.id = b.guest_id
       LEFT JOIN users u ON u.id = o.created_by
      WHERE o.id = ?`,
    Number(id) || 0,
  );
  if (!order) notFound();
  const items = all<OrderItem>('SELECT * FROM restaurant_order_items WHERE order_id = ? ORDER BY id', order.id);
  const cur = getSettings().currency_symbol;
  const money = (n: number) => formatMoney(n, cur);
  const isOpen = order.status !== 'completed' && order.status !== 'cancelled';
  const menu = isOpen ? all<MenuItem>('SELECT * FROM menu_items WHERE is_available = 1 ORDER BY category, name') : [];
  const rooms = isOpen ? inHouseBookings() : [];

  return (
    <>
      <PageHeader
        back={{ href: '/restaurant', label: 'Restaurant' }}
        title={
          <span className="flex items-center gap-3">
            {order.order_no} <StatusBadge status={order.status} />
          </span>
        }
        description={`${labelize(order.order_type)} · ${order.room_number ? `Room ${order.room_number} (${order.guest_name})` : order.table_no ? `Table ${order.table_no}` : order.customer_name ?? 'Walk-in'}`}
        actions={
          <>
            {isOpen && order.status === 'pending' ? (
              <ActionButton action={updateOrderStatusAction} fields={{ id: order.id, status: 'preparing' }} size="md">
                <ChefHat className="size-4" /> Mark preparing
              </ActionButton>
            ) : null}
            {isOpen && order.status !== 'served' ? (
              <ActionButton action={updateOrderStatusAction} fields={{ id: order.id, status: 'served' }} size="md">
                <CircleCheck className="size-4" /> Mark served
              </ActionButton>
            ) : null}
            <LinkButton href={`/print/order/${order.id}?kot=1`} variant="secondary" target="_blank">
              <Printer className="size-4" /> KOT
            </LinkButton>
            <LinkButton href={`/print/order/${order.id}`} variant="secondary" target="_blank">
              <Printer className="size-4" /> Bill
            </LinkButton>
            {isOpen ? (
              <ActionButton action={cancelOrderAction} fields={{ id: order.id }} variant="danger-ghost" size="md" confirm="Cancel this order?">
                <XCircle className="size-4" /> Cancel
              </ActionButton>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Items" description={order.discount_percent ? `${order.discount_percent}% discount applied to item amounts before tax. ${order.discount_reason}` : undefined} />
          <TableWrap>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Tax</th>
                  <th className="text-right">Amount</th>
                  {isOpen ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      {it.name}
                      {it.notes ? <p className="text-xs text-amber-700">Note: {it.notes}</p> : null}
                    </td>
                    <td className="text-right">{it.quantity}</td>
                    <td className="whitespace-nowrap text-right">{money(it.unit_price)}</td>
                    <td className="text-right text-xs">{it.tax_rate}%</td>
                    <td className="whitespace-nowrap text-right font-medium">{money(it.amount)}</td>
                    {isOpen ? (
                      <td className="text-right">
                        <ActionButton action={removeOrderItemAction} fields={{ item_id: it.id }} variant="danger-ghost" size="xs" confirm={`Remove ${it.name}?`} title="Remove">
                          <Trash2 className="size-4" />
                        </ActionButton>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">No items</td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr><td colSpan={4} className="text-right">Subtotal</td><td className="text-right">{money(order.subtotal)}</td>{isOpen ? <td /> : null}</tr>
                <tr><td colSpan={4} className="text-right">Tax</td><td className="text-right">{money(order.tax_amount)}</td>{isOpen ? <td /> : null}</tr>
                <tr><td colSpan={4} className="text-right text-base">Total</td><td className="text-right text-base">{money(order.total)}</td>{isOpen ? <td /> : null}</tr>
              </tfoot>
            </table>
          </TableWrap>
          {isOpen && menu.length ? (
            <ActionForm action={addOrderItemAction} resetOnSuccess className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-6">
              <input type="hidden" name="order_id" value={order.id} />
              <select name="menu_item_id" className="input sm:col-span-3" required defaultValue="">
                <option value="">Add item…</option>
                {menu.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} — {money(m.price)}</option>
                ))}
              </select>
              <input type="number" name="quantity" className="input" min={1} max={999} defaultValue={1} />
              <input name="notes" className="input" placeholder="Note" maxLength={200} />
              <SubmitButton variant="secondary"><Plus className="size-4" /> Add</SubmitButton>
            </ActionForm>
          ) : null}
        </Card>

        <div className="space-y-6">
          {isOpen && can(user.role, 'billing_admin') && <Card className="p-5"><h2 className="mb-3 font-semibold">Manager discount</h2><ActionForm action={discountOrderAction} className="space-y-3"><input type="hidden" name="id" value={order.id} /><Field label="Discount (%)"><input className="input" name="discount_percent" type="number" min={0} max={100} step="0.01" required defaultValue={order.discount_percent} /></Field><Field label="Reason"><input className="input" name="discount_reason" required maxLength={200} defaultValue={order.discount_reason ?? ''} placeholder="Reason for approval" /></Field><p className="text-xs text-slate-500">Applied to every item before tax. Enter 0 to remove the discount.</p><SubmitButton variant="secondary">Apply discount</SubmitButton></ActionForm></Card>}

          {isOpen && order.order_type === 'dine_in' && <Card className="p-5"><h2 className="mb-3 font-semibold">Transfer table</h2><ActionForm action={transferTableAction} className="space-y-3" confirm="Move this order to the selected table?"><input type="hidden" name="id" value={order.id} /><Field label="Destination table"><select className="input" name="table_no" required defaultValue=""><option value="">Choose a free table</option>{diningTables().filter(t => !t.order_id && t.status === 'available').map(t => <option key={t.id} value={t.table_no}>{t.table_no} · {t.area} · {t.seats} seats</option>)}</select></Field><SubmitButton variant="secondary">Move order</SubmitButton></ActionForm></Card>}

          {isOpen && items.length ? (
            <Card>
              <CardHeader title="Settle bill" description={`Amount: ${money(order.total)}`} />
              <div className="space-y-5 p-5">
                <ActionForm action={settleOrderAction} className="space-y-3" confirm={`Charge ${money(order.total)} to the room folio?`}>
                  <input type="hidden" name="id" value={order.id} />
                  <input type="hidden" name="settlement" value="room" />
                  <Field label="Charge to room">
                    <select name="booking_id" className="input" defaultValue={order.booking_id ?? ''} required>
                      <option value="">{rooms.length ? 'Select room' : 'No guests in-house'}</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>Room {r.room_number} · {r.guest_name}</option>
                      ))}
                    </select>
                  </Field>
                  <SubmitButton className="w-full" variant="secondary"><BedDouble className="size-4" /> Post to room folio</SubmitButton>
                </ActionForm>
                <div className="relative text-center text-xs text-slate-400">
                  <span className="relative z-10 bg-white px-2">OR</span>
                  <span className="absolute inset-x-0 top-1/2 border-t border-slate-200" />
                </div>
                <RestaurantPayment id={order.id} total={order.total} currency={cur} />
              </div>
            </Card>
          ) : null}
          <Card className="p-5">
            <DescList
              columns={1}
              items={[
                ['Order type', labelize(order.order_type)],
                ['Room', order.room_number ? <Link href={`/bookings/${order.booking_id}`} className="link">Room {order.room_number} · {order.guest_name}</Link> : '—'],
                ['Table', order.table_no],
                ['Customer', order.customer_name],
                ['Notes', order.notes],
                ['Created', `${formatDateTime(order.created_at)}${order.created_by_name ? ` by ${order.created_by_name}` : ''}`],
                ['Completed', formatDateTime(order.completed_at)],
                ['Settlement', order.settlement === 'room' ? 'Charged to room folio' : order.settlement === 'paid' ? `Paid — ${optionLabel(PAYMENT_METHODS, order.payment_method)}` : '—'],
              ]}
            />
          </Card>
        </div>
      </div>
    </>
  );
}

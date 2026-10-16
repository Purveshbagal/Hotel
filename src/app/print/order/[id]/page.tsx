import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ThermalReceipt } from '@/components/thermal-receipt';
import { requireUser } from '@/lib/auth';
import { PAYMENT_METHODS, optionLabel } from '@/lib/constants';
import { all, get } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import type { OrderItem, RestaurantOrder } from '@/lib/types';
import { formatDateTime, formatMoney, labelize, round2 } from '@/lib/utils';

export const metadata: Metadata = { title: 'Order' };

export default async function OrderPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kot?: string; batch?: string }> }) {
  await requireUser('restaurant');
  const { id } = await params;
  const { kot, batch } = await searchParams;
  const order = get<RestaurantOrder & { cash_received: number | null; room_number: string | null; guest_name: string | null }>(
    `SELECT o.*, r.room_number, g.name AS guest_name FROM restaurant_orders o
       LEFT JOIN bookings b ON b.id = o.booking_id LEFT JOIN rooms r ON r.id = b.room_id LEFT JOIN guests g ON g.id = b.guest_id
      WHERE o.id = ?`,
    Number(id) || 0,
  );
  if (!order) notFound();
  const items = all<OrderItem>('SELECT * FROM restaurant_order_items WHERE order_id = ? ORDER BY id', order.id);
  const payments = all<{ method: string; amount: number }>('SELECT method, amount FROM restaurant_payments WHERE order_id = ? ORDER BY id', order.id);
  const cashPaid = payments.filter(p => p.method === 'cash').reduce((sum, p) => sum + p.amount, 0);
  const s = getSettings();
  const money = (n: number) => formatMoney(n, s.currency_symbol);
  const isKot = kot === '1';
  const batches = [...new Set(items.map(it => it.kot_batch))];
  const selectedBatch = batch === 'all' ? null : batches.includes(Number(batch)) ? Number(batch) : Math.max(1, ...batches);
  const kitchenItems = selectedBatch === null ? items : items.filter(it => it.kot_batch === selectedBatch);
  const where = order.room_number ? `Room ${order.room_number}` : order.table_no ? `Table ${order.table_no}` : order.customer_name ?? 'Takeaway';

  return (
    <ThermalReceipt>
        {isKot && <form method="get" className="no-print mb-4 border-b pb-3"><input type="hidden" name="kot" value="1" /><label className="label">Kitchen round<select name="batch" className="input" defaultValue={selectedBatch ?? 'all'}>{batches.map(b => <option key={b} value={b}>Round {b}</option>)}<option value="all">All rounds (reprint)</option></select></label><button className="mt-2 rounded border px-3 py-1">Show ticket</button><p className="mt-2 text-xs">Latest round shown by default. Print each new round once.</p></form>}
        {isKot ? (
          <>
            <p className="text-center text-base font-bold">KITCHEN ORDER TICKET</p>
            <p className="text-center">{order.order_no}</p>
            <p className="text-center font-bold">{selectedBatch === null ? 'ALL ROUNDS — REPRINT' : `ROUND ${selectedBatch}`}</p>
            <div className="my-2 border-t border-dashed border-black" />
            <p>{labelize(order.order_type)} · <strong>{where}</strong></p>
            <p>{formatDateTime(order.created_at)}</p>
            <div className="my-2 border-t border-dashed border-black" />
            {kitchenItems.map((it) => (
              <div key={it.id} className="py-0.5">
                <p className="text-sm font-bold">{it.quantity} × {it.name}</p>
                {it.notes ? <p className="pl-4">→ {it.notes}</p> : null}
              </div>
            ))}
            {order.notes ? (
              <>
                <div className="my-2 border-t border-dashed border-black" />
                <p>Note: {order.notes}</p>
              </>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-center text-base font-bold">{s.hotel_name}</p>
            {s.hotel_address ? <p className="text-center">{s.hotel_address}</p> : null}
            {s.hotel_phone ? <p className="text-center">Ph: {s.hotel_phone}</p> : null}
            {s.hotel_gstin ? <p className="text-center">GSTIN: {s.hotel_gstin}</p> : null}
            <div className="my-2 border-t border-dashed border-black" />
            <p className="text-center font-bold">{order.status === 'cancelled' ? 'CANCELLED ORDER' : order.settlement ? 'RESTAURANT BILL' : 'PROVISIONAL BILL'}</p>
            <p>Bill: {order.order_no}</p>
            <p>{formatDateTime(order.created_at)}</p>
            <p>{labelize(order.order_type)} · {where}{order.guest_name ? ` (${order.guest_name})` : ''}</p>
            <div className="my-2 border-t border-dashed border-black" />
            <table className="w-full table-fixed">
              <colgroup><col style={{ width: '58%' }} /><col style={{ width: '12%' }} /><col style={{ width: '30%' }} /></colgroup>
              <thead>
                <tr>
                  <th className="text-left">Item</th>
                  <th className="whitespace-nowrap text-right">Qty</th>
                  <th className="text-right">Amt</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="pr-2">{it.name}<span className="block text-[9px]">@ {money(it.unit_price)} · Tax {it.tax_rate}%</span></td>
                    <td className="text-right">{it.quantity}</td>
                    <td className="whitespace-nowrap text-right">{money(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="my-2 border-t border-dashed border-black" />
            {order.discount_percent > 0 && <><div className="flex justify-between"><span>Items total</span><span>{money(items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0))}</span></div><div className="flex justify-between"><span>Discount ({order.discount_percent}%)</span><span>-{money(round2(items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0) - order.subtotal))}</span></div></>}
            <div className="flex justify-between"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
            {order.tax_amount > 0 ? (
              s.split_tax === '1' ? (
                <>
                  <div className="flex justify-between"><span>CGST</span><span>{money(round2(order.tax_amount / 2))}</span></div>
                  <div className="flex justify-between"><span>SGST</span><span>{money(round2(order.tax_amount - round2(order.tax_amount / 2)))}</span></div>
                </>
              ) : (
                <div className="flex justify-between"><span>{s.tax_label}</span><span>{money(order.tax_amount)}</span></div>
              )
            ) : null}
            <div className="mt-1 flex justify-between border-t border-black pt-1 text-sm font-bold"><span>TOTAL</span><span>{money(order.total)}</span></div>
            <div className="my-2 border-t border-dashed border-black" />
            <p className="text-center">
              {order.settlement === 'room' ? 'Charged to room folio' : order.settlement === 'paid' ? `Paid by ${optionLabel(PAYMENT_METHODS, order.payment_method)}` : 'Payment pending'}
            </p>
            {payments.map((payment, i) => <div key={i} className="flex justify-between"><span>{optionLabel(PAYMENT_METHODS, payment.method)}</span><span>{money(payment.amount)}</span></div>)}
            {order.cash_received != null && <><div className="flex justify-between"><span>Cash tendered</span><span>{money(order.cash_received)}</span></div><div className="flex justify-between"><span>Change returned</span><span>{money(round2(Math.max(0, order.cash_received - cashPaid)))}</span></div></>}
            <p className="mt-2 text-center">Thank you! Visit again.</p>
          </>
        )}
    </ThermalReceipt>
  );
}

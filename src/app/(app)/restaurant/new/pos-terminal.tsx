'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import type { FormAction } from '@/lib/action-types';
import type { MenuItem } from '@/lib/types';
import { cn, formatMoney, round2 } from '@/lib/utils';

type Line = { item: MenuItem; quantity: number; notes: string };

export function PosTerminal({
  action,
  menu,
  rooms,
  currency,
  tables,
  initialTable,
}: {
  action: FormAction;
  menu: MenuItem[];
  rooms: { id: number; booking_no: string; room_number: string; guest_name: string }[];
  currency: string;
  tables: { table_no: string; seats: number; area: string; status: string; reservation_name: string | null }[];
  initialTable?: string;
}) {
  const [category, setCategory] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Line[]>([]);
  const [orderType, setOrderType] = useState<'dine_in' | 'room_service' | 'takeaway'>('dine_in');

  const categories = useMemo(() => ['All', ...Array.from(new Set(menu.map((m) => m.category)))], [menu]);
  const visible = menu.filter(
    (m) => (category === 'All' || m.category === category) && (!search || m.name.toLowerCase().includes(search.toLowerCase())),
  );

  const add = (item: MenuItem) =>
    setCart((c) => {
      const existing = c.find((l) => l.item.id === item.id);
      if (existing) return c.map((l) => (l.item.id === item.id ? { ...l, quantity: Math.min(999, l.quantity + 1) } : l));
      return [...c, { item, quantity: 1, notes: '' }];
    });
  const setQty = (id: number, q: number) =>
    setCart((c) => (q <= 0 ? c.filter((l) => l.item.id !== id) : c.map((l) => (l.item.id === id ? { ...l, quantity: Math.min(q, 999) } : l))));

  const subtotal = round2(cart.reduce((s, l) => s + l.item.price * l.quantity, 0));
  const tax = round2(cart.reduce((s, l) => s + round2((l.item.price * l.quantity * l.item.tax_rate) / 100), 0));
  const total = round2(subtotal + tax);
  const payload = JSON.stringify(cart.map((l) => ({ menu_item_id: l.item.id, quantity: l.quantity, notes: l.notes || undefined })));

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <div className="card p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search menu…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  'rounded-full px-3 py-1 text-sm font-medium',
                  category === c ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {visible.map((m) => {
            const inCart = cart.find((l) => l.item.id === m.id)?.quantity;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => add(m)}
                className={cn(
                  'card relative min-h-32 p-4 text-left transition hover:border-indigo-300 hover:shadow-md',
                  inCart ? 'border-indigo-400 ring-1 ring-indigo-400' : '',
                )}
              >
                <span className={cn('absolute right-2 top-2 size-3 rounded-sm border-2', m.is_veg ? 'border-emerald-600' : 'border-rose-600')}>
                  <span className={cn('m-auto block size-1 rounded-full', m.is_veg ? 'bg-emerald-600' : 'bg-rose-600')} />
                </span>
                <p className="pr-4 text-sm font-medium leading-snug">{m.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{m.category}</p>
                <p className="mt-2 font-semibold text-indigo-700">{formatMoney(m.price, currency)}</p>
                {inCart ? <span className="absolute bottom-2 right-2 rounded-full bg-indigo-600 px-2 text-xs font-bold text-white">{inCart}</span> : null}
              </button>
            );
          })}
          {visible.length === 0 ? <p className="col-span-full py-8 text-center text-sm text-slate-500">No items match.</p> : null}
        </div>
      </div>

      <div className="lg:col-span-2">
        <ActionForm action={action} className="card sticky top-6 flex flex-col">
          <input type="hidden" name="items" value={payload} />
          <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5">
            <ShoppingCart className="size-5 text-slate-500" />
            <h2 className="font-semibold">Order</h2>
          </div>
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
              {(['room_service', 'dine_in', 'takeaway'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOrderType(t)}
                  className={cn('rounded-md px-2 py-1.5 font-medium', orderType === t ? 'bg-white shadow-sm' : 'text-slate-500')}
                >
                  {t === 'room_service' ? 'Room service' : t === 'dine_in' ? 'Dine-in' : 'Takeaway'}
                </button>
              ))}
            </div>
            <input type="hidden" name="order_type" value={orderType} />
            {orderType === 'dine_in' && tables.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No free tables. <Link className="underline" href="/restaurant/tables">Open the dining floor</Link> to configure tables or manage existing orders.</p>}
            {orderType === 'room_service' ? (
              <label className="block">
                <span className="label">Room / guest</span>
                <select name="booking_id" className="input" required defaultValue="">
                  <option value="">{rooms.length ? 'Select in-house room' : 'No guests in-house'}</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>Room {r.room_number} · {r.guest_name}</option>
                  ))}
                </select>
              </label>
            ) : orderType === 'dine_in' ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">Table no.</span>
                  <select name="table_no" className="input" required defaultValue={initialTable ?? ''}><option value="">Select table</option>{tables.map(t => <option key={t.table_no} value={t.table_no}>{t.table_no} · {t.seats} seats · {t.area}{t.status === 'reserved' ? ` (Reserved: ${t.reservation_name})` : ''}</option>)}</select>
                </label>
                <label className="block">
                  <span className="label">Charge to room</span>
                  <select name="booking_id" className="input" defaultValue="">
                    <option value="">— No —</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>Room {r.room_number}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <label className="block">
                <span className="label">Customer name</span>
                <input name="customer_name" className="input" maxLength={100} />
              </label>
            )}

            <div className="max-h-[40vh] space-y-2 overflow-y-auto">
              {cart.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">Tap menu items to add them.</p>
              ) : (
                cart.map((l) => (
                  <div key={l.item.id} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{l.item.name}</p>
                        <p className="text-xs text-slate-500">{formatMoney(l.item.price, currency)} each</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setQty(l.item.id, l.quantity - 1)} className="rounded-md border border-slate-200 p-1 hover:bg-slate-50" aria-label="Decrease">
                          {l.quantity === 1 ? <Trash2 className="size-3.5 text-rose-500" /> : <Minus className="size-3.5" />}
                        </button>
                        <span className="w-7 text-center text-sm font-semibold">{l.quantity}</span>
                        <button type="button" onClick={() => setQty(l.item.id, Math.min(999, l.quantity + 1))} className="rounded-md border border-slate-200 p-1 hover:bg-slate-50" aria-label="Increase">
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <p className="w-20 text-right text-sm font-semibold">{formatMoney(l.item.price * l.quantity, currency)}</p>
                    </div>
                    <input
                      value={l.notes}
                      onChange={(e) => setCart((c) => c.map((x) => (x.item.id === l.item.id ? { ...x, notes: e.target.value.slice(0, 200) } : x)))}
                      placeholder="Note for kitchen (optional)"
                      className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  </div>
                ))
              )}
            </div>

            <label className="block">
              <span className="label">Order notes</span>
              <input name="notes" className="input" maxLength={500} />
            </label>

            <dl className="space-y-1 border-t border-slate-200 pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{formatMoney(subtotal, currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Tax</dt><dd>{formatMoney(tax, currency)}</dd></div>
              <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd>{formatMoney(total, currency)}</dd></div>
            </dl>
            <SubmitButton size="lg" className="w-full" disabled={cart.length === 0 || (orderType === 'dine_in' && tables.length === 0) || (orderType === 'room_service' && rooms.length === 0)}>
              Place order (send to kitchen)
            </SubmitButton>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { DonutChart, OccupancyChart, RevenueChart } from '@/components/charts';
import { Card, CardHeader, EmptyState, PageHeader, StatCard, TableWrap } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { BOOKING_SOURCES, EXPENSE_CATEGORIES, PAYMENT_METHODS, optionLabel } from '@/lib/constants';
import { getSettings } from '@/lib/settings';
import {
  bookingsBySource, collectionsByMethod, dailyCollections, expensesByCategory, invoiceSummary, occupancySeries, restaurantSales, topMenuItems,
} from '@/lib/services/reports';
import { addDays, diffDays, formatDate, formatMoney, formatPercent, formatShortDate, isDateStr, labelize, monthStart, round2, todayStr } from '@/lib/utils';

export const metadata: Metadata = { title: 'Reports' };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireUser('reports');
  const sp = await searchParams;
  const today = todayStr();
  let from = isDateStr(sp.from) ? sp.from : monthStart(today);
  let to = isDateStr(sp.to) ? sp.to : today;
  if (to < from) [from, to] = [to, from];
  if (diffDays(from, to) > 366) from = addDays(to, -366);

  const settings = getSettings();
  const cur = settings.currency_symbol;
  const money = (n: number) => formatMoney(n, cur);

  const methods = collectionsByMethod(from, to);
  const totalCollections = round2(methods.reduce((s, m) => s + m.total, 0));
  const inv = invoiceSummary(from, to);
  const occ = occupancySeries(from, to);
  const daily = dailyCollections(from, to);
  const sources = bookingsBySource(from, to);
  const expenses = expensesByCategory(from, to);
  const totalExpenses = round2(expenses.reduce((s, e) => s + e.amount, 0));
  const fnb = restaurantSales(from, to);
  const topItems = topMenuItems(from, to);

  const roomNights = occ.reduce((s, d) => s + d.occupied, 0);
  const roomRevenue = round2(occ.reduce((s, d) => s + d.revenue, 0));
  const available = occ.reduce((s, d) => s + d.totalRooms, 0);
  const avgOcc = available ? (roomNights / available) * 100 : 0;
  const adr = roomNights ? roomRevenue / roomNights : 0;
  const revpar = available ? roomRevenue / available : 0;

  const lastMonthEnd = addDays(monthStart(today), -1);
  const ranges = [
    { label: 'Today', from: today, to: today },
    { label: 'Last 7 days', from: addDays(today, -6), to: today },
    { label: 'This month', from: monthStart(today), to: today },
    { label: 'Last month', from: monthStart(lastMonthEnd), to: lastMonthEnd },
    { label: 'This year', from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
  const exportLink = (type: string) => `/api/export/${type}?from=${from}&to=${to}`;

  return (
    <>
      <PageHeader title="Reports" description={`${formatDate(from)} – ${formatDate(to)}`} />

      <div className="card mb-6 p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="label">From</span>
            <input type="date" name="from" defaultValue={from} className="input" />
          </label>
          <label className="block">
            <span className="label">To</span>
            <input type="date" name="to" defaultValue={to} className="input" />
          </label>
          <button className="input w-auto cursor-pointer bg-indigo-600 font-medium text-white hover:bg-indigo-700">Apply</button>
          <div className="flex flex-wrap gap-2">
            {ranges.map((r) => (
              <Link key={r.label} href={`/reports?from=${r.from}&to=${r.to}`} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200">
                {r.label}
              </Link>
            ))}
          </div>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total collections" value={money(totalCollections)} tone="green" hint="Room payments + restaurant cash sales" />
        <StatCard label="Expenses" value={money(totalExpenses)} tone="red" />
        <StatCard label="Net cash flow" value={money(totalCollections - totalExpenses)} tone={totalCollections - totalExpenses >= 0 ? 'indigo' : 'red'} />
        <StatCard label="Invoiced (GST)" value={money(inv.total)} tone="purple" hint={`${inv.count} invoice(s) · tax ${money(inv.tax)}`} />
        <StatCard label="Average occupancy" value={formatPercent(avgOcc)} tone="green" hint={`${roomNights} room-nights sold`} />
        <StatCard label="ADR" value={money(adr)} tone="blue" hint="Average daily rate" />
        <StatCard label="RevPAR" value={money(revpar)} tone="orange" hint="Revenue per available room" />
        <StatCard label="Room revenue (accrued)" value={money(roomRevenue)} tone="indigo" hint="Before discounts and tax" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Daily collections vs expenses" />
          <div className="p-4">
            <RevenueChart currency={cur} data={daily.map((d) => ({ label: formatShortDate(d.date), revenue: d.collections, expenses: d.expenses }))} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Daily occupancy" />
          <div className="p-4">
            <OccupancyChart data={occ.map((d) => ({ label: formatShortDate(d.date), occupancy: Math.round(d.occupancy * 10) / 10 }))} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Collections by payment method" />
          {methods.length === 0 ? (
            <EmptyState title="No collections in this period" />
          ) : (
            <TableWrap>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th className="text-right">Rooms</th>
                    <th className="text-right">Restaurant</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {methods.map((m) => (
                    <tr key={m.method}>
                      <td>{optionLabel(PAYMENT_METHODS, m.method)}</td>
                      <td className="text-right">{money(m.rooms)}</td>
                      <td className="text-right">{money(m.restaurant)}</td>
                      <td className="text-right font-semibold">{money(m.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="text-right">{money(methods.reduce((s, m) => s + m.rooms, 0))}</td>
                    <td className="text-right">{money(methods.reduce((s, m) => s + m.restaurant, 0))}</td>
                    <td className="text-right">{money(totalCollections)}</td>
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title={`${settings.tax_label} / Invoice summary`} actions={<a href={exportLink('invoices')} className="link text-sm">Export GST report</a>} />
          <div className="p-5">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-slate-500">Invoices issued</dt><dd className="text-right font-medium">{inv.count}</dd>
              <dt className="text-slate-500">Room charges</dt><dd className="text-right">{money(inv.room)}</dd>
              <dt className="text-slate-500">Other charges</dt><dd className="text-right">{money(inv.other)}</dd>
              <dt className="text-slate-500">Discounts</dt><dd className="text-right">-{money(inv.discount)}</dd>
              <dt className="text-slate-500">Taxable value</dt><dd className="text-right">{money(inv.taxable)}</dd>
              {settings.split_tax === '1' ? (
                <>
                  <dt className="text-slate-500">CGST</dt><dd className="text-right">{money(inv.tax / 2)}</dd>
                  <dt className="text-slate-500">SGST</dt><dd className="text-right">{money(inv.tax / 2)}</dd>
                </>
              ) : (
                <>
                  <dt className="text-slate-500">{settings.tax_label}</dt><dd className="text-right">{money(inv.tax)}</dd>
                </>
              )}
              <dt className="border-t border-slate-200 pt-2 font-semibold">Invoice total</dt>
              <dd className="border-t border-slate-200 pt-2 text-right font-semibold">{money(inv.total)}</dd>
            </dl>
          </div>
        </Card>

        <Card>
          <CardHeader title="Bookings by source" description="By booking creation date" />
          {sources.length === 0 ? (
            <EmptyState title="No bookings created in this period" />
          ) : (
            <TableWrap>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th className="text-right">Bookings</th>
                    <th className="text-right">Room-nights</th>
                    <th className="text-right">Cancelled / No-show</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.source}>
                      <td>{optionLabel(BOOKING_SOURCES, s.source)}</td>
                      <td className="text-right">{s.bookings}</td>
                      <td className="text-right">{Math.round(s.nights)}</td>
                      <td className="text-right">{s.cancelled}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title="Expenses by category" />
          <div className="p-4">
            <DonutChart currency={cur} data={expenses.map((e) => ({ name: optionLabel(EXPENSE_CATEGORIES, e.category), value: Math.round(e.amount) }))} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Restaurant sales" />
          {fnb.length === 0 ? (
            <EmptyState title="No restaurant sales" />
          ) : (
            <TableWrap>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Order type</th>
                    <th className="text-right">Orders</th>
                    <th className="text-right">Net</th>
                    <th className="text-right">Tax</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {fnb.map((f) => (
                    <tr key={f.order_type}>
                      <td>{labelize(f.order_type)}</td>
                      <td className="text-right">{f.orders}</td>
                      <td className="text-right">{money(f.subtotal)}</td>
                      <td className="text-right">{money(f.tax)}</td>
                      <td className="text-right font-semibold">{money(f.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title="Top-selling menu items" />
          {topItems.length === 0 ? (
            <EmptyState title="No items sold" />
          ) : (
            <TableWrap>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {topItems.map((t) => (
                    <tr key={t.name}>
                      <td>{t.name}</td>
                      <td className="text-right">{t.qty}</td>
                      <td className="text-right">{money(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Export data (CSV / Excel)" description="Exports use the selected date range." />
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['bookings', 'Bookings'],
            ['payments', 'Payments & refunds'],
            ['invoices', 'GST invoice register'],
            ['guest-register', 'Guest register (police record)'],
            ['expenses', 'Expenses'],
            ['restaurant', 'Restaurant orders'],
            ['occupancy', 'Daily occupancy'],
            ['guests', 'All guests'],
          ].map(([type, label]) => (
            <a key={type} href={exportLink(type)} className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium hover:border-indigo-300 hover:bg-indigo-50/50">
              <Download className="size-4 text-indigo-600" /> {label}
            </a>
          ))}
        </div>
      </Card>
    </>
  );
}

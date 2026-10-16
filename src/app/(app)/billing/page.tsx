import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { Card, EmptyState, LinkButton, PageHeader, StatCard, StatusBadge, TableWrap, Tabs } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { PAYMENT_METHODS, optionLabel } from '@/lib/constants';
import { all } from '@/lib/db';
import { can } from '@/lib/permissions';
import { getSettings } from '@/lib/settings';
import { formatDate, formatMoney, isDateStr, monthStart, round2, todayStr } from '@/lib/utils';

export const metadata: Metadata = { title: 'Billing & Payments' };

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser('billing');
  const sp = await searchParams;
  const tab = sp.tab === 'invoices' || sp.tab === 'outstanding' ? sp.tab : 'payments';
  const today = todayStr();
  const from = isDateStr(sp.from) ? sp.from : monthStart(today);
  const to = isDateStr(sp.to) ? sp.to : today;
  const method = sp.method ?? '';
  const cur = getSettings().currency_symbol;
  const money = (n: number) => formatMoney(n, cur);
  const qs = (t: string) => `/billing?tab=${t}&from=${from}&to=${to}`;

  const payments =
    tab === 'payments'
      ? all<{ id: number; receipt_no: string; payment_date: string; type: string; method: string; amount: number; reference: string | null; booking_id: number | null; booking_no: string | null; guest_name: string | null; received_by_name: string | null }>(
          `SELECT p.*, b.booking_no, g.name AS guest_name, u.name AS received_by_name
             FROM payments p
             LEFT JOIN bookings b ON b.id = p.booking_id
             LEFT JOIN guests g ON g.id = b.guest_id
             LEFT JOIN users u ON u.id = p.received_by
            WHERE p.payment_date BETWEEN ? AND ? ${method ? 'AND p.method = ?' : ''}
            ORDER BY p.payment_date DESC, p.id DESC`,
          ...(method ? [from, to, method] : [from, to]),
        )
      : [];
  const methodTotals = new Map<string, number>();
  for (const p of payments) methodTotals.set(p.method, round2((methodTotals.get(p.method) ?? 0) + (p.type === 'refund' ? -p.amount : p.amount)));
  const received = round2(payments.filter((p) => p.type === 'payment').reduce((s, p) => s + p.amount, 0));
  const refunded = round2(payments.filter((p) => p.type === 'refund').reduce((s, p) => s + p.amount, 0));

  const invoiceSql = `
    SELECT i.*, b.booking_no, g.name AS guest_name, g.company_name, r.room_number,
           (SELECT COALESCE(SUM(CASE WHEN p.type = 'payment' THEN p.amount ELSE -p.amount END), 0) FROM payments p WHERE p.booking_id = i.booking_id) AS live_paid
      FROM invoices i JOIN bookings b ON b.id = i.booking_id JOIN guests g ON g.id = b.guest_id JOIN rooms r ON r.id = b.room_id`;
  type InvoiceRow = { id: number; invoice_no: string; invoice_date: string; booking_id: number; booking_no: string; guest_name: string; company_name: string | null; room_number: string; taxable_amount: number; tax_amount: number; total: number; live_paid: number };
  const invoices =
    tab === 'invoices'
      ? all<InvoiceRow>(`${invoiceSql} WHERE i.invoice_date BETWEEN ? AND ? ORDER BY i.invoice_date DESC, i.id DESC`, from, to)
      : tab === 'outstanding'
        ? all<InvoiceRow>(`${invoiceSql} ORDER BY i.invoice_date`).filter((i) => i.total - i.live_paid > 0.009)
        : [];

  return (
    <>
      <PageHeader
        title="Billing & Payments"
        description="Collections, refunds, GST invoices and outstanding balances."
        actions={
          can(user.role, 'reports') ? (
            <LinkButton href={`/api/export/${tab === 'payments' ? 'payments' : 'invoices'}?from=${from}&to=${to}`} variant="secondary">
              <Download className="size-4" /> Export CSV
            </LinkButton>
          ) : null
        }
      />
      <Tabs
        active={tab}
        tabs={[
          { key: 'payments', label: 'Payments', href: qs('payments') },
          { key: 'invoices', label: 'Invoices', href: qs('invoices') },
          { key: 'outstanding', label: 'Outstanding', href: qs('outstanding') },
        ]}
      />

      {tab !== 'outstanding' ? (
        <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="tab" value={tab} />
          <label className="block">
            <span className="label">From</span>
            <input type="date" name="from" defaultValue={from} className="input" />
          </label>
          <label className="block">
            <span className="label">To</span>
            <input type="date" name="to" defaultValue={to} className="input" />
          </label>
          {tab === 'payments' ? (
            <label className="block">
              <span className="label">Method</span>
              <select name="method" defaultValue={method} className="input">
                <option value="">All methods</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          <button className="input w-auto cursor-pointer bg-indigo-600 font-medium text-white hover:bg-indigo-700">Apply</button>
        </form>
      ) : null}

      {tab === 'payments' ? (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <StatCard label="Received" value={money(received)} tone="green" />
            <StatCard label="Refunded" value={money(refunded)} tone="red" />
            <StatCard label="Net collection" value={money(received - refunded)} tone="indigo" hint={[...methodTotals.entries()].map(([m, v]) => `${optionLabel(PAYMENT_METHODS, m)}: ${money(v)}`).join(' · ')} />
          </div>
          <Card>
            {payments.length === 0 ? (
              <EmptyState title="No payments in this period" />
            ) : (
              <TableWrap>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Date</th>
                      <th>Guest / Booking</th>
                      <th>Type</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th>Received by</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td><Link href={`/print/receipt/${p.id}`} target="_blank" prefetch={false} className="link">{p.receipt_no}</Link></td>
                        <td className="whitespace-nowrap">{formatDate(p.payment_date)}</td>
                        <td>
                          {p.guest_name ?? '—'}
                          {p.booking_id ? (
                            <p className="text-xs"><Link href={`/bookings/${p.booking_id}`} className="link">{p.booking_no}</Link></p>
                          ) : null}
                        </td>
                        <td><StatusBadge status={p.type} /></td>
                        <td>{optionLabel(PAYMENT_METHODS, p.method)}</td>
                        <td className="text-xs text-slate-600">{p.reference ?? '—'}</td>
                        <td className="text-xs text-slate-600">{p.received_by_name ?? '—'}</td>
                        <td className={`whitespace-nowrap text-right font-medium ${p.type === 'refund' ? 'text-rose-600' : ''}`}>
                          {p.type === 'refund' ? '-' : ''}{money(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>
        </>
      ) : (
        <Card>
          {invoices.length === 0 ? (
            <EmptyState title={tab === 'outstanding' ? 'No outstanding balances 🎉' : 'No invoices in this period'} />
          ) : (
            <TableWrap>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Guest</th>
                    <th>Booking</th>
                    <th className="text-right">Taxable</th>
                    <th className="text-right">Tax</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => {
                    const balance = round2(i.total - i.live_paid);
                    return (
                      <tr key={i.id}>
                        <td><Link href={`/print/invoice/${i.booking_id}`} target="_blank" prefetch={false} className="link">{i.invoice_no}</Link></td>
                        <td className="whitespace-nowrap">{formatDate(i.invoice_date)}</td>
                        <td>
                          {i.guest_name}
                          {i.company_name ? <p className="text-xs text-slate-500">{i.company_name}</p> : null}
                        </td>
                        <td>
                          <Link href={`/bookings/${i.booking_id}`} className="link">{i.booking_no}</Link>
                          <p className="text-xs text-slate-500">Room {i.room_number}</p>
                        </td>
                        <td className="whitespace-nowrap text-right">{money(i.taxable_amount)}</td>
                        <td className="whitespace-nowrap text-right">{money(i.tax_amount)}</td>
                        <td className="whitespace-nowrap text-right font-medium">{money(i.total)}</td>
                        <td className="whitespace-nowrap text-right">{money(i.live_paid)}</td>
                        <td className={`whitespace-nowrap text-right font-semibold ${balance > 0.009 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(balance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Total ({invoices.length})</td>
                    <td className="text-right">{money(invoices.reduce((s, i) => s + i.taxable_amount, 0))}</td>
                    <td className="text-right">{money(invoices.reduce((s, i) => s + i.tax_amount, 0))}</td>
                    <td className="text-right">{money(invoices.reduce((s, i) => s + i.total, 0))}</td>
                    <td className="text-right">{money(invoices.reduce((s, i) => s + i.live_paid, 0))}</td>
                    <td className="text-right">{money(invoices.reduce((s, i) => s + i.total - i.live_paid, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
          )}
        </Card>
      )}
    </>
  );
}

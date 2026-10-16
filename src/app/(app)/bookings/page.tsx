import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Card, EmptyState, LinkButton, PageHeader, Pagination, StatusBadge, TableWrap } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { BOOKING_STATUSES, BOOKING_SOURCES, optionLabel } from '@/lib/constants';
import { all, scalar } from '@/lib/db';
import { can } from '@/lib/permissions';
import { getSettings } from '@/lib/settings';
import { formatDate, formatMoney, labelize, nightsBetween } from '@/lib/utils';

export const metadata: Metadata = { title: 'Bookings' };

const PAGE_SIZE = 25;

type Row = {
  id: number;
  booking_no: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
  adults: number;
  children: number;
  rate_per_night: number;
  source: string;
  guest_name: string;
  guest_phone: string | null;
  room_number: string;
  room_type: string;
  created_at: string;
};

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser('bookings');
  const sp = await searchParams;
  const settings = getSettings();
  const q = sp.q?.trim() ?? '';
  const status = BOOKING_STATUSES.includes(sp.status as never) ? sp.status! : '';
  const from = sp.from ?? '';
  const to = sp.to ?? '';
  const page = Math.max(1, Number(sp.page) || 1);

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (q) {
    where.push('(b.booking_no LIKE ? OR g.name LIKE ? OR g.phone LIKE ? OR r.room_number LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status) {
    where.push('b.status = ?');
    params.push(status);
  }
  if (from) {
    where.push('b.check_out_date > ?');
    params.push(from);
  }
  if (to) {
    where.push('b.check_in_date <= ?');
    params.push(to);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const base = `FROM bookings b JOIN guests g ON g.id = b.guest_id JOIN rooms r ON r.id = b.room_id JOIN room_types rt ON rt.id = r.room_type_id ${whereSql}`;
  const total = scalar(`SELECT COUNT(*) ${base}`, ...params);
  const rows = all<Row>(
    `SELECT b.id, b.booking_no, b.check_in_date, b.check_out_date, b.status, b.adults, b.children, b.rate_per_night,
            b.source, b.created_at, g.name AS guest_name, g.phone AS guest_phone, r.room_number, rt.name AS room_type
       ${base}
      ORDER BY b.check_in_date DESC, b.id DESC
      LIMIT ? OFFSET ?`,
    ...params,
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE,
  );

  return (
    <>
      <PageHeader
        title="Bookings"
        description="All reservations — search, filter and manage stays."
        actions={
          can(user.role, 'frontdesk') ? (
            <LinkButton href="/bookings/new">
              <Plus className="size-4" /> New booking
            </LinkButton>
          ) : null
        }
      />
      <Card>
        <form method="get" className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <input name="q" defaultValue={q} placeholder="Booking #, guest, phone, room…" className="input lg:col-span-2" />
          <select name="status" defaultValue={status} className="input">
            <option value="">All statuses</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>{labelize(s)}</option>
            ))}
          </select>
          <input type="date" name="from" defaultValue={from} className="input" title="Staying on/after" />
          <input type="date" name="to" defaultValue={to} className="input" title="Arriving on/before" />
          <div className="flex gap-2">
            <button className="input cursor-pointer bg-indigo-600 font-medium text-white hover:bg-indigo-700">Filter</button>
            <Link href="/bookings" className="input text-center text-slate-600 hover:bg-slate-50">Clear</Link>
          </div>
        </form>
        {rows.length === 0 ? (
          <EmptyState title="No bookings found" description="Try changing the filters, or create a new booking." />
        ) : (
          <TableWrap>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Guest</th>
                  <th>Room</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th className="text-right">Nights</th>
                  <th className="text-right">Rate</th>
                  <th>Source</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/bookings/${b.id}`} className="link">{b.booking_no}</Link>
                    </td>
                    <td>
                      <p className="font-medium">{b.guest_name}</p>
                      <p className="text-xs text-slate-500">{b.guest_phone}</p>
                    </td>
                    <td>
                      <p className="font-medium">{b.room_number}</p>
                      <p className="text-xs text-slate-500">{b.room_type}</p>
                    </td>
                    <td className="whitespace-nowrap">{formatDate(b.check_in_date)}</td>
                    <td className="whitespace-nowrap">{formatDate(b.check_out_date)}</td>
                    <td className="text-right">{nightsBetween(b.check_in_date, b.check_out_date)}</td>
                    <td className="whitespace-nowrap text-right">{formatMoney(b.rate_per_night, settings.currency_symbol)}</td>
                    <td className="text-xs text-slate-600">{optionLabel(BOOKING_SOURCES, b.source)}</td>
                    <td><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/bookings" params={{ q, status, from, to }} />
      </Card>
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BedDouble, CalendarCheck, CalendarX, DoorOpen, IndianRupee, Percent, Plus, Sparkles, TrendingUp, UserPlus, Users, UtensilsCrossed, Wrench,
} from 'lucide-react';
import { OccupancyChart, RevenueChart } from '@/components/charts';
import { Card, CardHeader, EmptyState, LinkButton, PageHeader, StatCard, StatusBadge, TableWrap } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { all, scalar } from '@/lib/db';
import { can } from '@/lib/permissions';
import { getSettings } from '@/lib/settings';
import { addDays, cn, formatDate, formatMoney, formatPercent, formatShortDate, monthStart, todayStr } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard' };

function collections(from: string, to: string): number {
  return (
    scalar(
      `SELECT COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE -amount END), 0) FROM payments
        WHERE payment_date BETWEEN ? AND ?`,
      from, to,
    ) +
    scalar(
      `SELECT COALESCE(SUM(total), 0) FROM restaurant_orders
        WHERE status = 'completed' AND settlement = 'paid' AND date(completed_at) BETWEEN ? AND ?`,
      from, to,
    )
  );
}

export default async function DashboardPage() {
  const user = await requireUser('dashboard');
  const settings = getSettings();
  const cur = settings.currency_symbol;
  const today = todayStr();

  const totalRooms = scalar('SELECT COUNT(*) FROM rooms WHERE is_active = 1');
  const roomStats = all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM rooms WHERE is_active = 1 GROUP BY status');
  const byStatus = Object.fromEntries(roomStats.map((r) => [r.status, r.n])) as Record<string, number>;
  const occupied = byStatus.occupied ?? 0;
  const blocked = (byStatus.maintenance ?? 0) + (byStatus.out_of_order ?? 0);
  const available = byStatus.available ?? 0;
  const dirty = scalar(`SELECT COUNT(*) FROM rooms WHERE is_active = 1 AND housekeeping_status = 'dirty'`);
  const sellable = Math.max(totalRooms - blocked, 0);
  const occupancy = sellable ? (occupied / sellable) * 100 : 0;

  const arrivals = scalar(`SELECT COUNT(*) FROM bookings WHERE status = 'confirmed' AND check_in_date = ?`, today);
  const departures = scalar(`SELECT COUNT(*) FROM bookings WHERE status = 'checked_in' AND check_out_date <= ?`, today);
  const inHouseGuests = scalar(`SELECT COALESCE(SUM(adults + children), 0) FROM bookings WHERE status = 'checked_in'`);
  const todayRevenue = collections(today, today);
  const monthRevenue = collections(monthStart(today), today);
  const monthExpenses = scalar('SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE expense_date BETWEEN ? AND ?', monthStart(today), today);
  const openOrders = scalar(`SELECT COUNT(*) FROM restaurant_orders WHERE status IN ('pending','preparing','served')`);
  const openMaintenance = scalar(`SELECT COUNT(*) FROM maintenance_requests WHERE status IN ('open','in_progress')`);
  const pendingTasks = scalar(`SELECT COUNT(*) FROM housekeeping_tasks WHERE status <> 'completed'`);

  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const revenueSeries = days.map((d) => ({
    label: formatShortDate(d),
    revenue: Math.round(collections(d, d)),
    expenses: Math.round(scalar('SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE expense_date = ?', d)),
  }));
  const occupancySeries = Array.from({ length: 14 }, (_, i) => addDays(today, i - 6)).map((d) => {
    const n = scalar(
      `SELECT COUNT(*) FROM bookings WHERE check_in_date <= ? AND check_out_date > ?
          AND (status IN ('checked_in','checked_out') OR (status = 'confirmed' AND check_in_date >= ?))`,
      d, d, today,
    );
    return { label: formatShortDate(d) + (d === today ? ' •' : ''), occupancy: totalRooms ? Math.min(100, (n / totalRooms) * 100) : 0 };
  });

  const recent = all<{ id: number; booking_no: string; guest_name: string; room_number: string; check_in_date: string; check_out_date: string; status: string }>(
    `SELECT b.id, b.booking_no, g.name AS guest_name, r.room_number, b.check_in_date, b.check_out_date, b.status
       FROM bookings b JOIN guests g ON g.id = b.guest_id JOIN rooms r ON r.id = b.room_id
      ORDER BY b.id DESC LIMIT 8`,
  );
  const rooms = all<{ id: number; room_number: string; status: string; housekeeping_status: string; type_name: string; guest_name: string | null; booking_id: number | null }>(
    `SELECT r.id, r.room_number, r.status, r.housekeeping_status, rt.name AS type_name, g.name AS guest_name, b.id AS booking_id
       FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id
       LEFT JOIN bookings b ON b.room_id = r.id AND b.status = 'checked_in'
       LEFT JOIN guests g ON g.id = b.guest_id
      WHERE r.is_active = 1 ORDER BY r.room_number COLLATE NOCASE`,
  );

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user.name.split(' ')[0]}`}
        description={`Here's what's happening at ${settings.hotel_name} today — ${formatDate(today)}.`}
        actions={
          can(user.role, 'frontdesk') ? (
            <>
              <LinkButton href="/bookings/new?walkin=1" variant="secondary">
                <UserPlus className="size-4" /> Walk-in
              </LinkButton>
              <LinkButton href="/bookings/new">
                <Plus className="size-4" /> New booking
              </LinkButton>
            </>
          ) : null
        }
      />

      {totalRooms === 0 ? (
        <Card className="mb-6 border-indigo-200 bg-indigo-50/50 p-5">
          <h2 className="font-semibold text-indigo-900">Welcome! Let&apos;s set up your hotel.</h2>
          <p className="mt-1 text-sm text-indigo-800">
            Start by adding your room types and rooms. Admins can also load demo data from Settings to explore the system.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {can(user.role, 'rooms_manage') ? <LinkButton href="/rooms/types" size="sm">Add room types</LinkButton> : null}
            {can(user.role, 'settings') ? <LinkButton href="/settings" size="sm" variant="secondary">Hotel settings</LinkButton> : null}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Occupancy" value={formatPercent(occupancy)} hint={`${occupied} of ${sellable} sellable rooms`} icon={<Percent className="size-5" />} tone="green" />
        <StatCard label="Available rooms" value={available} hint={`${dirty} need cleaning · ${blocked} blocked`} icon={<BedDouble className="size-5" />} tone="blue" href="/rooms" />
        <StatCard label="Arrivals today" value={arrivals} hint="Pending check-ins" icon={<CalendarCheck className="size-5" />} tone="indigo" href="/front-desk" />
        <StatCard label="Departures due" value={departures} hint={`${inHouseGuests} guests in-house`} icon={<CalendarX className="size-5" />} tone="orange" href="/front-desk?tab=departures" />
        <StatCard label="Today's collection" value={formatMoney(todayRevenue, cur)} hint="Rooms + restaurant" icon={<IndianRupee className="size-5" />} tone="green" />
        <StatCard label="This month" value={formatMoney(monthRevenue, cur)} hint={`Expenses ${formatMoney(monthExpenses, cur)}`} icon={<TrendingUp className="size-5" />} tone="purple" />
        <StatCard label="Open restaurant orders" value={openOrders} icon={<UtensilsCrossed className="size-5" />} tone="yellow" href="/restaurant" />
        <StatCard label="Housekeeping / Maintenance" value={`${pendingTasks} / ${openMaintenance}`} hint="Pending tasks / open issues" icon={<Wrench className="size-5" />} tone="red" href="/housekeeping" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Collections vs expenses" description="Last 14 days" />
          <div className="p-4">
            <RevenueChart data={revenueSeries} currency={cur} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Occupancy" description="Last 7 days and next 7 days (• today)" />
          <div className="p-4">
            <OccupancyChart data={occupancySeries} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Room status"
            actions={
              <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                <Legend className="bg-emerald-500" label="Available" />
                <Legend className="bg-indigo-500" label="Occupied" />
                <Legend className="bg-amber-500" label="Maintenance" />
                <Legend className="bg-rose-500" label="Out of order" />
              </div>
            }
          />
          {rooms.length === 0 ? (
            <EmptyState title="No rooms yet" />
          ) : (
            <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-8">
              {rooms.map((r) => {
                const tone = {
                  available: 'border-emerald-200 bg-emerald-50 text-emerald-800',
                  occupied: 'border-indigo-200 bg-indigo-50 text-indigo-800',
                  maintenance: 'border-amber-200 bg-amber-50 text-amber-800',
                  out_of_order: 'border-rose-200 bg-rose-50 text-rose-800',
                }[r.status];
                const body = (
                  <div className={cn('rounded-lg border p-2 text-center transition-shadow hover:shadow', tone)} title={r.guest_name ?? r.type_name}>
                    <p className="text-base font-bold">{r.room_number}</p>
                    <p className="truncate text-[11px] opacity-80">{r.guest_name ?? r.type_name}</p>
                    {r.housekeeping_status === 'dirty' ? (
                      <p className="mt-0.5 flex items-center justify-center gap-0.5 text-[10px] font-medium text-orange-600">
                        <Sparkles className="size-3" /> Dirty
                      </p>
                    ) : null}
                  </div>
                );
                return r.booking_id ? (
                  <Link key={r.id} href={`/bookings/${r.booking_id}`}>{body}</Link>
                ) : (
                  <div key={r.id}>{body}</div>
                );
              })}
            </div>
          )}
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Recent bookings" actions={<Link href="/bookings" className="link text-sm">View all</Link>} />
          {recent.length === 0 ? (
            <EmptyState title="No bookings yet" />
          ) : (
            <TableWrap>
              <table className="tbl">
                <tbody>
                  {recent.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/bookings/${b.id}`} className="font-medium hover:text-indigo-600">{b.guest_name}</Link>
                        <p className="text-xs text-slate-500">
                          {b.booking_no} · Room {b.room_number}
                        </p>
                      </td>
                      <td className="whitespace-nowrap text-xs text-slate-600">
                        {formatShortDate(b.check_in_date)} → {formatShortDate(b.check_out_date)}
                      </td>
                      <td className="text-right"><StatusBadge status={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <QuickLink href="/front-desk" icon={<DoorOpen className="size-5" />} label="Front desk" />
        <QuickLink href="/calendar" icon={<CalendarCheck className="size-5" />} label="Room calendar" />
        <QuickLink href="/guests" icon={<Users className="size-5" />} label="Guest directory" />
      </div>
    </>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-full', className)} />
      {label}
    </span>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="card flex items-center gap-3 p-4 text-sm font-medium text-slate-700 hover:border-indigo-200 hover:text-indigo-700">
      <span className="rounded-lg bg-slate-100 p-2 text-slate-600">{icon}</span>
      {label}
    </Link>
  );
}

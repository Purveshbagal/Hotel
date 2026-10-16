import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { all } from '@/lib/db';
import { addDays, cn, formatDate, isDateStr, todayStr, weekday } from '@/lib/utils';

export const metadata: Metadata = { title: 'Room Calendar' };

type RoomRow = { id: number; room_number: string; status: string; type_name: string };
type BookingRow = {
  id: number;
  room_id: number;
  booking_no: string;
  guest_name: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-sky-500 hover:bg-sky-600',
  checked_in: 'bg-emerald-500 hover:bg-emerald-600',
  checked_out: 'bg-slate-400 hover:bg-slate-500',
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ start?: string; days?: string }> }) {
  await requireUser('frontdesk');
  const sp = await searchParams;
  const today = todayStr();
  const span = [7, 14, 21, 30].includes(Number(sp.days)) ? Number(sp.days) : 14;
  const start = isDateStr(sp.start) ? sp.start : addDays(today, -1);
  const end = addDays(start, span);
  const dates = Array.from({ length: span }, (_, i) => addDays(start, i));

  const rooms = all<RoomRow>(
    `SELECT r.id, r.room_number, r.status, rt.name AS type_name
       FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id
      WHERE r.is_active = 1
      ORDER BY rt.base_rate, rt.name, r.room_number COLLATE NOCASE`,
  );
  const bookings = all<BookingRow>(
    `SELECT b.id, b.room_id, b.booking_no, g.name AS guest_name, b.check_in_date, b.check_out_date, b.status
       FROM bookings b JOIN guests g ON g.id = b.guest_id
      WHERE b.status IN ('confirmed','checked_in','checked_out') AND b.check_in_date < ? AND b.check_out_date > ?
      ORDER BY b.check_in_date`,
    end,
    start,
  );
  const byRoom = new Map<number, BookingRow[]>();
  for (const b of bookings) byRoom.set(b.room_id, [...(byRoom.get(b.room_id) ?? []), b]);

  const groups: { type: string; rooms: RoomRow[] }[] = [];
  for (const r of rooms) {
    const g = groups.find((x) => x.type === r.type_name);
    if (g) g.rooms.push(r);
    else groups.push({ type: r.type_name, rooms: [r] });
  }

  const link = (s: string, d = span) => `/calendar?start=${s}&days=${d}`;

  return (
    <>
      <PageHeader
        title="Room Calendar"
        description={`${formatDate(start)} – ${formatDate(addDays(end, -1))}. Click an empty cell to book that room.`}
        actions={
          <>
            <div className="flex items-center rounded-lg border border-slate-300 bg-white shadow-sm">
              <Link href={link(addDays(start, -span))} className="px-2.5 py-2 text-slate-600 hover:bg-slate-50" aria-label="Previous">
                <ChevronLeft className="size-4" />
              </Link>
              <Link href={link(addDays(today, -1))} className="border-x border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
                Today
              </Link>
              <Link href={link(addDays(start, span))} className="px-2.5 py-2 text-slate-600 hover:bg-slate-50" aria-label="Next">
                <ChevronRight className="size-4" />
              </Link>
            </div>
            <form method="get" className="flex items-center gap-2">
              <input type="date" name="start" defaultValue={start} className="input w-auto" />
              <select name="days" defaultValue={span} className="input w-auto">
                {[7, 14, 21, 30].map((d) => (
                  <option key={d} value={d}>{d} days</option>
                ))}
              </select>
              <button className="input w-auto cursor-pointer font-medium hover:bg-slate-50">Go</button>
            </form>
            <LinkButton href="/bookings/new">
              <Plus className="size-4" /> New booking
            </LinkButton>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-sky-500" /> Confirmed</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-emerald-500" /> In-house</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-slate-400" /> Checked out</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-amber-200" /> Room blocked (maintenance)</span>
      </div>

      <Card className="overflow-hidden">
        {rooms.length === 0 ? (
          <EmptyState title="No rooms configured" description="Add rooms first to see the calendar." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-28 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Room
                  </th>
                  {dates.map((d) => (
                    <th
                      key={d}
                      className={cn(
                        'min-w-16 border-b border-r border-slate-200 px-1 py-1.5 text-center text-xs font-medium',
                        d === today ? 'bg-indigo-600 text-white' : weekday(d) === 'Sat' || weekday(d) === 'Sun' ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-600',
                      )}
                    >
                      <div>{weekday(d)}</div>
                      <div className="text-sm font-bold">{d.slice(8, 10)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <GroupRows key={g.type} group={g} dates={dates} byRoom={byRoom} today={today} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function GroupRows({
  group,
  dates,
  byRoom,
  today,
}: {
  group: { type: string; rooms: RoomRow[] };
  dates: string[];
  byRoom: Map<number, BookingRow[]>;
  today: string;
}) {
  return (
    <>
      <tr>
        <td colSpan={dates.length + 1} className="border-b border-slate-200 bg-slate-100/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {group.type}
        </td>
      </tr>
      {group.rooms.map((room) => {
        const list = byRoom.get(room.id) ?? [];
        const cells: React.ReactNode[] = [];
        let i = 0;
        while (i < dates.length) {
          const d = dates[i];
          const b = list.find((x) => x.check_in_date <= d && x.check_out_date > d);
          if (b) {
            let n = 1;
            while (i + n < dates.length && b.check_out_date > dates[i + n]) n++;
            const startsHere = b.check_in_date === d;
            cells.push(
              <td key={d} colSpan={n} className="border-b border-r border-slate-200 p-0.5">
                <Link
                  href={`/bookings/${b.id}`}
                  title={`${b.guest_name} · ${b.booking_no} · ${formatDate(b.check_in_date)} → ${formatDate(b.check_out_date)}`}
                  className={cn(
                    'block truncate px-2 py-1.5 text-xs font-medium text-white',
                    STATUS_STYLES[b.status],
                    startsHere ? 'rounded-l-md' : '',
                    b.check_out_date <= dates[dates.length - 1] || i + n < dates.length ? 'rounded-r-md' : '',
                  )}
                >
                  {b.guest_name}
                </Link>
              </td>,
            );
            i += n;
          } else {
            const blocked = room.status === 'maintenance' || room.status === 'out_of_order';
            cells.push(
              <td
                key={d}
                className={cn(
                  'h-9 border-b border-r border-slate-200 p-0',
                  d === today ? 'bg-indigo-50/60' : '',
                  blocked && d >= today ? 'bg-amber-100' : '',
                )}
              >
                {d >= today && !blocked ? (
                  <Link href={`/bookings/new?room=${room.id}&date=${d}`} className="block size-full min-h-9 hover:bg-indigo-100" title={`Book room ${room.room_number} on ${formatDate(d)}`} />
                ) : null}
              </td>,
            );
            i++;
          }
        }
        return (
          <tr key={room.id}>
            <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-1.5 font-semibold">{room.room_number}</td>
            {cells}
          </tr>
        );
      })}
    </>
  );
}

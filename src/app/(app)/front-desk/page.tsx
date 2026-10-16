import type { Metadata } from 'next';
import Link from 'next/link';
import { LogIn, LogOut, MoonStar, Plus, UserPlus } from 'lucide-react';
import { checkInAction, markAllNoShowsAction } from '@/actions/bookings';
import { ActionButton } from '@/components/action-form';
import { Badge, Card, EmptyState, LinkButton, PageHeader, StatusBadge, TableWrap, Tabs } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { all } from '@/lib/db';
import { computeFolio } from '@/lib/services/booking';
import { getSettings } from '@/lib/settings';
import type { FolioCharge, Payment } from '@/lib/types';
import { formatDate, formatMoney, todayStr } from '@/lib/utils';

export const metadata: Metadata = { title: 'Front Desk' };

type Row = {
  id: number;
  guest_id: number;
  booking_no: string;
  guest_name: string;
  guest_phone: string | null;
  guest_is_vip: number;
  guest_id_number: string | null;
  room_number: string;
  room_type_name: string;
  room_status: string;
  housekeeping_status: string;
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
  status: string;
  rate_per_night: number;
  extra_beds: number;
  extra_bed_rate: number;
  room_tax_rate: number;
  discount_amount: number;
  special_requests: string | null;
};

const SELECT = `
  SELECT b.*, g.name AS guest_name, g.phone AS guest_phone, g.is_vip AS guest_is_vip, g.id_number AS guest_id_number,
         r.room_number, r.status AS room_status, r.housekeeping_status, rt.name AS room_type_name
    FROM bookings b JOIN guests g ON g.id = b.guest_id JOIN rooms r ON r.id = b.room_id JOIN room_types rt ON rt.id = r.room_type_id`;

export default async function FrontDeskPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireUser('frontdesk');
  const { tab = 'arrivals' } = await searchParams;
  const settings = getSettings();
  const cur = settings.currency_symbol;
  const today = todayStr();

  const arrivals = all<Row>(`${SELECT} WHERE b.status = 'confirmed' AND b.check_in_date <= ? ORDER BY b.check_in_date, r.room_number`, today);
  const departures = all<Row>(`${SELECT} WHERE b.status = 'checked_in' AND b.check_out_date <= ? ORDER BY b.check_out_date, r.room_number`, today);
  const inHouse = all<Row>(`${SELECT} WHERE b.status = 'checked_in' ORDER BY r.room_number COLLATE NOCASE`);
  const overdueArrivals = arrivals.filter((a) => a.check_in_date < today).length;

  const balances = new Map<number, number>();
  for (const b of [...departures, ...inHouse]) {
    if (balances.has(b.id)) continue;
    const charges = all<FolioCharge>('SELECT * FROM folio_charges WHERE booking_id = ?', b.id);
    const payments = all<Payment & { received_by_name: null }>('SELECT *, NULL AS received_by_name FROM payments WHERE booking_id = ?', b.id);
    balances.set(b.id, computeFolio(b, charges, payments, cur).balance);
  }

  const list = tab === 'departures' ? departures : tab === 'inhouse' ? inHouse : arrivals;

  return (
    <>
      <PageHeader
        title="Front Desk"
        description={`${formatDate(today)} · ${arrivals.length} arrivals · ${departures.length} departures · ${inHouse.length} rooms occupied`}
        actions={
          <>
            {overdueArrivals > 0 ? (
              <ActionButton
                action={markAllNoShowsAction}
                fields={{}}
                variant="secondary"
                size="md"
                confirm={`Mark ${overdueArrivals} overdue arrival(s) from previous days as no-show?`}
              >
                <MoonStar className="size-4" /> Night audit ({overdueArrivals})
              </ActionButton>
            ) : null}
            <LinkButton href="/bookings/new?walkin=1" variant="secondary">
              <UserPlus className="size-4" /> Walk-in
            </LinkButton>
            <LinkButton href="/bookings/new">
              <Plus className="size-4" /> New booking
            </LinkButton>
          </>
        }
      />
      <Tabs
        active={tab}
        tabs={[
          { key: 'arrivals', label: 'Arrivals', href: '/front-desk?tab=arrivals', count: arrivals.length },
          { key: 'departures', label: 'Departures', href: '/front-desk?tab=departures', count: departures.length },
          { key: 'inhouse', label: 'In-house', href: '/front-desk?tab=inhouse', count: inHouse.length },
        ]}
      />
      <Card>
        {list.length === 0 ? (
          <EmptyState
            title={tab === 'departures' ? 'No departures due' : tab === 'inhouse' ? 'No guests in-house' : 'No arrivals pending today'}
          />
        ) : (
          <TableWrap>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Guest</th>
                  <th>Booking</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Pax</th>
                  {tab === 'arrivals' ? <th>Room status</th> : <th className="text-right">Balance</th>}
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {list.map((b) => {
                  const balance = balances.get(b.id) ?? 0;
                  return (
                    <tr key={b.id}>
                      <td>
                        <p className="text-base font-bold">{b.room_number}</p>
                        <p className="text-xs text-slate-500">{b.room_type_name}</p>
                      </td>
                      <td>
                        <p className="font-medium">
                          {b.guest_name} {b.guest_is_vip ? <Badge tone="yellow">VIP</Badge> : null}
                        </p>
                        <p className="text-xs text-slate-500">{b.guest_phone}</p>
                        {b.special_requests ? <p className="mt-0.5 max-w-xs truncate text-xs text-sky-700">★ {b.special_requests}</p> : null}
                      </td>
                      <td>
                        <Link href={`/bookings/${b.id}`} className="link">{b.booking_no}</Link>
                      </td>
                      <td className="whitespace-nowrap">
                        {formatDate(b.check_in_date)}
                        {b.status === 'confirmed' && b.check_in_date < today ? <Badge tone="red" className="ml-1">Late</Badge> : null}
                      </td>
                      <td className="whitespace-nowrap">
                        {formatDate(b.check_out_date)}
                        {b.status === 'checked_in' && b.check_out_date < today ? <Badge tone="red" className="ml-1">Overdue</Badge> : null}
                      </td>
                      <td>{b.adults + b.children}</td>
                      {tab === 'arrivals' ? (
                        <td>
                          <div className="flex flex-wrap gap-1">
                            <StatusBadge status={b.room_status} />
                            {b.housekeeping_status !== 'clean' && b.housekeeping_status !== 'inspected' ? (
                              <StatusBadge status={b.housekeeping_status} />
                            ) : null}
                          </div>
                        </td>
                      ) : (
                        <td className={`whitespace-nowrap text-right font-medium ${balance > 0.009 ? 'text-rose-600' : 'text-emerald-700'}`}>
                          {formatMoney(balance, cur)}
                        </td>
                      )}
                      <td className="text-right">
                        {b.status === 'confirmed' ? (
                          b.guest_id_number || settings.require_id_at_checkin !== '1' ? (
                            <ActionButton action={checkInAction} fields={{ id: b.id }} variant="success" confirm={`Check in ${b.guest_name} to room ${b.room_number}?`}>
                              <LogIn className="size-3.5" /> Check in
                            </ActionButton>
                          ) : (
                            <LinkButton href={`/guests/${b.guest_id}`} size="sm" variant="secondary">Add ID proof</LinkButton>
                          )
                        ) : (
                          <LinkButton href={`/bookings/${b.id}`} size="sm" variant={tab === 'departures' ? 'warning' : 'secondary'}>
                            {tab === 'departures' ? <><LogOut className="size-3.5" /> Check out</> : 'Open folio'}
                          </LinkButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}

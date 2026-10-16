import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { deleteGuestAction, saveGuestAction } from '@/actions/guests';
import { ActionButton, ActionForm, FormActions, SubmitButton } from '@/components/action-form';
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, StatCard, StatusBadge, TableWrap } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { all, get } from '@/lib/db';
import { computeFolio } from '@/lib/services/booking';
import { getSettings } from '@/lib/settings';
import type { BookingDetail, FolioCharge, Guest, Payment } from '@/lib/types';
import { formatDate, formatDateTime, formatMoney, nightsBetween } from '@/lib/utils';
import { GuestFields } from '../guest-fields';

export const metadata: Metadata = { title: 'Guest profile' };

export default async function GuestPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser('guests');
  const { id } = await params;
  const guest = get<Guest>('SELECT * FROM guests WHERE id = ?', Number(id) || 0);
  if (!guest) notFound();
  const cur = getSettings().currency_symbol;

  const bookings = all<BookingDetail>(
    `SELECT b.*, r.room_number, rt.name AS room_type_name
       FROM bookings b JOIN rooms r ON r.id = b.room_id JOIN room_types rt ON rt.id = r.room_type_id
      WHERE b.guest_id = ? ORDER BY b.check_in_date DESC`,
    guest.id,
  );
  let totalSpend = 0;
  let nights = 0;
  const totals = new Map<number, number>();
  for (const b of bookings) {
    if (b.status !== 'checked_in' && b.status !== 'checked_out') continue;
    const charges = all<FolioCharge>('SELECT * FROM folio_charges WHERE booking_id = ?', b.id);
    const payments = all<Payment & { received_by_name: null }>('SELECT *, NULL AS received_by_name FROM payments WHERE booking_id = ?', b.id);
    const f = computeFolio(b, charges, payments, cur);
    totals.set(b.id, f.total);
    totalSpend += f.total;
    nights += f.nights;
  }
  const stays = totals.size;

  return (
    <>
      <PageHeader
        back={{ href: '/guests', label: 'Guests' }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {guest.name}
            {guest.is_vip ? <Badge tone="yellow">VIP</Badge> : null}
            {guest.is_blacklisted ? <Badge tone="red">Blacklisted</Badge> : null}
          </span>
        }
        description={`Guest since ${formatDateTime(guest.created_at)}`}
        actions={
          <>
            {!guest.is_blacklisted ? (
              <LinkButton href={`/bookings/new?guest=${guest.id}`}>
                <Plus className="size-4" /> New booking
              </LinkButton>
            ) : null}
            {bookings.length === 0 ? (
              <ActionButton action={deleteGuestAction} fields={{ id: guest.id }} variant="danger-ghost" size="md" confirm={`Delete ${guest.name}? This cannot be undone.`}>
                <Trash2 className="size-4" /> Delete
              </ActionButton>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Stays" value={stays} />
        <StatCard label="Nights" value={nights} />
        <StatCard label="Total billed" value={formatMoney(totalSpend, cur)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Profile" />
          <div className="p-5">
            <ActionForm action={saveGuestAction}>
              <GuestFields guest={guest} />
              <FormActions>
                <SubmitButton>Save changes</SubmitButton>
              </FormActions>
            </ActionForm>
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Booking history" />
          {bookings.length === 0 ? (
            <EmptyState title="No bookings yet" />
          ) : (
            <TableWrap>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Dates</th>
                    <th>Status</th>
                    <th className="text-right">Bill</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/bookings/${b.id}`} className="link">{b.booking_no}</Link>
                        <p className="text-xs text-slate-500">Room {b.room_number} · {b.room_type_name}</p>
                      </td>
                      <td className="whitespace-nowrap text-xs">
                        {formatDate(b.check_in_date)}
                        <br />
                        {nightsBetween(b.check_in_date, b.check_out_date)} night(s)
                      </td>
                      <td><StatusBadge status={b.status} /></td>
                      <td className="whitespace-nowrap text-right">{totals.has(b.id) ? formatMoney(totals.get(b.id)!, cur) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}

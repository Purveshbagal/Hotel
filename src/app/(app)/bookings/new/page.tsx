import type { Metadata } from 'next';
import { createBookingAction } from '@/actions/bookings';
import { PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { get } from '@/lib/db';
import { getSettings, taxEnabled } from '@/lib/settings';
import { addDays, isDateStr, todayStr } from '@/lib/utils';
import { BookingForm } from '../booking-form';

export const metadata: Metadata = { title: 'New booking' };

export default async function NewBookingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser('frontdesk');
  const sp = await searchParams;
  const settings = getSettings();
  const today = todayStr();
  const checkIn = isDateStr(sp.date) && sp.date >= today ? sp.date : today;
  const checkOut = isDateStr(sp.to) && sp.to > checkIn ? sp.to : addDays(checkIn, 1);

  const room = sp.room
    ? get<{ id: number; base_rate: number; extra_bed_rate: number }>(
        'SELECT r.id, rt.base_rate, rt.extra_bed_rate FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id WHERE r.id = ?',
        Number(sp.room) || 0,
      )
    : undefined;
  const guest = sp.guest
    ? get<{ id: number; name: string; phone: string | null; email: string | null; is_vip: number; is_blacklisted: number }>(
        'SELECT id, name, phone, email, is_vip, is_blacklisted FROM guests WHERE id = ?',
        Number(sp.guest) || 0,
      )
    : undefined;

  return (
    <>
      <PageHeader
        title={sp.walkin ? 'Walk-in booking' : 'New booking'}
        description="Pick the dates, choose an available room and enter the guest details."
        back={{ href: '/bookings', label: 'Bookings' }}
      />
      <BookingForm
        mode="create"
        action={createBookingAction}
        currency={settings.currency_symbol}
        tax={{
          enabled: taxEnabled(settings),
          threshold: Number(settings.room_tax_threshold) || 0,
          low: Number(settings.room_tax_rate_low) || 0,
          high: Number(settings.room_tax_rate_high) || 0,
        }}
        today={today}
        walkIn={!!sp.walkin}
        guest={guest && !guest.is_blacklisted ? guest : null}
        initial={{
          room_id: room?.id,
          check_in_date: checkIn,
          check_out_date: checkOut,
          adults: 1,
          children: 0,
          rate_per_night: room?.base_rate,
          extra_beds: 0,
          extra_bed_rate: room?.extra_bed_rate,
          discount_amount: 0,
          source: sp.walkin ? 'walk_in' : 'phone',
          special_requests: '',
          notes: '',
        }}
      />
    </>
  );
}

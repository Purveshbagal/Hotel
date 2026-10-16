import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { updateBookingAction } from '@/actions/bookings';
import { PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { getBookingDetail } from '@/lib/services/booking';
import { getSettings, taxEnabled } from '@/lib/settings';
import { todayStr } from '@/lib/utils';
import { BookingForm } from '../../booking-form';

export const metadata: Metadata = { title: 'Edit booking' };

export default async function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser('frontdesk');
  const { id } = await params;
  const b = getBookingDetail(Number(id) || 0);
  if (!b) notFound();
  if (b.status !== 'confirmed' && b.status !== 'checked_in') redirect(`/bookings/${b.id}`);
  const settings = getSettings();

  return (
    <>
      <PageHeader
        title={`Edit booking ${b.booking_no}`}
        description={`${b.guest_name} · ${b.guest_phone ?? ''}`}
        back={{ href: `/bookings/${b.id}`, label: 'Back to booking' }}
      />
      <BookingForm
        mode="edit"
        action={updateBookingAction}
        currency={settings.currency_symbol}
        tax={{
          enabled: taxEnabled(settings),
          threshold: Number(settings.room_tax_threshold) || 0,
          low: Number(settings.room_tax_rate_low) || 0,
          high: Number(settings.room_tax_rate_high) || 0,
        }}
        today={todayStr()}
        lockCheckIn={b.status === 'checked_in'}
        initial={{
          id: b.id,
          room_id: b.room_id,
          check_in_date: b.check_in_date,
          check_out_date: b.check_out_date,
          adults: b.adults,
          children: b.children,
          rate_per_night: b.rate_per_night,
          extra_beds: b.extra_beds,
          extra_bed_rate: b.extra_bed_rate,
          discount_amount: b.discount_amount,
          source: b.source,
          special_requests: b.special_requests ?? '',
          notes: b.notes ?? '',
        }}
      />
    </>
  );
}

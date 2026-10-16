import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CloseButton, PrintButton } from '@/components/print-button';
import { requireUser } from '@/lib/auth';
import { PAYMENT_METHODS, optionLabel } from '@/lib/constants';
import { get } from '@/lib/db';
import { getSettings, hotelAddressLines } from '@/lib/settings';
import { amountInWords, formatDate, formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'Receipt' };

export default async function ReceiptPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser('billing');
  const { id } = await params;
  const p = get<{
    receipt_no: string; payment_date: string; amount: number; type: string; method: string; reference: string | null; notes: string | null;
    booking_no: string | null; guest_name: string | null; room_number: string | null; received_by_name: string | null;
  }>(
    `SELECT p.*, b.booking_no, g.name AS guest_name, r.room_number, u.name AS received_by_name
       FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id LEFT JOIN guests g ON g.id = b.guest_id
       LEFT JOIN rooms r ON r.id = b.room_id LEFT JOIN users u ON u.id = p.received_by
      WHERE p.id = ?`,
    Number(id) || 0,
  );
  if (!p) notFound();
  const s = getSettings();
  const refund = p.type === 'refund';

  return (
    <div className="mx-auto max-w-[180mm]">
      <div className="no-print mb-4 flex justify-end gap-2 px-4">
        <CloseButton />
        <PrintButton />
      </div>
      <div className="bg-white p-8 text-sm text-slate-800 shadow print:shadow-none">
        <div className="border-b-2 border-slate-800 pb-3 text-center">
          <h1 className="text-xl font-bold">{s.hotel_name}</h1>
          {hotelAddressLines(s).map((l) => <p key={l}>{l}</p>)}
          {s.hotel_phone ? <p>Ph: {s.hotel_phone}</p> : null}
          {s.hotel_gstin ? <p>GSTIN: {s.hotel_gstin}</p> : null}
        </div>
        <p className="mt-4 text-center text-lg font-bold uppercase tracking-wide">{refund ? 'Refund Voucher' : 'Payment Receipt'}</p>
        <div className="mt-4 flex justify-between">
          <p>No: <strong>{p.receipt_no}</strong></p>
          <p>Date: <strong>{formatDate(p.payment_date)}</strong></p>
        </div>
        <p className="mt-6 leading-8">
          {refund ? 'Refunded to' : 'Received with thanks from'} <strong className="border-b border-dotted border-slate-500 px-1">{p.guest_name ?? '—'}</strong>
          {p.room_number ? <> (Room {p.room_number}, Booking {p.booking_no})</> : null} the sum of{' '}
          <strong className="border-b border-dotted border-slate-500 px-1">{amountInWords(p.amount)}</strong> by{' '}
          <strong>{optionLabel(PAYMENT_METHODS, p.method)}</strong>
          {p.reference ? <> (Ref: {p.reference})</> : null}.
        </p>
        {p.notes ? <p className="mt-2 text-slate-600">Note: {p.notes}</p> : null}
        <div className="mt-6 inline-block rounded-lg border-2 border-slate-800 px-5 py-2 text-xl font-bold">
          {formatMoney(p.amount, s.currency_symbol)}
        </div>
        <div className="mt-14 flex justify-between text-xs">
          <div className="w-48 border-t border-slate-400 pt-1 text-center">{refund ? 'Guest signature' : 'Guest'}</div>
          <div className="w-48 border-t border-slate-400 pt-1 text-center">
            {p.received_by_name ? `${p.received_by_name} — ` : ''}Authorised signatory
          </div>
        </div>
      </div>
    </div>
  );
}

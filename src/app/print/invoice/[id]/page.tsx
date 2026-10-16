import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CloseButton, PrintButton } from '@/components/print-button';
import { requireUser } from '@/lib/auth';
import { CHARGE_CATEGORIES, ID_TYPES, PAYMENT_METHODS, optionLabel } from '@/lib/constants';
import { get } from '@/lib/db';
import { getBookingDetail, getFolio } from '@/lib/services/booking';
import { getSettings, hotelAddressLines } from '@/lib/settings';
import { amountInWords, formatDate, formatDateTime, formatMoney, round2, todayStr } from '@/lib/utils';

export const metadata: Metadata = { title: 'Invoice' };

const SAC: Record<string, string> = {
  room: '996311',
  food: '996331',
  room_service: '996331',
  minibar: '996331',
  laundry: '999712',
  transport: '996601',
  spa: '999722',
};

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser('bookings');
  const { id } = await params;
  const b = getBookingDetail(Number(id) || 0);
  if (!b) notFound();
  const s = getSettings();
  const cur = s.currency_symbol;
  const money = (n: number) => formatMoney(n, cur);
  const folio = getFolio(b, cur);
  const invoice = get<{ invoice_no: string; invoice_date: string }>('SELECT invoice_no, invoice_date FROM invoices WHERE booking_id = ?', b.id);
  const split = s.split_tax === '1';
  const taxed = s.tax_enabled === '1' || folio.tax > 0;

  return (
    <div className="mx-auto max-w-[210mm]">
      <div className="no-print mb-4 flex justify-end gap-2 px-4">
        <CloseButton />
        <PrintButton label="Print / Save PDF" />
      </div>
      <div className="bg-white p-8 text-[13px] leading-relaxed text-slate-800 shadow print:p-0 print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between gap-6 border-b-2 border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{s.hotel_name}</h1>
            {s.hotel_tagline ? <p className="text-slate-500">{s.hotel_tagline}</p> : null}
            {hotelAddressLines(s).map((l) => (
              <p key={l}>{l}</p>
            ))}
            <p>{[s.hotel_phone && `Ph: ${s.hotel_phone}`, s.hotel_email, s.hotel_website].filter(Boolean).join(' · ')}</p>
            {s.hotel_gstin ? <p className="font-semibold">GSTIN: {s.hotel_gstin}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-xl font-bold uppercase tracking-wide">{invoice ? (taxed ? 'Tax Invoice' : 'Invoice') : 'Proforma Invoice'}</p>
            <table className="ml-auto mt-2 text-left">
              <tbody>
                <tr><td className="pr-3 text-slate-500">Invoice No</td><td className="font-semibold">{invoice?.invoice_no ?? '—'}</td></tr>
                <tr><td className="pr-3 text-slate-500">Date</td><td>{formatDate(invoice?.invoice_date ?? todayStr())}</td></tr>
                <tr><td className="pr-3 text-slate-500">Booking</td><td>{b.booking_no}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-2 gap-6 border-b border-slate-200 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billed to</p>
            <p className="mt-1 font-semibold">{b.guest_company || b.guest_name}</p>
            {b.guest_company ? <p>Guest: {b.guest_name}</p> : null}
            {[b.guest_address, b.guest_city, b.guest_state, b.guest_country].filter(Boolean).length ? (
              <p>{[b.guest_address, b.guest_city, b.guest_state, b.guest_country].filter(Boolean).join(', ')}</p>
            ) : null}
            {b.guest_phone ? <p>Ph: {b.guest_phone}</p> : null}
            {b.guest_gstin ? <p className="font-semibold">GSTIN: {b.guest_gstin}</p> : null}
            {b.guest_id_number ? <p className="text-slate-500">{optionLabel(ID_TYPES, b.guest_id_type)}: {b.guest_id_number}</p> : null}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stay details</p>
            <table className="mt-1">
              <tbody>
                <tr><td className="pr-3 text-slate-500">Room</td><td>{b.room_number} — {b.room_type_name}</td></tr>
                <tr><td className="pr-3 text-slate-500">Arrival</td><td>{b.actual_check_in ? formatDateTime(b.actual_check_in) : formatDate(b.check_in_date)}</td></tr>
                <tr><td className="pr-3 text-slate-500">Departure</td><td>{b.actual_check_out ? formatDateTime(b.actual_check_out) : formatDate(b.check_out_date)}</td></tr>
                <tr><td className="pr-3 text-slate-500">Nights</td><td>{folio.nights}</td></tr>
                <tr><td className="pr-3 text-slate-500">Guests</td><td>{b.adults} adult(s){b.children ? `, ${b.children} child(ren)` : ''}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Lines */}
        <table className="mt-4 w-full border-collapse">
          <thead>
            <tr className="border-y border-slate-800 text-left text-xs uppercase">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">Date</th>
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 pr-2">SAC</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2 text-right">Rate</th>
              {taxed ? <th className="py-2 pr-2 text-right">Tax %</th> : null}
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {folio.lines.map((l, i) => (
              <tr key={l.key} className="border-b border-slate-200 align-top">
                <td className="py-1.5 pr-2">{i + 1}</td>
                <td className="whitespace-nowrap py-1.5 pr-2">{formatDate(l.date)}</td>
                <td className="py-1.5 pr-2">
                  {l.description}
                  {l.category !== 'room' ? <span className="text-slate-500"> ({optionLabel(CHARGE_CATEGORIES, l.category)})</span> : null}
                </td>
                <td className="py-1.5 pr-2 text-slate-500">{SAC[l.category] ?? ''}</td>
                <td className="py-1.5 pr-2 text-right">{l.quantity}</td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right">{money(l.unitPrice)}</td>
                {taxed ? <td className="py-1.5 pr-2 text-right">{l.taxRate}%</td> : null}
                <td className="whitespace-nowrap py-1.5 text-right">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-4 flex justify-between gap-8">
          <div className="max-w-sm flex-1">
            {taxed && folio.taxBreakdown.length ? (
              <table className="w-full border border-slate-300 text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border border-slate-300 px-2 py-1 text-left">Rate</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">Taxable</th>
                    {split ? (
                      <>
                        <th className="border border-slate-300 px-2 py-1 text-right">CGST</th>
                        <th className="border border-slate-300 px-2 py-1 text-right">SGST</th>
                      </>
                    ) : (
                      <th className="border border-slate-300 px-2 py-1 text-right">{s.tax_label}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {folio.taxBreakdown.map((t) => {
                    const half = round2(t.tax / 2);
                    return (
                      <tr key={t.rate}>
                        <td className="border border-slate-300 px-2 py-1">{t.rate}%</td>
                        <td className="border border-slate-300 px-2 py-1 text-right">{money(t.taxable)}</td>
                        {split ? (
                          <>
                            <td className="border border-slate-300 px-2 py-1 text-right">{money(half)} <span className="text-slate-400">@{t.rate / 2}%</span></td>
                            <td className="border border-slate-300 px-2 py-1 text-right">{money(round2(t.tax - half))} <span className="text-slate-400">@{t.rate / 2}%</span></td>
                          </>
                        ) : (
                          <td className="border border-slate-300 px-2 py-1 text-right">{money(t.tax)}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
            <p className="mt-3 text-xs">
              <span className="font-semibold">Amount in words:</span> {amountInWords(folio.total)}
            </p>
          </div>
          <table className="w-72 text-sm">
            <tbody>
              <tr><td className="py-0.5 text-slate-600">Sub total</td><td className="text-right">{money(folio.subtotal)}</td></tr>
              {folio.discount > 0 ? <tr><td className="py-0.5 text-slate-600">Discount</td><td className="text-right">-{money(folio.discount)}</td></tr> : null}
              <tr><td className="py-0.5 text-slate-600">Taxable value</td><td className="text-right">{money(folio.taxable)}</td></tr>
              {taxed ? (
                split ? (
                  <>
                    <tr><td className="py-0.5 text-slate-600">CGST</td><td className="text-right">{money(round2(folio.taxBreakdown.reduce((a, t) => a + round2(t.tax / 2), 0)))}</td></tr>
                    <tr><td className="py-0.5 text-slate-600">SGST</td><td className="text-right">{money(round2(folio.tax - folio.taxBreakdown.reduce((a, t) => a + round2(t.tax / 2), 0)))}</td></tr>
                  </>
                ) : (
                  <tr><td className="py-0.5 text-slate-600">{s.tax_label}</td><td className="text-right">{money(folio.tax)}</td></tr>
                )
              ) : null}
              <tr className="border-t-2 border-slate-800 text-base font-bold"><td className="pt-1">Grand total</td><td className="pt-1 text-right">{money(folio.total)}</td></tr>
              <tr><td className="py-0.5 text-slate-600">Amount paid</td><td className="text-right">{money(folio.netPaid)}</td></tr>
              <tr className="font-semibold">
                <td className="py-0.5">{folio.balance < -0.009 ? 'Refund due' : 'Balance due'}</td>
                <td className="text-right">{money(Math.abs(folio.balance))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {folio.payments.length ? (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payments received</p>
            <table className="mt-1 w-full text-xs">
              <tbody>
                {folio.payments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-1">{p.receipt_no}</td>
                    <td className="py-1">{formatDate(p.payment_date)}</td>
                    <td className="py-1">{p.type === 'refund' ? 'Refund' : 'Payment'} — {optionLabel(PAYMENT_METHODS, p.method)}{p.reference ? ` (${p.reference})` : ''}</td>
                    <td className="py-1 text-right">{p.type === 'refund' ? '-' : ''}{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {s.invoice_terms ? (
          <div className="mt-6 text-xs text-slate-600">
            <p className="font-semibold uppercase tracking-wide text-slate-500">Terms &amp; conditions</p>
            <p className="whitespace-pre-line">{s.invoice_terms}</p>
          </div>
        ) : null}

        <div className="mt-12 grid grid-cols-2 gap-12 text-xs">
          <div className="border-t border-slate-400 pt-1 text-center">Guest signature</div>
          <div className="border-t border-slate-400 pt-1 text-center">For {s.hotel_name} — Authorised signatory</div>
        </div>
        {s.invoice_footer ? <p className="mt-6 text-center text-xs text-slate-500">{s.invoice_footer}</p> : null}
        <p className="mt-2 text-center text-[10px] text-slate-400">This is a computer-generated invoice.</p>
      </div>
    </div>
  );
}

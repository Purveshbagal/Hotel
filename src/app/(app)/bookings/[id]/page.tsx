import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertTriangle, ArrowRightLeft, Ban, Crown, FileText, LogIn, LogOut, Pencil, Plus, Printer, RotateCcw, Trash2, UserX,
} from 'lucide-react';
import {
  addChargeAction, addPaymentAction, cancelBookingAction, changeRoomAction, checkInAction, checkOutAction,
  deletePaymentAction, markNoShowAction, reopenBookingAction, voidChargeAction,
} from '@/actions/bookings';
import { ActionButton, ActionForm, FormActions, SubmitButton } from '@/components/action-form';
import { Modal } from '@/components/modal';
import { Badge, Card, CardHeader, Checkbox, DescList, Field, LinkButton, PageHeader, StatusBadge, TableWrap } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { BOOKING_SOURCES, CHARGE_CATEGORIES, ID_TYPES, PAYMENT_METHODS, optionLabel } from '@/lib/constants';
import { get } from '@/lib/db';
import { can } from '@/lib/permissions';
import { availableRooms, getBookingDetail, getFolio } from '@/lib/services/booking';
import { getSettings, taxEnabled } from '@/lib/settings';
import { addDays, formatDate, formatDateTime, formatMoney, labelize, todayStr } from '@/lib/utils';

export const metadata: Metadata = { title: 'Booking' };

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser('bookings');
  const { id } = await params;
  const b = getBookingDetail(Number(id) || 0);
  if (!b) notFound();

  const settings = getSettings();
  const cur = settings.currency_symbol;
  const folio = getFolio(b, cur);
  const today = todayStr();
  const invoice = get<{ invoice_no: string; invoice_date: string }>('SELECT invoice_no, invoice_date FROM invoices WHERE booking_id = ?', b.id);
  const canFrontDesk = can(user.role, 'frontdesk');
  const canBilling = can(user.role, 'billing');
  const canBillingAdmin = can(user.role, 'billing_admin');
  const active = b.status === 'confirmed' || b.status === 'checked_in';
  const money = (n: number) => formatMoney(n, cur);

  const roomOptions =
    active && canFrontDesk
      ? (() => {
          const from = b.status === 'checked_in' && b.check_in_date < today ? today : b.check_in_date;
          const to = b.check_out_date > from ? b.check_out_date : addDays(from, 1);
          return availableRooms(from, to, b.id).filter((r) => r.id !== b.room_id && (b.status !== 'checked_in' || r.status === 'available'));
        })()
      : [];

  const overdueDeparture = b.status === 'checked_in' && b.check_out_date < today;
  const departureToday = b.status === 'checked_in' && b.check_out_date === today;
  const overdueArrival = b.status === 'confirmed' && b.check_in_date < today;
  const arrivalFuture = b.status === 'confirmed' && b.check_in_date > today;
  const defaultTax = taxEnabled(settings) ? settings.service_tax_rate : '0';

  return (
    <>
      <PageHeader
        back={{ href: '/bookings', label: 'Bookings' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {b.booking_no} <StatusBadge status={b.status} />
          </span>
        }
        description={`${b.guest_name} · Room ${b.room_number} (${b.room_type_name}) · ${formatDate(b.check_in_date)} → ${formatDate(b.check_out_date)}`}
        actions={
          <>
            {b.status === 'confirmed' && canFrontDesk ? (
              <ActionButton action={checkInAction} fields={{ id: b.id }} variant="success" size="md" confirm={`Check in ${b.guest_name} to room ${b.room_number}?`}>
                <LogIn className="size-4" /> Check in
              </ActionButton>
            ) : null}
            {b.status === 'checked_in' && canFrontDesk ? (
              <Modal title="Check out" description={`${b.guest_name} · Room ${b.room_number}`} trigger={<><LogOut className="size-4" /> Check out</>} triggerVariant="warning">
                <ActionForm action={checkOutAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <div className="space-y-4">
                    <div className="rounded-lg bg-slate-50 p-4 text-sm">
                      <div className="flex justify-between"><span>Bill total</span><strong>{money(folio.total)}</strong></div>
                      <div className="flex justify-between"><span>Paid</span><strong>{money(folio.netPaid)}</strong></div>
                      <div className={`mt-2 flex justify-between border-t pt-2 text-base ${folio.balance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        <span>{folio.balance >= 0 ? 'Balance due' : 'Refund due'}</span>
                        <strong>{money(Math.abs(folio.balance))}</strong>
                      </div>
                    </div>
                    <Field label="Departure date" hint="Room charges are recalculated if the guest leaves earlier or later than planned. A same-day check-out is charged as 1 night.">
                      <input type="date" name="departure_date" className="input" defaultValue={today} min={b.check_in_date} required />
                    </Field>
                    {folio.balance > 0 ? (
                      <Checkbox name="allow_balance" label="Allow check-out with pending balance" hint="Use for company / credit accounts. The balance stays on the invoice." />
                    ) : null}
                  </div>
                  <FormActions>
                    <SubmitButton variant="warning">Confirm check-out</SubmitButton>
                  </FormActions>
                </ActionForm>
              </Modal>
            ) : null}
            {active && canFrontDesk ? (
              <LinkButton href={`/bookings/${b.id}/edit`} variant="secondary">
                <Pencil className="size-4" /> Edit
              </LinkButton>
            ) : null}
            {active && canFrontDesk ? (
              <Modal title="Change room" description="Only rooms free for the remaining stay are listed." trigger={<><ArrowRightLeft className="size-4" /> Change room</>} triggerVariant="secondary">
                {roomOptions.length ? (
                  <ActionForm action={changeRoomAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <div className="space-y-4">
                      <Field label="New room" required>
                        <select name="room_id" className="input" required defaultValue="">
                          <option value="">Select room</option>
                          {roomOptions.map((r) => (
                            <option key={r.id} value={r.id}>
                              Room {r.room_number} · {r.type_name} · {money(r.base_rate)}/night
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Checkbox name="apply_rate" label="Apply the new room type's rate" hint={`Current rate: ${money(b.rate_per_night)}/night`} />
                    </div>
                    <FormActions>
                      <SubmitButton>Change room</SubmitButton>
                    </FormActions>
                  </ActionForm>
                ) : (
                  <p className="text-sm text-slate-500">No other rooms are free for these dates.</p>
                )}
              </Modal>
            ) : null}
            <LinkButton href={`/print/invoice/${b.id}`} variant="secondary" target="_blank">
              <Printer className="size-4" /> {invoice ? 'Invoice' : 'Proforma'}
            </LinkButton>
            {b.status === 'confirmed' && canFrontDesk ? (
              <Modal title="Cancel booking" trigger={<><Ban className="size-4" /> Cancel</>} triggerVariant="danger-ghost">
                <ActionForm action={cancelBookingAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <Field label="Reason for cancellation" required>
                    <textarea name="reason" rows={3} className="input" required maxLength={500} />
                  </Field>
                  {folio.netPaid > 0 ? (
                    <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                      {money(folio.netPaid)} has been paid. After cancelling, record a refund from the Payments section if needed.
                    </p>
                  ) : null}
                  <FormActions>
                    <SubmitButton variant="danger">Cancel booking</SubmitButton>
                  </FormActions>
                </ActionForm>
              </Modal>
            ) : null}
            {b.status === 'confirmed' && canFrontDesk && b.check_in_date <= today ? (
              <ActionButton action={markNoShowAction} fields={{ id: b.id }} variant="ghost" size="md" confirm="Mark this booking as no-show?">
                <UserX className="size-4" /> No-show
              </ActionButton>
            ) : null}
            {b.status === 'checked_out' && (user.role === 'admin' || user.role === 'manager') ? (
              <ActionButton action={reopenBookingAction} fields={{ id: b.id }} variant="ghost" size="md" confirm="Undo the check-out? The invoice will be removed and the guest will be in-house again.">
                <RotateCcw className="size-4" /> Undo check-out
              </ActionButton>
            ) : null}
          </>
        }
      />

      <div className="mb-4 space-y-2">
        {b.guest_is_blacklisted ? <Alert tone="red">This guest is blacklisted.</Alert> : null}
        {overdueDeparture ? <Alert tone="red">Departure was due on {formatDate(b.check_out_date)}. Check the guest out or extend the stay.</Alert> : null}
        {departureToday ? <Alert tone="amber">Guest is due to check out today.</Alert> : null}
        {overdueArrival ? <Alert tone="amber">Arrival was due on {formatDate(b.check_in_date)}. Check in, edit the dates or mark as no-show.</Alert> : null}
        {arrivalFuture ? <Alert tone="blue">Arrival on {formatDate(b.check_in_date)}.</Alert> : null}
        {b.status === 'cancelled' ? <Alert tone="red">Cancelled on {formatDateTime(b.cancelled_at)} — {b.cancel_reason}</Alert> : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Folio */}
          <Card>
            <CardHeader
              title="Folio / Charges"
              description={`${folio.nights} night${folio.nights > 1 ? 's' : ''} · rate ${money(b.rate_per_night)} · room tax ${b.room_tax_rate}%`}
              actions={
                active && canBilling ? (
                  <Modal title="Add charge" trigger={<><Plus className="size-4" /> Add charge</>} triggerSize="sm">
                    <ActionForm action={addChargeAction}>
                      <input type="hidden" name="booking_id" value={b.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Category" required>
                          <select name="category" className="input" defaultValue="extra_service">
                            {CHARGE_CATEGORIES.map((c) => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Date" required>
                          <input type="date" name="charge_date" className="input" defaultValue={today} required />
                        </Field>
                        <Field label="Description" required className="sm:col-span-2">
                          <input name="description" className="input" required maxLength={200} placeholder="e.g. Laundry — 3 shirts" />
                        </Field>
                        <Field label="Quantity" required>
                          <input type="number" name="quantity" className="input" defaultValue={1} min={0.01} step="0.01" required />
                        </Field>
                        <Field label={`Unit price (${cur})`} required>
                          <input type="number" name="unit_price" className="input" min={0} step="0.01" required />
                        </Field>
                        <Field label="Tax rate (%)" hint={taxEnabled(settings) ? undefined : 'Tax is disabled in settings.'}>
                          <input type="number" name="tax_rate" className="input" defaultValue={defaultTax} min={0} max={100} step="0.01" />
                        </Field>
                      </div>
                      <FormActions>
                        <SubmitButton>Add charge</SubmitButton>
                      </FormActions>
                    </ActionForm>
                  </Modal>
                ) : null
              }
            />
            <TableWrap>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Tax %</th>
                    <th className="text-right">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {folio.lines.map((l) => (
                    <tr key={l.key}>
                      <td className="whitespace-nowrap">{formatDate(l.date)}</td>
                      <td>
                        {l.description}
                        {l.category !== 'room' ? (
                          <span className="ml-2 text-xs text-slate-400">{optionLabel(CHARGE_CATEGORIES, l.category)}</span>
                        ) : null}
                      </td>
                      <td className="text-right">{l.quantity}</td>
                      <td className="whitespace-nowrap text-right">{money(l.unitPrice)}</td>
                      <td className="text-right">{l.taxRate}%</td>
                      <td className="whitespace-nowrap text-right font-medium">{money(l.amount)}</td>
                      <td className="text-right">
                        {l.chargeId && active && canBillingAdmin ? (
                          <Modal title="Void charge" description={l.description} trigger={<Trash2 className="size-4" />} triggerVariant="danger-ghost" triggerSize="xs" triggerTitle="Void charge" size="sm">
                            <ActionForm action={voidChargeAction}>
                              <input type="hidden" name="charge_id" value={l.chargeId} />
                              <Field label="Reason" required>
                                <input name="reason" className="input" required maxLength={300} />
                              </Field>
                              <FormActions>
                                <SubmitButton variant="danger">Void charge</SubmitButton>
                              </FormActions>
                            </ActionForm>
                          </Modal>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {folio.charges
                    .filter((c) => c.is_void)
                    .map((c) => (
                      <tr key={`void-${c.id}`} className="text-slate-400">
                        <td className="whitespace-nowrap">{formatDate(c.charge_date)}</td>
                        <td>
                          <span className="line-through">{c.description}</span>
                          <Badge tone="red" className="ml-2">Void</Badge>
                          {c.void_reason ? <span className="ml-2 text-xs">{c.void_reason}</span> : null}
                        </td>
                        <td className="text-right">{c.quantity}</td>
                        <td className="text-right">{money(c.unit_price)}</td>
                        <td className="text-right">{c.tax_rate}%</td>
                        <td className="text-right line-through">{money(c.amount)}</td>
                        <td />
                      </tr>
                    ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>

          {/* Payments */}
          <Card>
            <CardHeader
              title="Payments & Refunds"
              actions={
                canBilling ? (
                  <Modal title={active || b.status === 'checked_out' ? 'Record payment' : 'Record refund / retention'} trigger={<><Plus className="size-4" /> Record payment</>} triggerSize="sm" triggerVariant="success">
                    <ActionForm action={addPaymentAction}>
                      <input type="hidden" name="booking_id" value={b.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Type" required>
                          <select name="type" className="input" defaultValue={folio.balance < 0 || (!active && b.status !== 'checked_out') ? 'refund' : 'payment'}>
                            <option value="payment">Payment received</option>
                            <option value="refund">Refund to guest</option>
                          </select>
                        </Field>
                        <Field label={`Amount (${cur})`} required>
                          <input
                            type="number"
                            name="amount"
                            className="input"
                            min={0.01}
                            step="0.01"
                            required
                            defaultValue={!active && b.status !== 'checked_out' ? (folio.netPaid > 0 ? folio.netPaid.toFixed(2) : '') : Math.abs(folio.balance) > 0 ? Math.abs(folio.balance).toFixed(2) : ''}
                          />
                        </Field>
                        <Field label="Method" required>
                          <select name="method" className="input" defaultValue="cash">
                            {PAYMENT_METHODS.map((m) => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Date">
                          <input type="date" name="payment_date" className="input" defaultValue={today} max={today} />
                        </Field>
                        <Field label="Reference / Txn ID" className="sm:col-span-2">
                          <input name="reference" className="input" maxLength={100} />
                        </Field>
                        <Field label="Notes" className="sm:col-span-2">
                          <input name="notes" className="input" maxLength={300} />
                        </Field>
                      </div>
                      <FormActions>
                        <SubmitButton variant="success">Save</SubmitButton>
                      </FormActions>
                    </ActionForm>
                  </Modal>
                ) : null
              }
            />
            {folio.payments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No payments recorded yet.</p>
            ) : (
              <TableWrap>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th>By</th>
                      <th className="text-right">Amount</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {folio.payments.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link href={`/print/receipt/${p.id}`} target="_blank" prefetch={false} className="link">{p.receipt_no}</Link>
                        </td>
                        <td className="whitespace-nowrap">{formatDate(p.payment_date)}</td>
                        <td><StatusBadge status={p.type} /></td>
                        <td>{optionLabel(PAYMENT_METHODS, p.method)}</td>
                        <td className="text-xs text-slate-600">{[p.reference, p.notes].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="text-xs text-slate-600">{p.received_by_name ?? '—'}</td>
                        <td className={`whitespace-nowrap text-right font-medium ${p.type === 'refund' ? 'text-rose-600' : ''}`}>
                          {p.type === 'refund' ? '-' : ''}
                          {money(p.amount)}
                        </td>
                        <td className="text-right">
                          {canBillingAdmin ? (
                            <ActionButton action={deletePaymentAction} fields={{ payment_id: p.id }} variant="danger-ghost" size="xs" confirm={`Delete ${p.receipt_no}? This cannot be undone.`} title="Delete payment">
                              <Trash2 className="size-4" />
                            </ActionButton>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {/* Summary */}
          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold">Bill summary</h2>
            <dl className="space-y-1.5 text-sm">
              <Row label="Room charges" value={money(folio.roomAmount)} />
              <Row label="Other charges" value={money(folio.otherAmount)} />
              {folio.discount > 0 ? <Row label="Discount" value={`-${money(folio.discount)}`} className="text-emerald-700" /> : null}
              <Row label="Taxable amount" value={money(folio.taxable)} />
              {folio.taxBreakdown.map((t) => (
                <Row key={t.rate} label={`${settings.tax_label} @ ${t.rate}%`} value={money(t.tax)} />
              ))}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd>{money(folio.total)}</dd>
              </div>
              <Row label="Paid" value={money(folio.paid)} />
              {folio.refunded > 0 ? <Row label="Refunded" value={`-${money(folio.refunded)}`} /> : null}
              <div className={`flex justify-between rounded-lg px-3 py-2 text-base font-bold ${folio.balance > 0.009 ? 'bg-rose-50 text-rose-700' : folio.balance < -0.009 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                <dt>{folio.balance < -0.009 ? 'Refund due' : 'Balance due'}</dt>
                <dd>{money(Math.abs(folio.balance))}</dd>
              </div>
            </dl>
            {invoice ? (
              <Link href={`/print/invoice/${b.id}`} target="_blank" prefetch={false} className="mt-4 flex items-center gap-2 text-sm text-indigo-600 hover:underline">
                <FileText className="size-4" /> Invoice {invoice.invoice_no} · {formatDate(invoice.invoice_date)}
              </Link>
            ) : null}
          </Card>

          {/* Guest */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                Guest {b.guest_is_vip ? <Crown className="size-4 text-amber-500" /> : null}
              </h2>
              {can(user.role, 'guests') ? <Link href={`/guests/${b.guest_id}`} className="link text-sm">View profile</Link> : null}
            </div>
            <DescList
              columns={1}
              items={[
                ['Name', b.guest_name],
                ['Phone', b.guest_phone],
                ['Email', b.guest_email],
                ['ID proof', b.guest_id_number ? `${optionLabel(ID_TYPES, b.guest_id_type)} · ${b.guest_id_number}` : <span className="text-amber-600">Not recorded</span>],
                ['Address', [b.guest_address, b.guest_city, b.guest_state, b.guest_country].filter(Boolean).join(', ') || null],
                ...(b.guest_company ? ([['Company', `${b.guest_company}${b.guest_gstin ? ` · GSTIN ${b.guest_gstin}` : ''}`]] as [string, string][]) : []),
              ]}
            />
          </Card>

          {/* Stay */}
          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold">Stay</h2>
            <DescList
              columns={2}
              items={[
                ['Room', `${b.room_number} · ${b.room_type_name}`],
                ['Guests', `${b.adults} adult(s)${b.children ? `, ${b.children} child(ren)` : ''}`],
                ['Check-in', formatDate(b.check_in_date)],
                ['Check-out', formatDate(b.check_out_date)],
                ['Arrived', formatDateTime(b.actual_check_in)],
                ['Departed', formatDateTime(b.actual_check_out)],
                ['Extra beds', b.extra_beds ? `${b.extra_beds} × ${money(b.extra_bed_rate)}` : 'None'],
                ['Source', optionLabel(BOOKING_SOURCES, b.source)],
                ['Created', `${formatDateTime(b.created_at)}${b.created_by_name ? ` by ${b.created_by_name}` : ''}`],
                ['Status', labelize(b.status)],
              ]}
            />
            {b.special_requests ? (
              <div className="mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Special requests</p>
                <p className="mt-1 whitespace-pre-line">{b.special_requests}</p>
              </div>
            ) : null}
            {b.notes ? (
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Internal notes</p>
                <p className="mt-1 whitespace-pre-line">{b.notes}</p>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex justify-between ${className ?? ''}`}>
      <dt className="text-slate-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Alert({ tone, children }: { tone: 'red' | 'amber' | 'blue'; children: React.ReactNode }) {
  const tones = {
    red: 'border-rose-200 bg-rose-50 text-rose-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    blue: 'border-sky-200 bg-sky-50 text-sky-800',
  };
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${tones[tone]}`}>
      <AlertTriangle className="size-4 shrink-0" />
      {children}
    </div>
  );
}

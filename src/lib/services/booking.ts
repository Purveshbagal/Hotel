import { all, get } from '../db';
import type { BookingDetail, FolioCharge, Payment, RoomWithType } from '../types';
import { formatMoney, nightsBetween, round2, todayStr } from '../utils';

const ACTIVE_STATUSES = `('confirmed','checked_in')`;

export function getBookingDetail(id: number): BookingDetail | undefined {
  return get<BookingDetail>(
    `SELECT b.*,
            g.name AS guest_name, g.phone AS guest_phone, g.email AS guest_email, g.address AS guest_address,
            g.city AS guest_city, g.state AS guest_state, g.country AS guest_country,
            g.id_type AS guest_id_type, g.id_number AS guest_id_number,
            g.company_name AS guest_company, g.company_gstin AS guest_gstin,
            g.is_vip AS guest_is_vip, g.is_blacklisted AS guest_is_blacklisted,
            r.room_number, r.status AS room_status, rt.id AS room_type_id, rt.name AS room_type_name,
            u.name AS created_by_name
       FROM bookings b
       JOIN guests g ON g.id = b.guest_id
       JOIN rooms r ON r.id = b.room_id
       JOIN room_types rt ON rt.id = r.room_type_id
       LEFT JOIN users u ON u.id = b.created_by
      WHERE b.id = ?`,
    id,
  );
}

/** Returns the conflicting booking number, or null when the room is free for [from, to). */
export function findConflict(roomId: number, from: string, to: string, excludeBookingId = 0): string | null {
  const row = get<{ booking_no: string }>(
    `SELECT booking_no FROM bookings
      WHERE room_id = ? AND status IN ${ACTIVE_STATUSES}
        AND check_in_date < ? AND check_out_date > ? AND id <> ?
      LIMIT 1`,
    roomId,
    to,
    from,
    excludeBookingId,
  );
  return row?.booking_no ?? null;
}

export function availableRooms(from: string, to: string, excludeBookingId = 0): RoomWithType[] {
  return all<RoomWithType>(
    `SELECT r.*, rt.name AS type_name, rt.base_rate, rt.extra_bed_rate, rt.max_adults, rt.max_children
       FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id
      WHERE r.is_active = 1 AND rt.is_active = 1 AND r.status <> 'out_of_order'
        AND NOT EXISTS (
          SELECT 1 FROM bookings b
           WHERE b.room_id = r.id AND b.status IN ${ACTIVE_STATUSES}
             AND b.check_in_date < ? AND b.check_out_date > ? AND b.id <> ?)
      ORDER BY rt.base_rate, rt.name, r.room_number`,
    to,
    from,
    excludeBookingId,
  );
}

export interface FolioLine {
  key: string;
  date: string;
  category: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number;
  chargeId?: number;
  source?: string;
}

export interface Folio {
  nights: number;
  lines: FolioLine[];
  roomAmount: number;
  otherAmount: number;
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
  paid: number;
  refunded: number;
  netPaid: number;
  balance: number;
  taxBreakdown: { rate: number; taxable: number; tax: number }[];
  charges: FolioCharge[];
  payments: (Payment & { received_by_name: string | null })[];
}

type FolioBooking = Pick<
  BookingDetail,
  | 'check_in_date' | 'check_out_date' | 'rate_per_night' | 'extra_beds' | 'extra_bed_rate'
  | 'room_tax_rate' | 'discount_amount' | 'room_number' | 'room_type_name'
>;

export function computeFolio(
  b: FolioBooking,
  charges: FolioCharge[],
  payments: (Payment & { received_by_name: string | null })[],
  currency = '₹',
): Folio {
  const nights = nightsBetween(b.check_in_date, b.check_out_date);
  const lines: FolioLine[] = [];

  const roomCharge = round2(nights * b.rate_per_night);
  lines.push({
    key: 'room',
    date: b.check_in_date,
    category: 'room',
    description: `Room ${b.room_number} (${b.room_type_name}) — ${nights} night${nights > 1 ? 's' : ''} × ${formatMoney(b.rate_per_night, currency)}`,
    quantity: nights,
    unitPrice: b.rate_per_night,
    amount: roomCharge,
    taxRate: b.room_tax_rate,
  });

  let extraBedCharge = 0;
  if (b.extra_beds > 0 && b.extra_bed_rate > 0) {
    extraBedCharge = round2(nights * b.extra_beds * b.extra_bed_rate);
    lines.push({
      key: 'extra-bed',
      date: b.check_in_date,
      category: 'room',
      description: `Extra bed × ${b.extra_beds} — ${nights} night${nights > 1 ? 's' : ''}`,
      quantity: nights * b.extra_beds,
      unitPrice: b.extra_bed_rate,
      amount: extraBedCharge,
      taxRate: b.room_tax_rate,
    });
  }

  const roomAmount = round2(roomCharge + extraBedCharge);
  const discount = round2(Math.min(b.discount_amount, roomAmount));
  const roomTaxable = round2(roomAmount - discount);

  const breakdown = new Map<number, { taxable: number; tax: number }>();
  const addTax = (rate: number, taxable: number, tax: number) => {
    const e = breakdown.get(rate) ?? { taxable: 0, tax: 0 };
    e.taxable = round2(e.taxable + taxable);
    e.tax = round2(e.tax + tax);
    breakdown.set(rate, e);
  };
  addTax(b.room_tax_rate, roomTaxable, round2((roomTaxable * b.room_tax_rate) / 100));

  let otherAmount = 0;
  for (const c of charges) {
    if (c.is_void) continue;
    lines.push({
      key: `charge-${c.id}`,
      date: c.charge_date,
      category: c.category,
      description: c.description,
      quantity: c.quantity,
      unitPrice: c.unit_price,
      amount: c.amount,
      taxRate: c.tax_rate,
      chargeId: c.id,
      source: c.source,
    });
    otherAmount = round2(otherAmount + c.amount);
    addTax(c.tax_rate, c.amount, c.tax_amount);
  }

  const taxBreakdown = [...breakdown.entries()]
    .filter(([rate, v]) => rate > 0 && v.taxable > 0)
    .map(([rate, v]) => ({ rate, ...v }))
    .sort((a, b) => a.rate - b.rate);
  const tax = round2(taxBreakdown.reduce((s, t) => s + t.tax, 0));
  const subtotal = round2(roomAmount + otherAmount);
  const taxable = round2(subtotal - discount);
  const total = round2(taxable + tax);

  const paid = round2(payments.filter((p) => p.type === 'payment').reduce((s, p) => s + p.amount, 0));
  const refunded = round2(payments.filter((p) => p.type === 'refund').reduce((s, p) => s + p.amount, 0));
  const netPaid = round2(paid - refunded);

  return {
    nights,
    lines,
    roomAmount,
    otherAmount,
    subtotal,
    discount,
    taxable,
    tax,
    total,
    paid,
    refunded,
    netPaid,
    balance: round2(total - netPaid),
    taxBreakdown,
    charges,
    payments,
  };
}

export function getFolio(booking: BookingDetail, currency = '₹'): Folio {
  const charges = all<FolioCharge>(
    'SELECT * FROM folio_charges WHERE booking_id = ? ORDER BY charge_date, id',
    booking.id,
  );
  const payments = all<Payment & { received_by_name: string | null }>(
    `SELECT p.*, u.name AS received_by_name FROM payments p
       LEFT JOIN users u ON u.id = p.received_by
      WHERE p.booking_id = ? ORDER BY p.payment_date, p.id`,
    booking.id,
  );
  return computeFolio(booking, charges, payments, currency);
}

/** Bookings currently in the hotel, used for room-service orders and charge posting. */
export function inHouseBookings() {
  return all<{ id: number; booking_no: string; room_number: string; guest_name: string }>(
    `SELECT b.id, b.booking_no, r.room_number, g.name AS guest_name
       FROM bookings b JOIN rooms r ON r.id = b.room_id JOIN guests g ON g.id = b.guest_id
      WHERE b.status = 'checked_in'
      ORDER BY r.room_number`,
  );
}

export function isOverdue(b: { status: string; check_out_date: string }) {
  return b.status === 'checked_in' && b.check_out_date < todayStr();
}

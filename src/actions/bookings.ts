'use server';

import { z } from 'zod';
import type { ActionState } from '@/lib/action-types';
import { fail, formId, logActivity, ok, parseForm, runAction, zf } from '@/lib/action';
import { get, run, transaction } from '@/lib/db';
import { CHARGE_CATEGORIES, PAYMENT_METHODS } from '@/lib/constants';
import { findConflict, getBookingDetail, getFolio } from '@/lib/services/booking';
import { nextBookingNo, nextInvoiceNo, nextReceiptNo } from '@/lib/services/numbering';
import { effectiveTaxRate, getSettings, roomTaxRate } from '@/lib/settings';
import type { RoomWithType } from '@/lib/types';
import { addDays, diffDays, formatDate, formatMoney, isDateStr, labelize, round2, todayStr } from '@/lib/utils';

const PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map((m) => m.value) as [string, ...string[]];
const CHARGE_CATEGORY_VALUES = CHARGE_CATEGORIES.map((c) => c.value) as [string, ...string[]];

// ---------------------------------------------------------------- helpers

function loadRoom(roomId: number): RoomWithType {
  const room = get<RoomWithType>(
    `SELECT r.*, rt.name AS type_name, rt.base_rate, rt.extra_bed_rate, rt.max_adults, rt.max_children
       FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id WHERE r.id = ?`,
    roomId,
  );
  if (!room || !room.is_active) fail('The selected room does not exist or is inactive.');
  return room;
}

function validateStay(checkIn: string, checkOut: string) {
  if (!isDateStr(checkIn) || !isDateStr(checkOut)) fail('Please enter valid check-in and check-out dates.');
  if (checkOut <= checkIn) fail('Check-out date must be after the check-in date.');
  if (diffDays(checkIn, checkOut) > 365) fail('A single booking cannot be longer than 365 nights.');
}

function assertAvailable(roomId: number, from: string, to: string, excludeId = 0) {
  const conflict = findConflict(roomId, from, to, excludeId);
  if (conflict) fail(`The room is already booked for some of these dates (booking ${conflict}).`);
}

function assertDiscount(discount: number, nights: number, rate: number, extraBeds: number, extraBedRate: number) {
  const roomTotal = round2(nights * (rate + extraBeds * extraBedRate));
  if (discount > roomTotal) fail(`Discount cannot be more than the room charges (${formatMoney(roomTotal)}).`);
}

function insertPayment(
  bookingId: number,
  type: 'payment' | 'refund',
  amount: number,
  method: string,
  reference: string | null,
  notes: string | null,
  userId: number,
  paymentDate = todayStr(),
) {
  const receiptNo = nextReceiptNo();
  const r = run(
    `INSERT INTO payments(receipt_no, booking_id, amount, type, method, reference, notes, payment_date, received_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    receiptNo, bookingId, amount, type, method, reference, notes, paymentDate, userId,
  );
  return { id: Number(r.lastInsertRowid), receiptNo };
}

function createCleaningTask(roomId: number, userId: number, note: string) {
  run(
    `INSERT INTO housekeeping_tasks(room_id, task_type, status, priority, notes, created_by)
     VALUES (?, 'cleaning', 'pending', 'high', ?, ?)`,
    roomId, note, userId,
  );
}

function performCheckIn(bookingId: number, userId: number) {
  const b = getBookingDetail(bookingId);
  if (!b) fail('Booking not found.');
  if (b.status !== 'confirmed') fail(`This booking is ${labelize(b.status)}. Only confirmed bookings can be checked in.`);
  const today = todayStr();
  if (b.check_in_date > today)
    fail(`Arrival date is ${formatDate(b.check_in_date)}. To check in early, edit the booking and change the check-in date to today.`);
  if (b.check_out_date <= today) fail('The departure date has already passed. Edit the booking dates before checking in.');
  if (b.guest_is_blacklisted) fail('This guest is blacklisted. Check-in is not allowed.');
  if (getSettings().require_id_at_checkin === '1' && !b.guest_id_number)
    fail('Guest ID proof is required for check-in. Add the ID type and number in the guest profile first.');

  const room = get<{ status: string }>('SELECT status FROM rooms WHERE id = ?', b.room_id)!;
  if (room.status === 'occupied') {
    const other = get<{ booking_no: string }>(
      `SELECT booking_no FROM bookings WHERE room_id = ? AND status = 'checked_in' AND id <> ?`,
      b.room_id, b.id,
    );
    if (other) fail(`Room ${b.room_number} is still occupied (booking ${other.booking_no}). Check that guest out or change the room.`);
  }
  if (room.status === 'maintenance' || room.status === 'out_of_order')
    fail(`Room ${b.room_number} is marked ${labelize(room.status)}. Change the room or update the room status.`);

  run(
    `UPDATE bookings SET status = 'checked_in', actual_check_in = datetime('now','localtime'),
            updated_at = datetime('now','localtime') WHERE id = ?`,
    b.id,
  );
  run(`UPDATE rooms SET status = 'occupied' WHERE id = ?`, b.room_id);
  logActivity(userId, 'Checked in guest', 'booking', b.id, `${b.booking_no} · Room ${b.room_number} · ${b.guest_name}`);
  return b;
}

// ---------------------------------------------------------------- create / update

const stayFields = {
  room_id: zf.id,
  check_in_date: zf.date,
  check_out_date: zf.date,
  adults: zf.int(1, 20),
  children: zf.int(0, 20),
  rate_per_night: zf.money,
  extra_beds: zf.int(0, 10),
  extra_bed_rate: zf.money,
  discount_amount: zf.money,
  source: z.string().trim().min(1).max(40).default('walk_in'),
  special_requests: zf.optionalText(1000),
  notes: zf.optionalText(1000),
};

const createSchema = z.object({
  ...stayFields,
  guest_id: zf.optionalId,
  guest_name: zf.optionalText(120),
  guest_phone: zf.optionalText(30),
  guest_email: zf.email,
  guest_gender: zf.optionalText(20),
  guest_nationality: zf.optionalText(60),
  guest_id_type: zf.optionalText(40),
  guest_id_number: zf.optionalText(60),
  guest_address: zf.optionalText(300),
  guest_city: zf.optionalText(80),
  guest_state: zf.optionalText(80),
  guest_country: zf.optionalText(80),
  guest_company: zf.optionalText(150),
  guest_gstin: zf.optionalText(20),
  advance_amount: zf.money,
  advance_method: z.string().optional(),
  advance_reference: zf.optionalText(100),
  check_in_now: zf.bool,
});

export async function createBookingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('frontdesk', (user) => {
    const d = parseForm(createSchema, formData);
    validateStay(d.check_in_date, d.check_out_date);
    const room = loadRoom(d.room_id);
    if (room.status === 'out_of_order') fail(`Room ${room.room_number} is out of order.`);
    const nights = diffDays(d.check_in_date, d.check_out_date);
    assertDiscount(d.discount_amount, nights, d.rate_per_night, d.extra_beds, d.extra_bed_rate);
    if (d.advance_amount > 0 && !PAYMENT_METHOD_VALUES.includes(d.advance_method ?? ''))
      fail('Please choose the payment method for the advance.');
    const settings = getSettings();

    const result = transaction(() => {
      assertAvailable(room.id, d.check_in_date, d.check_out_date);

      let guestId = d.guest_id;
      if (guestId) {
        const g = get<{ is_blacklisted: number; name: string }>('SELECT is_blacklisted, name FROM guests WHERE id = ?', guestId);
        if (!g) fail('Selected guest was not found.');
        if (g.is_blacklisted) fail(`${g.name} is blacklisted and cannot be booked.`);
      } else {
        if (!d.guest_name) fail("Select an existing guest or enter the new guest's name.");
        if (!d.guest_phone) fail('Guest phone number is required.');
        guestId = Number(
          run(
            `INSERT INTO guests(name, phone, email, gender, nationality, id_type, id_number, address, city, state, country,
                                company_name, company_gstin)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            d.guest_name, d.guest_phone, d.guest_email, d.guest_gender, d.guest_nationality, d.guest_id_type,
            d.guest_id_number, d.guest_address, d.guest_city, d.guest_state, d.guest_country, d.guest_company,
            d.guest_gstin?.toUpperCase() ?? null,
          ).lastInsertRowid,
        );
      }

      const bookingNo = nextBookingNo();
      const bookingId = Number(
        run(
          `INSERT INTO bookings(booking_no, guest_id, room_id, check_in_date, check_out_date, adults, children,
                                rate_per_night, extra_beds, extra_bed_rate, room_tax_rate, discount_amount, source,
                                special_requests, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          bookingNo, guestId, room.id, d.check_in_date, d.check_out_date, d.adults, d.children, d.rate_per_night,
          d.extra_beds, d.extra_bed_rate, roomTaxRate(d.rate_per_night, settings), d.discount_amount, d.source,
          d.special_requests, d.notes, user.id,
        ).lastInsertRowid,
      );
      logActivity(
        user.id, 'Created booking', 'booking', bookingId,
        `${bookingNo} · Room ${room.room_number} · ${formatDate(d.check_in_date)} → ${formatDate(d.check_out_date)}`,
      );

      if (d.advance_amount > 0) {
        const p = insertPayment(bookingId, 'payment', d.advance_amount, d.advance_method!, d.advance_reference, 'Advance payment', user.id);
        logActivity(user.id, 'Recorded payment', 'booking', bookingId, `${p.receiptNo} · ${formatMoney(d.advance_amount)}`);
      }
      if (d.check_in_now) performCheckIn(bookingId, user.id);
      return { bookingId, bookingNo };
    });

    return ok(
      `Booking ${result.bookingNo} created${d.check_in_now ? ' and guest checked in' : ''}.`,
      `/bookings/${result.bookingId}`,
    );
  });
}

const updateSchema = z.object({ id: zf.id, ...stayFields });

export async function updateBookingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('frontdesk', (user) => {
    const d = parseForm(updateSchema, formData);
    const b = getBookingDetail(d.id);
    if (!b) fail('Booking not found.');
    if (b.status !== 'confirmed' && b.status !== 'checked_in')
      fail(`A ${labelize(b.status)} booking cannot be edited.`);

    const checkIn = b.status === 'checked_in' ? b.check_in_date : d.check_in_date;
    validateStay(checkIn, d.check_out_date);
    if (b.status === 'checked_in' && d.check_out_date < todayStr() && d.check_out_date !== b.check_out_date)
      fail('Check-out date cannot be moved into the past for an in-house guest.');
    const room = loadRoom(d.room_id);
    const nights = diffDays(checkIn, d.check_out_date);
    assertDiscount(d.discount_amount, nights, d.rate_per_night, d.extra_beds, d.extra_bed_rate);
    const settings = getSettings();
    const roomChanged = room.id !== b.room_id;

    transaction(() => {
      assertAvailable(room.id, checkIn, d.check_out_date, b.id);
      if (roomChanged && b.status === 'checked_in') {
        if (room.status !== 'available') fail(`Room ${room.room_number} is ${labelize(room.status)} and cannot be assigned.`);
        run(`UPDATE rooms SET status = 'available', housekeeping_status = 'dirty' WHERE id = ?`, b.room_id);
        run(`UPDATE rooms SET status = 'occupied' WHERE id = ?`, room.id);
        createCleaningTask(b.room_id, user.id, `Guest moved out of room (booking ${b.booking_no})`);
      }
      run(
        `UPDATE bookings SET room_id = ?, check_in_date = ?, check_out_date = ?, adults = ?, children = ?,
                rate_per_night = ?, extra_beds = ?, extra_bed_rate = ?, room_tax_rate = ?, discount_amount = ?,
                source = ?, special_requests = ?, notes = ?, updated_at = datetime('now','localtime')
          WHERE id = ?`,
        room.id, checkIn, d.check_out_date, d.adults, d.children, d.rate_per_night, d.extra_beds, d.extra_bed_rate,
        roomTaxRate(d.rate_per_night, settings), d.discount_amount, d.source, d.special_requests, d.notes, b.id,
      );
    });

    const changes: string[] = [];
    if (roomChanged) changes.push(`room ${b.room_number} → ${room.room_number}`);
    if (checkIn !== b.check_in_date || d.check_out_date !== b.check_out_date)
      changes.push(`dates ${formatDate(checkIn)} → ${formatDate(d.check_out_date)}`);
    if (d.rate_per_night !== b.rate_per_night) changes.push(`rate ${formatMoney(b.rate_per_night)} → ${formatMoney(d.rate_per_night)}`);
    logActivity(user.id, 'Updated booking', 'booking', b.id, `${b.booking_no}${changes.length ? ' · ' + changes.join(', ') : ''}`);
    return ok('Booking updated.', `/bookings/${b.id}`);
  });
}

// ---------------------------------------------------------------- status changes

export async function checkInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('frontdesk', (user) => {
    const id = formId(formData);
    const b = transaction(() => performCheckIn(id, user.id));
    return ok(`${b.guest_name} checked in to room ${b.room_number}.`);
  });
}

const checkOutSchema = z.object({
  id: zf.id,
  departure_date: zf.optionalDate,
  allow_balance: zf.bool,
});

export async function checkOutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('frontdesk', (user) => {
    const d = parseForm(checkOutSchema, formData);
    const b = getBookingDetail(d.id);
    if (!b) fail('Booking not found.');
    if (b.status !== 'checked_in') fail('Only checked-in guests can be checked out.');

    let departure = d.departure_date ?? todayStr();
    if (departure <= b.check_in_date) departure = addDays(b.check_in_date, 1);

    const openOrders = get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM restaurant_orders WHERE booking_id = ? AND status NOT IN ('completed','cancelled')`,
      b.id,
    )!.n;
    if (openOrders > 0)
      fail(`There ${openOrders === 1 ? 'is 1 open restaurant order' : `are ${openOrders} open restaurant orders`} for this room. Settle or cancel them first.`);

    const currency = getSettings().currency_symbol;
    const invoiceNo = transaction(() => {
      if (departure !== b.check_out_date) {
        if (departure > b.check_out_date) assertAvailable(b.room_id, b.check_out_date, departure, b.id);
        run('UPDATE bookings SET check_out_date = ? WHERE id = ?', departure, b.id);
      }
      const fresh = getBookingDetail(b.id)!;
      const folio = getFolio(fresh, currency);
      if (folio.balance > 0.009 && !d.allow_balance)
        fail(`Outstanding balance of ${formatMoney(folio.balance, currency)}. Collect the payment first, or tick "Allow check-out with pending balance".`);

      run(
        `UPDATE bookings SET status = 'checked_out', actual_check_out = datetime('now','localtime'),
                updated_at = datetime('now','localtime') WHERE id = ?`,
        b.id,
      );
      run(`UPDATE rooms SET status = 'available', housekeeping_status = 'dirty' WHERE id = ?`, b.room_id);
      createCleaningTask(b.room_id, user.id, `Check-out cleaning (booking ${b.booking_no})`);

      const existing = get<{ invoice_no: string }>('SELECT invoice_no FROM invoices WHERE booking_id = ?', b.id);
      if (existing) {
        run(
          `UPDATE invoices SET room_amount = ?, other_amount = ?, discount = ?, taxable_amount = ?, tax_amount = ?,
                  total = ?, paid = ?, balance = ? WHERE booking_id = ?`,
          folio.roomAmount, folio.otherAmount, folio.discount, folio.taxable, folio.tax, folio.total, folio.netPaid,
          folio.balance, b.id,
        );
        return existing.invoice_no;
      }
      const no = nextInvoiceNo();
      run(
        `INSERT INTO invoices(invoice_no, booking_id, invoice_date, room_amount, other_amount, discount, taxable_amount,
                              tax_amount, total, paid, balance, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        no, b.id, todayStr(), folio.roomAmount, folio.otherAmount, folio.discount, folio.taxable, folio.tax,
        folio.total, folio.netPaid, folio.balance, user.id,
      );
      return no;
    });

    logActivity(user.id, 'Checked out guest', 'booking', b.id, `${b.booking_no} · Room ${b.room_number} · Invoice ${invoiceNo}`);
    return ok(`${b.guest_name} checked out. Invoice ${invoiceNo} generated.`);
  });
}

export async function reopenBookingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('billing_admin', (user) => {
    if (user.role !== 'admin' && user.role !== 'manager') fail('Only an administrator or manager can undo a check-out.');
    const id = formId(formData);
    const b = getBookingDetail(id);
    if (!b) fail('Booking not found.');
    if (b.status !== 'checked_out') fail('Only checked-out bookings can be reopened.');
    transaction(() => {
      const other = get<{ booking_no: string }>(
        `SELECT booking_no FROM bookings WHERE room_id = ? AND status = 'checked_in' AND id <> ?`,
        b.room_id, b.id,
      );
      if (other) fail(`Room ${b.room_number} is now occupied by booking ${other.booking_no}.`);
      run('DELETE FROM invoices WHERE booking_id = ?', b.id);
      run(
        `UPDATE bookings SET status = 'checked_in', actual_check_out = NULL, updated_at = datetime('now','localtime')
          WHERE id = ?`,
        b.id,
      );
      run(`UPDATE rooms SET status = 'occupied' WHERE id = ?`, b.room_id);
    });
    logActivity(user.id, 'Reopened booking (undo check-out)', 'booking', b.id, b.booking_no);
    return ok('Check-out undone. The booking is in-house again and its invoice was removed.');
  });
}

const cancelSchema = z.object({ id: zf.id, reason: zf.text(500) });

export async function cancelBookingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('frontdesk', (user) => {
    const d = parseForm(cancelSchema, formData);
    const b = getBookingDetail(d.id);
    if (!b) fail('Booking not found.');
    if (b.status !== 'confirmed') fail('Only confirmed (not yet arrived) bookings can be cancelled.');
    run(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now','localtime'), cancel_reason = ?,
              updated_at = datetime('now','localtime') WHERE id = ?`,
      d.reason, b.id,
    );
    logActivity(user.id, 'Cancelled booking', 'booking', b.id, `${b.booking_no} · ${d.reason}`);
    const folio = getFolio(b);
    return ok(
      folio.netPaid > 0
        ? `Booking cancelled. ${formatMoney(folio.netPaid, getSettings().currency_symbol)} was paid — record a refund if applicable.`
        : 'Booking cancelled.',
    );
  });
}

export async function markNoShowAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('frontdesk', (user) => {
    const id = formId(formData);
    const b = getBookingDetail(id);
    if (!b) fail('Booking not found.');
    if (b.status !== 'confirmed') fail('Only confirmed bookings can be marked as no-show.');
    run(`UPDATE bookings SET status = 'no_show', updated_at = datetime('now','localtime') WHERE id = ?`, id);
    logActivity(user.id, 'Marked no-show', 'booking', id, b.booking_no);
    return ok('Booking marked as no-show.');
  });
}

export async function markAllNoShowsAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  return runAction('frontdesk', (user) => {
    const r = run(
      `UPDATE bookings SET status = 'no_show', updated_at = datetime('now','localtime')
        WHERE status = 'confirmed' AND check_in_date < ?`,
      todayStr(),
    );
    if (r.changes) logActivity(user.id, 'Night audit: marked no-shows', 'booking', null, `${r.changes} booking(s)`);
    return ok(r.changes ? `${r.changes} overdue arrival(s) marked as no-show.` : 'No overdue arrivals found.');
  });
}

const changeRoomSchema = z.object({ id: zf.id, room_id: zf.id, apply_rate: zf.bool });

export async function changeRoomAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('frontdesk', (user) => {
    const d = parseForm(changeRoomSchema, formData);
    const b = getBookingDetail(d.id);
    if (!b) fail('Booking not found.');
    if (b.status !== 'confirmed' && b.status !== 'checked_in') fail('Room can only be changed for active bookings.');
    if (d.room_id === b.room_id) fail('Please choose a different room.');
    const room = loadRoom(d.room_id);
    const today = todayStr();
    const from = b.status === 'checked_in' && b.check_in_date < today ? today : b.check_in_date;
    const to = b.check_out_date > from ? b.check_out_date : addDays(from, 1);
    const settings = getSettings();
    const rate = d.apply_rate ? room.base_rate : b.rate_per_night;
    const extraBedRate = d.apply_rate ? room.extra_bed_rate : b.extra_bed_rate;

    transaction(() => {
      assertAvailable(room.id, from, to, b.id);
      if (b.status === 'checked_in') {
        if (room.status !== 'available') fail(`Room ${room.room_number} is ${labelize(room.status)}.`);
        run(`UPDATE rooms SET status = 'available', housekeeping_status = 'dirty' WHERE id = ?`, b.room_id);
        run(`UPDATE rooms SET status = 'occupied' WHERE id = ?`, room.id);
        createCleaningTask(b.room_id, user.id, `Guest moved to room ${room.room_number} (booking ${b.booking_no})`);
      }
      run(
        `UPDATE bookings SET room_id = ?, rate_per_night = ?, extra_bed_rate = ?, room_tax_rate = ?,
                updated_at = datetime('now','localtime') WHERE id = ?`,
        room.id, rate, extraBedRate, roomTaxRate(rate, settings), b.id,
      );
    });
    logActivity(user.id, 'Changed room', 'booking', b.id, `${b.booking_no} · ${b.room_number} → ${room.room_number}`);
    return ok(`Room changed from ${b.room_number} to ${room.room_number}.`);
  });
}

// ---------------------------------------------------------------- folio

const chargeSchema = z.object({
  booking_id: zf.id,
  charge_date: zf.date,
  category: zf.enumOf(CHARGE_CATEGORY_VALUES),
  description: zf.text(200),
  quantity: zf.quantity,
  unit_price: zf.money,
  tax_rate: zf.percent,
});

export async function addChargeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('billing', (user) => {
    const d = parseForm(chargeSchema, formData);
    const b = getBookingDetail(d.booking_id);
    if (!b) fail('Booking not found.');
    if (b.status !== 'confirmed' && b.status !== 'checked_in') fail('Charges can only be added to active bookings.');
    const taxRate = effectiveTaxRate(d.tax_rate, getSettings());
    const amount = round2(d.quantity * d.unit_price);
    const tax = round2((amount * taxRate) / 100);
    run(
      `INSERT INTO folio_charges(booking_id, charge_date, category, description, quantity, unit_price, amount, tax_rate,
                                 tax_amount, total, source, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`,
      b.id, d.charge_date, d.category, d.description, d.quantity, d.unit_price, amount, taxRate, tax, round2(amount + tax), user.id,
    );
    logActivity(user.id, 'Posted charge', 'booking', b.id, `${b.booking_no} · ${d.description} · ${formatMoney(amount)}`);
    return ok('Charge added to folio.');
  });
}

const voidSchema = z.object({ charge_id: zf.id, reason: zf.text(300) });

export async function voidChargeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('billing_admin', (user) => {
    const d = parseForm(voidSchema, formData);
    const charge = get<{ booking_id: number; description: string; amount: number; is_void: number }>(
      'SELECT booking_id, description, amount, is_void FROM folio_charges WHERE id = ?',
      d.charge_id,
    );
    if (!charge) fail('Charge not found.');
    if (charge.is_void) fail('This charge is already void.');
    const b = getBookingDetail(charge.booking_id)!;
    if (b.status !== 'confirmed' && b.status !== 'checked_in') fail('Charges cannot be changed after check-out.');
    run('UPDATE folio_charges SET is_void = 1, void_reason = ? WHERE id = ?', d.reason, d.charge_id);
    logActivity(user.id, 'Voided charge', 'booking', b.id, `${b.booking_no} · ${charge.description} · ${formatMoney(charge.amount)} · ${d.reason}`);
    return ok('Charge voided.');
  });
}

const paymentSchema = z.object({
  booking_id: zf.id,
  type: zf.enumOf(['payment', 'refund'] as const),
  amount: zf.positiveMoney,
  method: zf.enumOf(PAYMENT_METHOD_VALUES),
  payment_date: zf.optionalDate,
  reference: zf.optionalText(100),
  notes: zf.optionalText(300),
});

export async function addPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('billing', (user) => {
    const d = parseForm(paymentSchema, formData);
    const b = getBookingDetail(d.booking_id);
    if (!b) fail('Booking not found.');
    const currency = getSettings().currency_symbol;
    if (d.type === 'refund') {
      const folio = getFolio(b, currency);
      if (d.amount > folio.netPaid + 0.001)
        fail(`Refund cannot be more than the amount paid (${formatMoney(folio.netPaid, currency)}).`);
    }
    const paymentDate = d.payment_date ?? todayStr();
    if (paymentDate > todayStr()) fail('Payment date cannot be in the future.');
    const p = transaction(() => insertPayment(b.id, d.type, d.amount, d.method, d.reference, d.notes, user.id, paymentDate));
    // Keep the invoice snapshot in sync for checked-out bookings.
    if (b.status === 'checked_out') {
      const folio = getFolio(b, currency);
      run('UPDATE invoices SET paid = ?, balance = ? WHERE booking_id = ?', folio.netPaid, folio.balance, b.id);
    }
    logActivity(user.id, d.type === 'refund' ? 'Recorded refund' : 'Recorded payment', 'booking', b.id,
      `${p.receiptNo} · ${b.booking_no} · ${formatMoney(d.amount, currency)} (${labelize(d.method)})`);
    return ok(`${d.type === 'refund' ? 'Refund' : 'Payment'} of ${formatMoney(d.amount, currency)} recorded (${p.receiptNo}).`);
  });
}

export async function deletePaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('billing_admin', (user) => {
    const id = formId(formData, 'payment_id');
    const p = get<{ receipt_no: string; booking_id: number | null; amount: number; type: string }>(
      'SELECT receipt_no, booking_id, amount, type FROM payments WHERE id = ?',
      id,
    );
    if (!p) fail('Payment not found.');
    run('DELETE FROM payments WHERE id = ?', id);
    if (p.booking_id) {
      const b = getBookingDetail(p.booking_id);
      if (b?.status === 'checked_out') {
        const folio = getFolio(b);
        run('UPDATE invoices SET paid = ?, balance = ? WHERE booking_id = ?', folio.netPaid, folio.balance, b.id);
      }
    }
    logActivity(user.id, 'Deleted payment', 'booking', p.booking_id, `${p.receipt_no} · ${labelize(p.type)} ${formatMoney(p.amount)}`);
    return ok(`Payment ${p.receipt_no} deleted.`);
  });
}


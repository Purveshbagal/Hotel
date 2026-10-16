import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { BOOKING_SOURCES, EXPENSE_CATEGORIES, ID_TYPES, PAYMENT_METHODS, optionLabel } from '@/lib/constants';
import { all } from '@/lib/db';
import { can, type Permission } from '@/lib/permissions';
import { occupancySeries } from '@/lib/services/reports';
import { getSettings } from '@/lib/settings';
import { addDays, diffDays, isDateStr, labelize, monthStart, nightsBetween, round2, todayStr } from '@/lib/utils';

type Cell = string | number | null | undefined;

function csv(headers: string[], rows: Cell[][]): string {
  const esc = (v: Cell) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    // Prevent CSV formula injection when opened in Excel.
    if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

const PERMS: Record<string, Permission[]> = {
  bookings: ['reports'],
  payments: ['reports', 'billing'],
  invoices: ['reports', 'billing'],
  'guest-register': ['reports', 'guests'],
  guests: ['reports', 'guests'],
  expenses: ['reports', 'expenses'],
  restaurant: ['reports'],
  occupancy: ['reports'],
};

export async function GET(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const user = await getCurrentUser();
  const perms = PERMS[type];
  if (!perms) return NextResponse.json({ error: 'Unknown export' }, { status: 404 });
  if (!user || !perms.some((p) => can(user.role, p))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const sp = new URL(request.url).searchParams;
  const today = todayStr();
  let from = isDateStr(sp.get('from')) ? sp.get('from')! : monthStart(today);
  const to = isDateStr(sp.get('to')) ? sp.get('to')! : today;
  if (diffDays(from, to) > 3660) from = addDays(to, -3660);
  const settings = getSettings();

  let headers: string[] = [];
  let rows: Cell[][] = [];

  switch (type) {
    case 'bookings': {
      headers = ['Booking No', 'Status', 'Guest', 'Phone', 'Room', 'Room Type', 'Check-in', 'Check-out', 'Nights', 'Adults', 'Children', 'Rate/Night', 'Extra Beds', 'Discount', 'Source', 'Created'];
      rows = all<Record<string, Cell>>(
        `SELECT b.*, g.name AS guest, g.phone, r.room_number, rt.name AS type_name
           FROM bookings b JOIN guests g ON g.id = b.guest_id JOIN rooms r ON r.id = b.room_id JOIN room_types rt ON rt.id = r.room_type_id
          WHERE b.check_in_date BETWEEN ? AND ? ORDER BY b.check_in_date`,
        from, to,
      ).map((b) => [
        b.booking_no, labelize(String(b.status)), b.guest, b.phone, b.room_number, b.type_name, b.check_in_date, b.check_out_date,
        nightsBetween(String(b.check_in_date), String(b.check_out_date)), b.adults, b.children, b.rate_per_night, b.extra_beds,
        b.discount_amount, optionLabel(BOOKING_SOURCES, String(b.source)), b.created_at,
      ]);
      break;
    }
    case 'payments': {
      headers = ['Receipt No', 'Date', 'Type', 'Method', 'Amount', 'Booking', 'Guest', 'Reference', 'Notes', 'Received By'];
      rows = all<Record<string, Cell>>(
        `SELECT p.*, b.booking_no, g.name AS guest, u.name AS received_by_name
           FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id LEFT JOIN guests g ON g.id = b.guest_id LEFT JOIN users u ON u.id = p.received_by
          WHERE p.payment_date BETWEEN ? AND ? ORDER BY p.payment_date, p.id`,
        from, to,
      ).map((p) => [
        p.receipt_no, p.payment_date, labelize(String(p.type)), optionLabel(PAYMENT_METHODS, String(p.method)),
        p.type === 'refund' ? -Number(p.amount) : p.amount, p.booking_no, p.guest, p.reference, p.notes, p.received_by_name,
      ]);
      break;
    }
    case 'invoices': {
      const split = settings.split_tax === '1';
      headers = ['Invoice No', 'Invoice Date', 'Guest', 'Company', 'Guest GSTIN', 'Booking', 'Room Charges', 'Other Charges', 'Discount', 'Taxable Value',
        ...(split ? ['CGST', 'SGST'] : [settings.tax_label]), 'Total Tax', 'Invoice Total'];
      rows = all<Record<string, Cell>>(
        `SELECT i.*, g.name AS guest, g.company_name, g.company_gstin, b.booking_no
           FROM invoices i JOIN bookings b ON b.id = i.booking_id JOIN guests g ON g.id = b.guest_id
          WHERE i.invoice_date BETWEEN ? AND ? ORDER BY i.invoice_date, i.id`,
        from, to,
      ).map((i) => {
        const tax = Number(i.tax_amount);
        return [
          i.invoice_no, i.invoice_date, i.guest, i.company_name, i.company_gstin, i.booking_no, i.room_amount, i.other_amount, i.discount,
          i.taxable_amount, ...(split ? [round2(tax / 2), round2(tax - round2(tax / 2))] : [tax]), tax, i.total,
        ];
      });
      break;
    }
    case 'guest-register': {
      headers = ['Booking No', 'Guest Name', 'Gender', 'Nationality', 'ID Type', 'ID Number', 'Phone', 'Address', 'City', 'State', 'Country', 'Room', 'Adults', 'Children', 'Arrival', 'Departure', 'Status'];
      rows = all<Record<string, Cell>>(
        `SELECT b.booking_no, b.adults, b.children, b.actual_check_in, b.actual_check_out, b.check_in_date, b.check_out_date, b.status,
                g.*, r.room_number
           FROM bookings b JOIN guests g ON g.id = b.guest_id JOIN rooms r ON r.id = b.room_id
          WHERE b.status IN ('checked_in','checked_out') AND b.check_in_date <= ? AND b.check_out_date >= ?
          ORDER BY b.check_in_date, r.room_number`,
        to, from,
      ).map((r) => [
        r.booking_no, r.name, labelize(String(r.gender ?? '')), r.nationality, optionLabel(ID_TYPES, r.id_type as string), r.id_number, r.phone,
        r.address, r.city, r.state, r.country, r.room_number, r.adults, r.children, r.actual_check_in ?? r.check_in_date,
        r.actual_check_out ?? r.check_out_date, labelize(String(r.status)),
      ]);
      break;
    }
    case 'guests': {
      headers = ['Name', 'Phone', 'Email', 'Gender', 'Date of Birth', 'Nationality', 'ID Type', 'ID Number', 'Address', 'City', 'State', 'Country', 'PIN', 'Company', 'GSTIN', 'VIP', 'Blacklisted', 'Created'];
      rows = all<Record<string, Cell>>('SELECT * FROM guests ORDER BY name').map((g) => [
        g.name, g.phone, g.email, labelize(String(g.gender ?? '')), g.date_of_birth, g.nationality, optionLabel(ID_TYPES, g.id_type as string), g.id_number,
        g.address, g.city, g.state, g.country, g.pincode, g.company_name, g.company_gstin, g.is_vip ? 'Yes' : 'No', g.is_blacklisted ? 'Yes' : 'No', g.created_at,
      ]);
      break;
    }
    case 'expenses': {
      headers = ['Date', 'Category', 'Description', 'Amount', 'Paid Via', 'Vendor', 'Reference', 'Recorded By'];
      rows = all<Record<string, Cell>>(
        `SELECT e.*, u.name AS user_name FROM expenses e LEFT JOIN users u ON u.id = e.created_by
          WHERE e.expense_date BETWEEN ? AND ? ORDER BY e.expense_date`,
        from, to,
      ).map((e) => [
        e.expense_date, optionLabel(EXPENSE_CATEGORIES, String(e.category)), e.description, e.amount, optionLabel(PAYMENT_METHODS, String(e.payment_method)),
        e.vendor, e.reference, e.user_name,
      ]);
      break;
    }
    case 'restaurant': {
      headers = ['Order No', 'Date', 'Type', 'Room', 'Table', 'Customer', 'Status', 'Subtotal', 'Tax', 'Total', 'Settlement', 'Payment Method'];
      rows = all<Record<string, Cell>>(
        `SELECT o.*, r.room_number FROM restaurant_orders o LEFT JOIN bookings b ON b.id = o.booking_id LEFT JOIN rooms r ON r.id = b.room_id
          WHERE date(o.created_at) BETWEEN ? AND ? ORDER BY o.id`,
        from, to,
      ).map((o) => [
        o.order_no, o.created_at, labelize(String(o.order_type)), o.room_number, o.table_no, o.customer_name, labelize(String(o.status)), o.subtotal, o.tax_amount,
        o.total, o.settlement === 'room' ? 'Charged to room' : o.settlement === 'paid' ? 'Paid' : '', o.payment_method ? optionLabel(PAYMENT_METHODS, String(o.payment_method)) : '',
      ]);
      break;
    }
    case 'occupancy': {
      headers = ['Date', 'Rooms Occupied', 'Total Rooms', 'Occupancy %', 'Room Revenue'];
      rows = occupancySeries(from, diffDays(from, to) > 366 ? addDays(from, 366) : to).map((d) => [d.date, d.occupied, d.totalRooms, round2(d.occupancy), d.revenue]);
      break;
    }
  }

  return new NextResponse(csv(headers, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${type}_${from}_to_${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

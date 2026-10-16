import { all, get, scalar } from '../db';
import { datesBetween, round2 } from '../utils';

export function collectionsByMethod(from: string, to: string) {
  const rooms = all<{ method: string; amount: number }>(
    `SELECT method, SUM(CASE WHEN type = 'payment' THEN amount ELSE -amount END) AS amount
       FROM payments WHERE payment_date BETWEEN ? AND ? GROUP BY method`,
    from, to,
  );
  const restaurant = all<{ method: string; amount: number }>(
    `SELECT p.method, SUM(p.amount) AS amount FROM restaurant_payments p JOIN restaurant_orders o ON o.id = p.order_id
      WHERE o.status = 'completed' AND o.settlement = 'paid' AND date(o.completed_at) BETWEEN ? AND ? GROUP BY p.method`,
    from, to,
  );
  const map = new Map<string, { rooms: number; restaurant: number }>();
  for (const r of rooms) map.set(r.method, { rooms: round2(r.amount), restaurant: 0 });
  for (const r of restaurant) {
    const e = map.get(r.method) ?? { rooms: 0, restaurant: 0 };
    e.restaurant = round2(r.amount);
    map.set(r.method, e);
  }
  return [...map.entries()].map(([method, v]) => ({ method, ...v, total: round2(v.rooms + v.restaurant) }));
}

export function invoiceSummary(from: string, to: string) {
  return get<{ count: number; room: number; other: number; discount: number; taxable: number; tax: number; total: number }>(
    `SELECT COUNT(*) AS count, COALESCE(SUM(room_amount), 0) AS room, COALESCE(SUM(other_amount), 0) AS other,
            COALESCE(SUM(discount), 0) AS discount, COALESCE(SUM(taxable_amount), 0) AS taxable,
            COALESCE(SUM(tax_amount), 0) AS tax, COALESCE(SUM(total), 0) AS total
       FROM invoices WHERE invoice_date BETWEEN ? AND ?`,
    from, to,
  )!;
}

export function occupancySeries(from: string, to: string) {
  const totalRooms = scalar('SELECT COUNT(*) FROM rooms WHERE is_active = 1');
  return datesBetween(from, to).map((d) => {
    const row = get<{ n: number; rev: number }>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(rate_per_night + extra_beds * extra_bed_rate), 0) AS rev
         FROM bookings WHERE status IN ('checked_in','checked_out') AND check_in_date <= ? AND check_out_date > ?`,
      d, d,
    )!;
    return { date: d, occupied: row.n, revenue: round2(row.rev), totalRooms, occupancy: totalRooms ? (row.n / totalRooms) * 100 : 0 };
  });
}

export function dailyCollections(from: string, to: string) {
  const pay = new Map(
    all<{ d: string; amount: number }>(
      `SELECT payment_date AS d, SUM(CASE WHEN type = 'payment' THEN amount ELSE -amount END) AS amount
         FROM payments WHERE payment_date BETWEEN ? AND ? GROUP BY payment_date`,
      from, to,
    ).map((r) => [r.d, r.amount]),
  );
  const food = new Map(
    all<{ d: string; amount: number }>(
      `SELECT date(completed_at) AS d, SUM(total) AS amount FROM restaurant_orders
        WHERE status = 'completed' AND settlement = 'paid' AND date(completed_at) BETWEEN ? AND ? GROUP BY date(completed_at)`,
      from, to,
    ).map((r) => [r.d, r.amount]),
  );
  const exp = new Map(
    all<{ d: string; amount: number }>(
      'SELECT expense_date AS d, SUM(amount) AS amount FROM expenses WHERE expense_date BETWEEN ? AND ? GROUP BY expense_date',
      from, to,
    ).map((r) => [r.d, r.amount]),
  );
  return datesBetween(from, to).map((d) => ({
    date: d,
    collections: round2((pay.get(d) ?? 0) + (food.get(d) ?? 0)),
    expenses: round2(exp.get(d) ?? 0),
  }));
}

export function bookingsBySource(from: string, to: string) {
  return all<{ source: string; bookings: number; nights: number; cancelled: number }>(
    `SELECT source, COUNT(*) AS bookings,
            SUM(CASE WHEN status NOT IN ('cancelled','no_show') THEN julianday(check_out_date) - julianday(check_in_date) ELSE 0 END) AS nights,
            SUM(CASE WHEN status IN ('cancelled','no_show') THEN 1 ELSE 0 END) AS cancelled
       FROM bookings WHERE date(created_at) BETWEEN ? AND ? GROUP BY source ORDER BY bookings DESC`,
    from, to,
  );
}

export function expensesByCategory(from: string, to: string) {
  return all<{ category: string; amount: number; count: number }>(
    `SELECT category, SUM(amount) AS amount, COUNT(*) AS count FROM expenses
      WHERE expense_date BETWEEN ? AND ? GROUP BY category ORDER BY amount DESC`,
    from, to,
  );
}

export function restaurantSales(from: string, to: string) {
  return all<{ order_type: string; orders: number; subtotal: number; tax: number; total: number }>(
    `SELECT order_type, COUNT(*) AS orders, SUM(subtotal) AS subtotal, SUM(tax_amount) AS tax, SUM(total) AS total
       FROM restaurant_orders WHERE status = 'completed' AND date(completed_at) BETWEEN ? AND ?
      GROUP BY order_type`,
    from, to,
  );
}

export function topMenuItems(from: string, to: string, limit = 10) {
  return all<{ name: string; qty: number; amount: number }>(
    `SELECT i.name, SUM(i.quantity) AS qty, SUM(i.amount) AS amount
       FROM restaurant_order_items i JOIN restaurant_orders o ON o.id = i.order_id
      WHERE o.status = 'completed' AND date(o.completed_at) BETWEEN ? AND ?
      GROUP BY i.name ORDER BY qty DESC LIMIT ?`,
    from, to, limit,
  );
}

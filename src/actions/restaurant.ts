'use server';

import { z } from 'zod';
import type { ActionState } from '@/lib/action-types';
import { fail, formId, logActivity, ok, parseForm, runAction, zf } from '@/lib/action';
import { all, get, run, transaction } from '@/lib/db';
import { ORDER_TYPES, PAYMENT_METHODS } from '@/lib/constants';
import { nextOrderNo } from '@/lib/services/numbering';
import { effectiveTaxRate, getSettings } from '@/lib/settings';
import type { MenuItem, OrderItem, RestaurantOrder } from '@/lib/types';
import { formatMoney, labelize, round2, todayStr } from '@/lib/utils';

const PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map((m) => m.value) as [string, ...string[]];

// ---------------------------------------------------------------- menu

const menuSchema = z.object({
  id: zf.optionalId,
  name: zf.text(120),
  category: zf.text(60),
  description: zf.optionalText(300),
  price: zf.money,
  tax_rate: zf.percent,
  is_veg: zf.bool,
  is_available: zf.bool,
});

export async function saveMenuItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('menu', (user) => {
    const d = parseForm(menuSchema, formData);
    if (d.id) {
      const r = run(
        `UPDATE menu_items SET name = ?, category = ?, description = ?, price = ?, tax_rate = ?, is_veg = ?, is_available = ?
          WHERE id = ?`,
        d.name, d.category, d.description, d.price, d.tax_rate, d.is_veg, d.is_available, d.id,
      );
      if (!r.changes) fail('Menu item not found.');
      logActivity(user.id, 'Updated menu item', 'menu_item', d.id, d.name);
      return ok('Menu item updated.');
    }
    const r = run(
      `INSERT INTO menu_items(name, category, description, price, tax_rate, is_veg, is_available) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      d.name, d.category, d.description, d.price, d.tax_rate, d.is_veg, d.is_available,
    );
    logActivity(user.id, 'Created menu item', 'menu_item', r.lastInsertRowid, d.name);
    return ok('Menu item added.');
  });
}

export async function deleteMenuItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('menu', (user) => {
    const id = formId(formData);
    const item = get<{ name: string }>('SELECT name FROM menu_items WHERE id = ?', id);
    if (!item) fail('Menu item not found.');
    run('DELETE FROM menu_items WHERE id = ?', id);
    logActivity(user.id, 'Deleted menu item', 'menu_item', id, item.name);
    return ok('Menu item deleted.');
  });
}

export async function toggleMenuItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('menu', () => {
    const id = formId(formData);
    const r = run('UPDATE menu_items SET is_available = 1 - is_available WHERE id = ?', id);
    if (!r.changes) fail('Menu item not found.');
    return ok('Availability updated.');
  });
}

// ---------------------------------------------------------------- orders

function recalcOrder(orderId: number) {
  const discount = get<{ discount_percent: number }>('SELECT discount_percent FROM restaurant_orders WHERE id = ?', orderId)!.discount_percent;
  for (const item of all<OrderItem>('SELECT * FROM restaurant_order_items WHERE order_id = ?', orderId)) {
    const amount = round2(item.quantity * item.unit_price * (1 - discount / 100));
    run('UPDATE restaurant_order_items SET amount = ?, tax_amount = ? WHERE id = ?', amount, round2(amount * item.tax_rate / 100), item.id);
  }
  const totals = get<{ subtotal: number; tax: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS subtotal, COALESCE(SUM(tax_amount), 0) AS tax
       FROM restaurant_order_items WHERE order_id = ?`,
    orderId,
  )!;
  const subtotal = round2(totals.subtotal);
  const tax = round2(totals.tax);
  run('UPDATE restaurant_orders SET subtotal = ?, tax_amount = ?, total = ? WHERE id = ?', subtotal, tax, round2(subtotal + tax), orderId);
}

function insertOrderItem(orderId: number, item: MenuItem, quantity: number, notes: string | null, batch = 1) {
  const taxRate = effectiveTaxRate(item.tax_rate, getSettings());
  const amount = round2(item.price * quantity);
  run(
    `INSERT INTO restaurant_order_items(order_id, menu_item_id, name, quantity, unit_price, tax_rate, amount, tax_amount, notes, kot_batch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    orderId, item.id, item.name, quantity, item.price, taxRate, amount, round2((amount * taxRate) / 100), notes, batch,
  );
}

function loadOpenOrder(orderId: number): RestaurantOrder {
  const order = get<RestaurantOrder>('SELECT * FROM restaurant_orders WHERE id = ?', orderId);
  if (!order) fail('Order not found.');
  if (order.status === 'completed' || order.status === 'cancelled') fail(`This order is already ${order.status}.`);
  return order;
}

function assertInHouse(bookingId: number) {
  const b = get<{ status: string }>('SELECT status FROM bookings WHERE id = ?', bookingId);
  if (!b || b.status !== 'checked_in') fail('The selected room/guest is not checked in.');
}

const orderSchema = z.object({
  order_type: zf.enumOf(ORDER_TYPES),
  booking_id: zf.optionalId,
  table_no: zf.optionalText(20),
  customer_name: zf.optionalText(100),
  notes: zf.optionalText(500),
  items: z.string().min(2, 'Add at least one item'),
});

const itemsSchema = z
  .array(
    z.object({
      menu_item_id: z.number().int().positive(),
      quantity: z.number().int().min(1).max(999),
      notes: z.string().max(200).optional(),
    }),
  )
  .min(1, 'Add at least one item to the order')
  .max(100);

export async function createOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('restaurant', (user) => {
    const d = parseForm(orderSchema, formData);
    let parsed: unknown;
    try {
      parsed = JSON.parse(d.items);
    } catch {
      fail('Invalid order items.');
    }
    const items = itemsSchema.safeParse(parsed);
    if (!items.success) fail(items.error.issues[0]?.message ?? 'Invalid order items.');
    if (d.order_type === 'room_service' && !d.booking_id) fail('Select the room for this room-service order.');
    if (d.order_type === 'dine_in' && !d.table_no) fail('Enter the table number.');
    if (d.booking_id) assertInHouse(d.booking_id);

    const menu = new Map(all<MenuItem>('SELECT * FROM menu_items').map((m) => [m.id, m]));
    for (const line of items.data) {
      const m = menu.get(line.menu_item_id);
      if (!m) fail('One of the items no longer exists on the menu.');
      if (!m.is_available) fail(`${m.name} is currently not available.`);
    }

    const { id, orderNo } = transaction(() => {
      if (d.order_type === 'dine_in') assertTableAvailable(d.table_no!);
      const orderNo = nextOrderNo();
      const id = Number(
        run(
          `INSERT INTO restaurant_orders(order_no, order_type, booking_id, table_no, customer_name, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          orderNo, d.order_type, d.order_type === 'takeaway' ? null : d.booking_id, d.order_type === 'dine_in' ? d.table_no : null, d.customer_name, d.notes, user.id,
        ).lastInsertRowid,
      );
      for (const line of items.data) insertOrderItem(id, menu.get(line.menu_item_id)!, line.quantity, line.notes?.trim() || null);
      recalcOrder(id);
      if (d.order_type === 'dine_in') run("UPDATE restaurant_tables SET status = 'available', reservation_name = NULL, reservation_phone = NULL, reservation_at = NULL WHERE table_no = ? COLLATE NOCASE", d.table_no);
      return { id, orderNo };
    });
    logActivity(user.id, 'Created restaurant order', 'order', id, `${orderNo} · ${labelize(d.order_type)}`);
    return ok(`Order ${orderNo} created.`, `/restaurant/${id}`);
  });
}

const addItemSchema = z.object({
  order_id: zf.id,
  menu_item_id: zf.id,
  quantity: zf.int(1, 999),
  notes: zf.optionalText(200),
});

export async function addOrderItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('restaurant', () => {
    const d = parseForm(addItemSchema, formData);
    loadOpenOrder(d.order_id);
    const item = get<MenuItem>('SELECT * FROM menu_items WHERE id = ?', d.menu_item_id);
    if (!item) fail('Menu item not found.');
    if (!item.is_available) fail(`${item.name} is currently not available.`);
    transaction(() => {
      const batch = get<{ n: number }>('SELECT COALESCE(MAX(kot_batch), 0) + 1 AS n FROM restaurant_order_items WHERE order_id = ?', d.order_id)!.n;
      insertOrderItem(d.order_id, item, d.quantity, d.notes, batch);
      run("UPDATE restaurant_orders SET status = 'pending' WHERE id = ? AND status = 'served'", d.order_id);
      recalcOrder(d.order_id);
    });
    return ok(`${item.name} × ${d.quantity} added.`);
  });
}

export async function removeOrderItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('restaurant', () => {
    const id = formId(formData, 'item_id');
    const item = get<OrderItem>('SELECT * FROM restaurant_order_items WHERE id = ?', id);
    if (!item) fail('Item not found.');
    loadOpenOrder(item.order_id);
    transaction(() => {
      run('DELETE FROM restaurant_order_items WHERE id = ?', id);
      recalcOrder(item.order_id);
    });
    return ok(`${item.name} removed.`);
  });
}

const statusSchema = z.object({ id: zf.id, status: zf.enumOf(['pending', 'preparing', 'served'] as const) });

export async function updateOrderStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('restaurant', (user) => {
    const d = parseForm(statusSchema, formData);
    const order = loadOpenOrder(d.id);
    transaction(() => {
      run('UPDATE restaurant_orders SET status = ? WHERE id = ?', d.status, d.id);
      run("UPDATE restaurant_order_items SET kitchen_status = ? WHERE order_id = ? AND kitchen_status <> 'served'", d.status, d.id);
    });
    logActivity(user.id, 'Updated order status', 'order', d.id, `${order.order_no} → ${labelize(d.status)}`);
    return ok(`Order marked ${labelize(d.status)}.`);
  });
}

const settleSchema = z.object({
  id: zf.id,
  settlement: zf.enumOf(['room', 'paid'] as const),
  booking_id: zf.optionalId,
  payment_method: z.string().optional(),
  second_method: zf.optionalText(30),
  second_amount: zf.money,
  cash_received: zf.money,
});

export async function settleOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('restaurant', (user) => transaction(() => {
    const d = parseForm(settleSchema, formData);
    const order = loadOpenOrder(d.id);
    const items = all<OrderItem>('SELECT * FROM restaurant_order_items WHERE order_id = ?', order.id);
    if (!items.length) fail('This order has no items.');
    const currency = getSettings().currency_symbol;

    if (d.settlement === 'room') {
      const bookingId = d.booking_id ?? order.booking_id;
      if (!bookingId) fail('Select the room to charge this order to.');
      assertInHouse(bookingId);
      transaction(() => {
        for (const it of items) {
          run(
            `INSERT INTO folio_charges(booking_id, charge_date, category, description, quantity, unit_price, amount,
                                       tax_rate, tax_amount, total, source, source_id, created_by)
             VALUES (?, ?, 'food', ?, ?, ?, ?, ?, ?, ?, 'restaurant', ?, ?)`,
            bookingId, todayStr(), `${it.name} (${order.order_no})${order.discount_percent ? ` - ${order.discount_percent}% discount` : ''}`, it.quantity, order.discount_percent ? round2(it.amount / it.quantity) : it.unit_price, it.amount, it.tax_rate,
            it.tax_amount, round2(it.amount + it.tax_amount), order.id, user.id,
          );
        }
        run(
          `UPDATE restaurant_orders SET status = 'completed', settlement = 'room', booking_id = ?,
                  completed_at = datetime('now','localtime') WHERE id = ?`,
          bookingId, order.id,
        );
      });
      logActivity(user.id, 'Posted order to room', 'order', order.id, `${order.order_no} · ${formatMoney(order.total, currency)}`);
      return ok(`Order ${order.order_no} posted to the room folio.`);
    }

    if (!d.payment_method || !PAYMENT_METHOD_VALUES.includes(d.payment_method)) fail('Choose a payment method.');
    if (d.second_amount > 0 && (!d.second_method || !PAYMENT_METHOD_VALUES.includes(d.second_method) || d.second_method === d.payment_method)) fail('Choose a different valid second payment method.');
    if (d.second_amount >= order.total && d.second_amount > 0) fail('The second payment must be less than the bill total.');
    const firstAmount = round2(order.total - d.second_amount);
    const cashAmount = d.payment_method === 'cash' ? firstAmount : d.second_method === 'cash' ? d.second_amount : 0;
    if (cashAmount > 0 && d.cash_received > 0 && d.cash_received < cashAmount) fail('Cash received is less than the cash payment.');
    transaction(() => {
      loadOpenOrder(order.id);
      run('INSERT INTO restaurant_payments(order_id, method, amount, received_by) VALUES (?, ?, ?, ?)', order.id, d.payment_method, firstAmount, user.id);
      if (d.second_amount > 0) run('INSERT INTO restaurant_payments(order_id, method, amount, received_by) VALUES (?, ?, ?, ?)', order.id, d.second_method, d.second_amount, user.id);
      run(
      `UPDATE restaurant_orders SET status = 'completed', settlement = 'paid', payment_method = ?,
              cash_received = ?, completed_at = datetime('now','localtime') WHERE id = ?`,
      d.second_amount > 0 ? 'split' : d.payment_method, cashAmount > 0 ? d.cash_received || cashAmount : null, order.id,
      );
    });
    logActivity(user.id, 'Settled order', 'order', order.id, `${order.order_no} · ${formatMoney(order.total, currency)} (${labelize(d.payment_method)})`);
    return ok(`Order ${order.order_no} settled — ${formatMoney(order.total, currency)} received.`);
  }));
}

export async function cancelOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('restaurant', (user) => {
    const id = formId(formData);
    const order = loadOpenOrder(id);
    run(`UPDATE restaurant_orders SET status = 'cancelled', completed_at = datetime('now','localtime') WHERE id = ?`, id);
    logActivity(user.id, 'Cancelled order', 'order', id, order.order_no);
    return ok(`Order ${order.order_no} cancelled.`);
  });
}

function assertTableAvailable(tableNo: string) {
  const table = get<{ status: string }>('SELECT status FROM restaurant_tables WHERE table_no = ? COLLATE NOCASE', tableNo);
  if (!table) fail('Choose a configured table from the floor board.');
  if (table.status === 'cleaning' || table.status === 'inactive') fail('This table is not ready for service.');
  if (get("SELECT id FROM restaurant_orders WHERE table_no = ? COLLATE NOCASE AND status IN ('pending','preparing','served')", tableNo))
    fail('This table already has an open order. Open that order to add items.');
}

const tableSchema = z.object({
  id: zf.optionalId, table_no: zf.text(20), area: zf.text(60), seats: zf.int(1, 30),
});
export async function saveTableAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('menu', (user) => {
    const d = parseForm(tableSchema, formData);
    const id = transaction(() => {
      if (d.id) {
        const old = get<{ table_no: string }>('SELECT table_no FROM restaurant_tables WHERE id = ?', d.id);
        if (!old) fail('Table not found.');
        if (old.table_no !== d.table_no && get("SELECT id FROM restaurant_orders WHERE table_no = ? COLLATE NOCASE AND status IN ('pending','preparing','served')", old.table_no)) fail('Settle the open order before renaming this table.');
        run('UPDATE restaurant_tables SET table_no = ?, area = ?, seats = ? WHERE id = ?', d.table_no, d.area, d.seats, d.id);
        return d.id;
      }
      return Number(run('INSERT INTO restaurant_tables(table_no, area, seats) VALUES (?, ?, ?)', d.table_no, d.area, d.seats).lastInsertRowid);
    });
    logActivity(user.id, 'Saved restaurant table', 'table', id, d.table_no);
    return ok('Table saved.');
  });
}
const tableStatusSchema = z.object({
  id: zf.id, status: zf.enumOf(['available', 'reserved', 'cleaning', 'inactive'] as const),
  reservation_name: zf.optionalText(100), reservation_phone: zf.optionalText(30), reservation_at: zf.optionalText(30),
});
export async function tableStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('restaurant', (user) => {
    const d = parseForm(tableStatusSchema, formData);
    if (d.status === 'reserved' && !d.reservation_name) fail('Enter the reservation name.');
    if (d.reservation_at && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d.reservation_at)) fail('Enter a valid reservation time.');
    transaction(() => {
      const t = get<{ table_no: string }>('SELECT table_no FROM restaurant_tables WHERE id = ?', d.id);
      if (!t) fail('Table not found.');
      if (get("SELECT id FROM restaurant_orders WHERE table_no = ? COLLATE NOCASE AND status IN ('pending','preparing','served')", t.table_no)) fail('Settle or transfer the open order first.');
      run('UPDATE restaurant_tables SET status = ?, reservation_name = ?, reservation_phone = ?, reservation_at = ? WHERE id = ?', d.status, d.status === 'reserved' ? d.reservation_name : null, d.status === 'reserved' ? d.reservation_phone : null, d.status === 'reserved' ? d.reservation_at : null, d.id);
    });
    logActivity(user.id, 'Changed table status', 'table', d.id, d.status);
    return ok('Table updated.');
  });
}
export async function transferTableAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('restaurant', (user) => {
    const d = parseForm(z.object({ id: zf.id, table_no: zf.text(20) }), formData);
    transaction(() => {
      const order = loadOpenOrder(d.id);
      if (order.order_type !== 'dine_in') fail('Only dine-in orders can be transferred.');
      assertTableAvailable(d.table_no);
      run('UPDATE restaurant_orders SET table_no = ? WHERE id = ?', d.table_no, d.id);
      run("UPDATE restaurant_tables SET status = 'available', reservation_name = NULL, reservation_phone = NULL, reservation_at = NULL WHERE table_no = ? COLLATE NOCASE", d.table_no);
    });
    logActivity(user.id, 'Transferred table', 'order', d.id, d.table_no);
    return ok('Order transferred.');
  });
}

export async function discountOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('billing_admin', (user) => {
    const d = parseForm(z.object({ id: zf.id, discount_percent: zf.percent, discount_reason: zf.text(200) }), formData);
    transaction(() => {
      loadOpenOrder(d.id);
      run('UPDATE restaurant_orders SET discount_percent = ?, discount_reason = ? WHERE id = ?', d.discount_percent, d.discount_reason, d.id);
      recalcOrder(d.id);
    });
    logActivity(user.id, 'Changed restaurant discount', 'order', d.id, `${d.discount_percent}%: ${d.discount_reason}`);
    return ok('Discount and tax totals updated.');
  });
}

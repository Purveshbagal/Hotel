'use server';

import { z } from 'zod';
import type { ActionState } from '@/lib/action-types';
import { fail, formId, logActivity, ok, parseForm, runAction, zf } from '@/lib/action';
import { get, run, transaction } from '@/lib/db';
import { EXPENSE_CATEGORIES, HK_TASK_TYPES, MAINTENANCE_STATUSES, PAYMENT_METHODS, PRIORITIES } from '@/lib/constants';
import { formatMoney, labelize, todayStr } from '@/lib/utils';

const HK_TYPES = HK_TASK_TYPES.map((t) => t.value) as [string, ...string[]];
const EXPENSE_CATS = EXPENSE_CATEGORIES.map((c) => c.value) as [string, ...string[]];
const METHODS = PAYMENT_METHODS.map((m) => m.value) as [string, ...string[]];

function assertUser(id: number | null) {
  if (id && !get('SELECT id FROM users WHERE id = ? AND is_active = 1', id)) fail('Selected staff member is not active.');
}

// ---------------------------------------------------------------- housekeeping

const taskSchema = z.object({
  id: zf.optionalId,
  room_id: zf.id,
  task_type: zf.enumOf(HK_TYPES),
  priority: zf.enumOf(PRIORITIES),
  assigned_to: zf.optionalId,
  notes: zf.optionalText(500),
});

export async function saveTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('housekeeping', (user) => {
    const d = parseForm(taskSchema, formData);
    const room = get<{ room_number: string }>('SELECT room_number FROM rooms WHERE id = ?', d.room_id);
    if (!room) fail('Room not found.');
    assertUser(d.assigned_to);
    if (d.id) {
      const r = run(
        'UPDATE housekeeping_tasks SET room_id = ?, task_type = ?, priority = ?, assigned_to = ?, notes = ? WHERE id = ?',
        d.room_id, d.task_type, d.priority, d.assigned_to, d.notes, d.id,
      );
      if (!r.changes) fail('Task not found.');
      return ok('Task updated.');
    }
    const r = run(
      `INSERT INTO housekeeping_tasks(room_id, task_type, priority, assigned_to, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
      d.room_id, d.task_type, d.priority, d.assigned_to, d.notes, user.id,
    );
    logActivity(user.id, 'Created housekeeping task', 'task', r.lastInsertRowid, `Room ${room.room_number} · ${labelize(d.task_type)}`);
    return ok(`Task created for room ${room.room_number}.`);
  });
}

const taskStatusSchema = z.object({ id: zf.id, status: zf.enumOf(['pending', 'in_progress', 'completed'] as const) });

export async function updateTaskStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('housekeeping', (user) => {
    const d = parseForm(taskStatusSchema, formData);
    const task = get<{ room_id: number; task_type: string; room_number: string }>(
      'SELECT t.room_id, t.task_type, r.room_number FROM housekeeping_tasks t JOIN rooms r ON r.id = t.room_id WHERE t.id = ?',
      d.id,
    );
    if (!task) fail('Task not found.');
    const cleaningTypes = ['cleaning', 'deep_cleaning', 'linen_change'];
    transaction(() => {
      if (d.status === 'in_progress') {
        run(`UPDATE housekeeping_tasks SET status = 'in_progress', started_at = datetime('now','localtime') WHERE id = ?`, d.id);
        if (cleaningTypes.includes(task.task_type))
          run(`UPDATE rooms SET housekeeping_status = 'in_progress' WHERE id = ?`, task.room_id);
      } else if (d.status === 'completed') {
        run(`UPDATE housekeeping_tasks SET status = 'completed', completed_at = datetime('now','localtime') WHERE id = ?`, d.id);
        if (task.task_type === 'inspection') run(`UPDATE rooms SET housekeeping_status = 'inspected' WHERE id = ?`, task.room_id);
        else if (cleaningTypes.includes(task.task_type))
          run(`UPDATE rooms SET housekeeping_status = 'clean' WHERE id = ?`, task.room_id);
      } else {
        run(`UPDATE housekeeping_tasks SET status = 'pending', started_at = NULL, completed_at = NULL WHERE id = ?`, d.id);
      }
    });
    logActivity(user.id, 'Updated housekeeping task', 'task', d.id, `Room ${task.room_number} · ${labelize(d.status)}`);
    return ok(`Task marked ${labelize(d.status)}.`);
  });
}

export async function deleteTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('housekeeping', () => {
    const r = run('DELETE FROM housekeeping_tasks WHERE id = ?', formId(formData));
    if (!r.changes) fail('Task not found.');
    return ok('Task deleted.');
  });
}

// ---------------------------------------------------------------- maintenance

const maintenanceSchema = z.object({
  id: zf.optionalId,
  room_id: zf.optionalId,
  title: zf.text(150),
  description: zf.optionalText(1000),
  priority: zf.enumOf(PRIORITIES),
  status: z.preprocess((v) => (v === '' ? undefined : v), zf.enumOf(MAINTENANCE_STATUSES).optional()),
  assigned_to: zf.optionalId,
  cost: zf.money,
  resolution: zf.optionalText(1000),
  block_room: zf.bool,
  release_room: zf.bool,
});

export async function saveMaintenanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('maintenance', (user) => {
    const d = parseForm(maintenanceSchema, formData);
    assertUser(d.assigned_to);
    const room = d.room_id ? get<{ id: number; room_number: string; status: string }>('SELECT id, room_number, status FROM rooms WHERE id = ?', d.room_id) : null;
    if (d.room_id && !room) fail('Room not found.');
    const notes: string[] = [];

    if (d.id) {
      const existing = get<{ status: string; resolved_at: string | null }>('SELECT status, resolved_at FROM maintenance_requests WHERE id = ?', d.id);
      if (!existing) fail('Request not found.');
      const status = d.status ?? existing.status;
      const resolving = (status === 'resolved' || status === 'closed') && !existing.resolved_at;
      transaction(() => {
        run(
          `UPDATE maintenance_requests SET room_id = ?, title = ?, description = ?, priority = ?, status = ?, assigned_to = ?,
                  cost = ?, resolution = ?,
                  resolved_at = CASE WHEN ? THEN datetime('now','localtime') WHEN ? IN ('open','in_progress') THEN NULL ELSE resolved_at END
            WHERE id = ?`,
          d.room_id, d.title, d.description, d.priority, status, d.assigned_to, d.cost, d.resolution, resolving, status, d.id,
        );
        if (d.release_room && room && (room.status === 'maintenance' || room.status === 'out_of_order')) {
          run(`UPDATE rooms SET status = 'available' WHERE id = ?`, room.id);
          notes.push(`room ${room.room_number} is available again`);
        }
      });
      logActivity(user.id, 'Updated maintenance request', 'maintenance', d.id, `${d.title} · ${labelize(status)}`);
      return ok(`Request updated${notes.length ? ` — ${notes.join(', ')}` : ''}.`);
    }

    const id = transaction(() => {
      const r = run(
        `INSERT INTO maintenance_requests(room_id, title, description, priority, assigned_to, cost, reported_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        d.room_id, d.title, d.description, d.priority, d.assigned_to, d.cost, user.id,
      );
      if (d.block_room && room) {
        if (room.status === 'occupied') notes.push(`room ${room.room_number} is occupied, so it was not blocked`);
        else {
          run(`UPDATE rooms SET status = 'maintenance' WHERE id = ?`, room.id);
          notes.push(`room ${room.room_number} blocked for maintenance`);
        }
      }
      return r.lastInsertRowid;
    });
    logActivity(user.id, 'Reported maintenance issue', 'maintenance', id, `${d.title}${room ? ` · Room ${room.room_number}` : ''}`);
    return ok(`Maintenance request created${notes.length ? ` — ${notes.join(', ')}` : ''}.`);
  });
}

export async function deleteMaintenanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('maintenance', (user) => {
    const id = formId(formData);
    const r = run('DELETE FROM maintenance_requests WHERE id = ?', id);
    if (!r.changes) fail('Request not found.');
    logActivity(user.id, 'Deleted maintenance request', 'maintenance', id);
    return ok('Request deleted.');
  });
}

// ---------------------------------------------------------------- expenses

const expenseSchema = z.object({
  id: zf.optionalId,
  expense_date: zf.date,
  category: zf.enumOf(EXPENSE_CATS),
  description: zf.text(200),
  amount: zf.positiveMoney,
  payment_method: zf.enumOf(METHODS),
  vendor: zf.optionalText(150),
  reference: zf.optionalText(100),
});

export async function saveExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('expenses', (user) => {
    const d = parseForm(expenseSchema, formData);
    if (d.expense_date > todayStr()) fail('Expense date cannot be in the future.');
    if (d.id) {
      const r = run(
        `UPDATE expenses SET expense_date = ?, category = ?, description = ?, amount = ?, payment_method = ?, vendor = ?,
                reference = ? WHERE id = ?`,
        d.expense_date, d.category, d.description, d.amount, d.payment_method, d.vendor, d.reference, d.id,
      );
      if (!r.changes) fail('Expense not found.');
      logActivity(user.id, 'Updated expense', 'expense', d.id, `${d.description} · ${formatMoney(d.amount)}`);
      return ok('Expense updated.');
    }
    const r = run(
      `INSERT INTO expenses(expense_date, category, description, amount, payment_method, vendor, reference, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      d.expense_date, d.category, d.description, d.amount, d.payment_method, d.vendor, d.reference, user.id,
    );
    logActivity(user.id, 'Recorded expense', 'expense', r.lastInsertRowid, `${d.description} · ${formatMoney(d.amount)}`);
    return ok('Expense recorded.');
  });
}

export async function deleteExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('expenses', (user) => {
    const id = formId(formData);
    const e = get<{ description: string; amount: number }>('SELECT description, amount FROM expenses WHERE id = ?', id);
    if (!e) fail('Expense not found.');
    run('DELETE FROM expenses WHERE id = ?', id);
    logActivity(user.id, 'Deleted expense', 'expense', id, `${e.description} · ${formatMoney(e.amount)}`);
    return ok('Expense deleted.');
  });
}

// ---------------------------------------------------------------- inventory

const itemSchema = z.object({
  id: zf.optionalId,
  name: zf.text(120),
  category: zf.text(60),
  unit: zf.text(20),
  quantity: zf.money,
  min_quantity: zf.money,
  unit_cost: zf.money,
  notes: zf.optionalText(500),
});

export async function saveInventoryItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('inventory', (user) => {
    const d = parseForm(itemSchema, formData);
    if (d.id) {
      const r = run(
        'UPDATE inventory_items SET name = ?, category = ?, unit = ?, min_quantity = ?, unit_cost = ?, notes = ? WHERE id = ?',
        d.name, d.category, d.unit, d.min_quantity, d.unit_cost, d.notes, d.id,
      );
      if (!r.changes) fail('Item not found.');
      return ok('Item updated.');
    }
    const id = transaction(() => {
      const r = run(
        `INSERT INTO inventory_items(name, category, unit, quantity, min_quantity, unit_cost, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        d.name, d.category, d.unit, d.quantity, d.min_quantity, d.unit_cost, d.notes,
      );
      if (d.quantity > 0)
        run(
          `INSERT INTO inventory_transactions(item_id, type, quantity, balance, notes, created_by) VALUES (?, 'in', ?, ?, 'Opening stock', ?)`,
          r.lastInsertRowid, d.quantity, d.quantity, user.id,
        );
      return r.lastInsertRowid;
    });
    logActivity(user.id, 'Created inventory item', 'inventory', id, d.name);
    return ok('Item added to inventory.');
  });
}

export async function deleteInventoryItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('inventory', (user) => {
    const id = formId(formData);
    const item = get<{ name: string }>('SELECT name FROM inventory_items WHERE id = ?', id);
    if (!item) fail('Item not found.');
    run('DELETE FROM inventory_items WHERE id = ?', id);
    logActivity(user.id, 'Deleted inventory item', 'inventory', id, item.name);
    return ok('Item deleted.');
  });
}

const stockSchema = z.object({
  item_id: zf.id,
  type: zf.enumOf(['in', 'out', 'adjust'] as const),
  quantity: z.coerce.number({ error: 'must be a number' }).min(0, 'cannot be negative').max(1e7),
  notes: zf.optionalText(300),
});

export async function stockMovementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('inventory', (user) => {
    const d = parseForm(stockSchema, formData);
    const item = get<{ name: string; quantity: number; unit: string }>('SELECT name, quantity, unit FROM inventory_items WHERE id = ?', d.item_id);
    if (!item) fail('Item not found.');
    if (d.type !== 'adjust' && d.quantity <= 0) fail('Quantity must be greater than zero.');
    let balance: number;
    let delta: number;
    if (d.type === 'in') {
      balance = item.quantity + d.quantity;
      delta = d.quantity;
    } else if (d.type === 'out') {
      if (d.quantity > item.quantity) fail(`Only ${item.quantity} ${item.unit} of ${item.name} in stock.`);
      balance = item.quantity - d.quantity;
      delta = d.quantity;
    } else {
      balance = d.quantity;
      delta = d.quantity - item.quantity;
    }
    balance = Math.round(balance * 1000) / 1000;
    transaction(() => {
      run('UPDATE inventory_items SET quantity = ? WHERE id = ?', balance, d.item_id);
      run(
        'INSERT INTO inventory_transactions(item_id, type, quantity, balance, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        d.item_id, d.type, delta, balance, d.notes, user.id,
      );
    });
    logActivity(user.id, 'Stock movement', 'inventory', d.item_id, `${item.name} · ${labelize(d.type)} ${delta} ${item.unit} → ${balance}`);
    return ok(`${item.name}: stock is now ${balance} ${item.unit}.`);
  });
}

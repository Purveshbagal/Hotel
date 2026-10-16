'use server';

import { z } from 'zod';
import type { ActionState } from '@/lib/action-types';
import { fail, formId, logActivity, ok, parseForm, runAction, zf } from '@/lib/action';
import { get, run, scalar, transaction } from '@/lib/db';
import { HK_STATUSES } from '@/lib/constants';
import { labelize } from '@/lib/utils';

const roomTypeSchema = z.object({
  id: zf.optionalId,
  name: zf.text(80),
  description: zf.optionalText(1000),
  base_rate: zf.money,
  extra_bed_rate: zf.money,
  max_adults: zf.int(1, 20),
  max_children: zf.int(0, 20),
  amenities: zf.optionalText(1000),
  is_active: zf.bool,
});

export async function saveRoomTypeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('rooms_manage', (user) => {
    const d = parseForm(roomTypeSchema, formData);
    if (d.id) {
      const r = run(
        `UPDATE room_types SET name = ?, description = ?, base_rate = ?, extra_bed_rate = ?, max_adults = ?,
                max_children = ?, amenities = ?, is_active = ? WHERE id = ?`,
        d.name, d.description, d.base_rate, d.extra_bed_rate, d.max_adults, d.max_children, d.amenities, d.is_active, d.id,
      );
      if (!r.changes) fail('Room type not found.');
      logActivity(user.id, 'Updated room type', 'room_type', d.id, d.name);
      return ok('Room type updated.');
    }
    const r = run(
      `INSERT INTO room_types(name, description, base_rate, extra_bed_rate, max_adults, max_children, amenities, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      d.name, d.description, d.base_rate, d.extra_bed_rate, d.max_adults, d.max_children, d.amenities, d.is_active,
    );
    logActivity(user.id, 'Created room type', 'room_type', r.lastInsertRowid, d.name);
    return ok('Room type created.');
  });
}

export async function deleteRoomTypeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('rooms_manage', (user) => {
    const id = formId(formData);
    const rooms = scalar('SELECT COUNT(*) FROM rooms WHERE room_type_id = ?', id);
    if (rooms > 0) fail(`This room type has ${rooms} room(s). Move or delete them first, or mark the type inactive.`);
    const type = get<{ name: string }>('SELECT name FROM room_types WHERE id = ?', id);
    if (!type) fail('Room type not found.');
    run('DELETE FROM room_types WHERE id = ?', id);
    logActivity(user.id, 'Deleted room type', 'room_type', id, type.name);
    return ok('Room type deleted.');
  });
}

const roomSchema = z.object({
  id: zf.optionalId,
  room_number: zf.text(20),
  room_type_id: zf.id,
  floor: zf.optionalText(20),
  notes: zf.optionalText(500),
  is_active: zf.bool,
});

export async function saveRoomAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('rooms_manage', (user) => {
    const d = parseForm(roomSchema, formData);
    if (!get('SELECT id FROM room_types WHERE id = ?', d.room_type_id)) fail('Please choose a valid room type.');
    if (d.id) {
      const room = get<{ status: string }>('SELECT status FROM rooms WHERE id = ?', d.id);
      if (!room) fail('Room not found.');
      if (!d.is_active && room.status === 'occupied') fail('An occupied room cannot be deactivated.');
      run(
        'UPDATE rooms SET room_number = ?, room_type_id = ?, floor = ?, notes = ?, is_active = ? WHERE id = ?',
        d.room_number, d.room_type_id, d.floor, d.notes, d.is_active, d.id,
      );
      logActivity(user.id, 'Updated room', 'room', d.id, `Room ${d.room_number}`);
      return ok('Room updated.');
    }
    const r = run(
      'INSERT INTO rooms(room_number, room_type_id, floor, notes, is_active) VALUES (?, ?, ?, ?, ?)',
      d.room_number, d.room_type_id, d.floor, d.notes, d.is_active,
    );
    logActivity(user.id, 'Created room', 'room', r.lastInsertRowid, `Room ${d.room_number}`);
    return ok(`Room ${d.room_number} created.`);
  });
}

const bulkSchema = z.object({
  room_type_id: zf.id,
  floor: zf.optionalText(20),
  prefix: z.string().trim().max(10).default(''),
  start: zf.int(0, 99999),
  end: zf.int(0, 99999),
});

export async function bulkAddRoomsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('rooms_manage', (user) => {
    const d = parseForm(bulkSchema, formData);
    if (d.end < d.start) fail('"To" number must be greater than or equal to "From" number.');
    if (d.end - d.start + 1 > 200) fail('You can add at most 200 rooms at once.');
    if (!get('SELECT id FROM room_types WHERE id = ?', d.room_type_id)) fail('Please choose a valid room type.');
    let created = 0;
    let skipped = 0;
    transaction(() => {
      for (let n = d.start; n <= d.end; n++) {
        const number = `${d.prefix}${n}`;
        if (get('SELECT id FROM rooms WHERE room_number = ?', number)) {
          skipped++;
          continue;
        }
        run('INSERT INTO rooms(room_number, room_type_id, floor) VALUES (?, ?, ?)', number, d.room_type_id, d.floor);
        created++;
      }
    });
    logActivity(user.id, 'Bulk added rooms', 'room', null, `${created} rooms (${d.prefix}${d.start}–${d.prefix}${d.end})`);
    return ok(`${created} room(s) added${skipped ? `, ${skipped} skipped (already exist)` : ''}.`);
  });
}

export async function deleteRoomAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('rooms_manage', (user) => {
    const id = formId(formData);
    const room = get<{ room_number: string }>('SELECT room_number FROM rooms WHERE id = ?', id);
    if (!room) fail('Room not found.');
    if (scalar('SELECT COUNT(*) FROM bookings WHERE room_id = ?', id) > 0)
      fail('This room has booking history and cannot be deleted. Mark it inactive instead.');
    run('DELETE FROM rooms WHERE id = ?', id);
    logActivity(user.id, 'Deleted room', 'room', id, `Room ${room.room_number}`);
    return ok(`Room ${room.room_number} deleted.`);
  });
}

const statusSchema = z.object({
  id: zf.id,
  status: zf.enumOf(['available', 'maintenance', 'out_of_order'] as const),
});

export async function setRoomStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(['rooms_manage', 'maintenance'], (user) => {
    const d = parseForm(statusSchema, formData);
    const room = get<{ room_number: string; status: string }>('SELECT room_number, status FROM rooms WHERE id = ?', d.id);
    if (!room) fail('Room not found.');
    if (room.status === 'occupied') fail(`Room ${room.room_number} is occupied. Check the guest out first.`);
    run('UPDATE rooms SET status = ? WHERE id = ?', d.status, d.id);
    logActivity(user.id, 'Changed room status', 'room', d.id, `Room ${room.room_number}: ${labelize(room.status)} → ${labelize(d.status)}`);
    return ok(`Room ${room.room_number} is now ${labelize(d.status)}.`);
  });
}

const hkSchema = z.object({ id: zf.id, housekeeping_status: zf.enumOf(HK_STATUSES) });

export async function setHousekeepingStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('housekeeping', (user) => {
    const d = parseForm(hkSchema, formData);
    const room = get<{ room_number: string }>('SELECT room_number FROM rooms WHERE id = ?', d.id);
    if (!room) fail('Room not found.');
    run('UPDATE rooms SET housekeeping_status = ? WHERE id = ?', d.housekeeping_status, d.id);
    logActivity(user.id, 'Updated housekeeping status', 'room', d.id, `Room ${room.room_number}: ${labelize(d.housekeeping_status)}`);
    return ok(`Room ${room.room_number} marked ${labelize(d.housekeeping_status)}.`);
  });
}

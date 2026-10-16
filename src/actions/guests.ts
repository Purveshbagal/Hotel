'use server';

import { z } from 'zod';
import type { ActionState } from '@/lib/action-types';
import { fail, formId, logActivity, ok, parseForm, runAction, zf } from '@/lib/action';
import { get, run, scalar } from '@/lib/db';

const guestSchema = z.object({
  id: zf.optionalId,
  name: zf.text(120),
  phone: zf.optionalText(30),
  email: zf.email,
  gender: zf.optionalText(20),
  date_of_birth: zf.optionalDate,
  nationality: zf.optionalText(60),
  id_type: zf.optionalText(40),
  id_number: zf.optionalText(60),
  address: zf.optionalText(300),
  city: zf.optionalText(80),
  state: zf.optionalText(80),
  country: zf.optionalText(80),
  pincode: zf.optionalText(20),
  company_name: zf.optionalText(150),
  company_gstin: zf.optionalText(20),
  notes: zf.optionalText(1000),
  is_vip: zf.bool,
  is_blacklisted: zf.bool,
});

export async function saveGuestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('guests', (user) => {
    const d = parseForm(guestSchema, formData);
    const values = [
      d.name, d.phone, d.email, d.gender, d.date_of_birth, d.nationality, d.id_type, d.id_number, d.address, d.city,
      d.state, d.country, d.pincode, d.company_name, d.company_gstin?.toUpperCase() ?? null, d.notes, d.is_vip, d.is_blacklisted,
    ] as const;
    if (d.id) {
      const r = run(
        `UPDATE guests SET name = ?, phone = ?, email = ?, gender = ?, date_of_birth = ?, nationality = ?, id_type = ?,
                id_number = ?, address = ?, city = ?, state = ?, country = ?, pincode = ?, company_name = ?, company_gstin = ?,
                notes = ?, is_vip = ?, is_blacklisted = ?, updated_at = datetime('now','localtime')
          WHERE id = ?`,
        ...values,
        d.id,
      );
      if (!r.changes) fail('Guest not found.');
      logActivity(user.id, 'Updated guest', 'guest', d.id, d.name);
      return ok('Guest details saved.');
    }
    const r = run(
      `INSERT INTO guests(name, phone, email, gender, date_of_birth, nationality, id_type, id_number, address, city, state,
                          country, pincode, company_name, company_gstin, notes, is_vip, is_blacklisted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ...values,
    );
    logActivity(user.id, 'Created guest', 'guest', r.lastInsertRowid, d.name);
    return ok('Guest created.', `/guests/${r.lastInsertRowid}`);
  });
}

export async function deleteGuestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('guests', (user) => {
    const id = formId(formData);
    const guest = get<{ name: string }>('SELECT name FROM guests WHERE id = ?', id);
    if (!guest) fail('Guest not found.');
    if (scalar('SELECT COUNT(*) FROM bookings WHERE guest_id = ?', id) > 0)
      fail('This guest has bookings and cannot be deleted.');
    run('DELETE FROM guests WHERE id = ?', id);
    logActivity(user.id, 'Deleted guest', 'guest', id, guest.name);
    return ok('Guest deleted.', '/guests');
  });
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { bulkAddRoomsAction, deleteRoomAction, saveRoomAction, setRoomStatusAction } from '@/actions/rooms';
import { ActionButton, ActionForm, FormActions, SubmitButton } from '@/components/action-form';
import { Modal } from '@/components/modal';
import { Badge, Card, Checkbox, EmptyState, Field, LinkButton, PageHeader, Select, StatusBadge, TableWrap, Tabs } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { all } from '@/lib/db';
import { can } from '@/lib/permissions';
import { getSettings } from '@/lib/settings';
import type { Room, RoomType } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'Rooms' };

type Row = Room & { type_name: string; base_rate: number; guest_name: string | null; booking_id: number | null; check_out_date: string | null };

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ type?: string; status?: string }> }) {
  const user = await requireUser('rooms_view');
  const sp = await searchParams;
  const manage = can(user.role, 'rooms_manage');
  const cur = getSettings().currency_symbol;
  const types = all<RoomType>('SELECT * FROM room_types ORDER BY base_rate, name');

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (sp.type) {
    where.push('r.room_type_id = ?');
    params.push(Number(sp.type) || 0);
  }
  if (sp.status) {
    where.push('r.status = ?');
    params.push(sp.status);
  }
  const rows = all<Row>(
    `SELECT r.*, rt.name AS type_name, rt.base_rate, g.name AS guest_name, b.id AS booking_id, b.check_out_date
       FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id
       LEFT JOIN bookings b ON b.room_id = r.id AND b.status = 'checked_in'
       LEFT JOIN guests g ON g.id = b.guest_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY r.is_active DESC, r.room_number COLLATE NOCASE`,
    ...params,
  );
  const typeOptions = types.map((t) => ({ value: t.id, label: `${t.name} (${formatMoney(t.base_rate, cur)})` }));

  return (
    <>
      <PageHeader
        title="Rooms"
        description="All rooms with their live occupancy and housekeeping status."
        actions={
          manage && types.length ? (
            <>
              <Modal title="Add multiple rooms" trigger={<><Layers className="size-4" /> Bulk add</>} triggerVariant="secondary">
                <ActionForm action={bulkAddRoomsAction}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Room type" required className="sm:col-span-2">
                      <Select name="room_type_id" options={typeOptions} required />
                    </Field>
                    <Field label="From number" required>
                      <input type="number" name="start" className="input" required min={0} placeholder="101" />
                    </Field>
                    <Field label="To number" required>
                      <input type="number" name="end" className="input" required min={0} placeholder="110" />
                    </Field>
                    <Field label="Prefix" hint="Optional, e.g. A- → A-101">
                      <input name="prefix" className="input" maxLength={10} />
                    </Field>
                    <Field label="Floor">
                      <input name="floor" className="input" maxLength={20} placeholder="1st Floor" />
                    </Field>
                  </div>
                  <FormActions>
                    <SubmitButton>Create rooms</SubmitButton>
                  </FormActions>
                </ActionForm>
              </Modal>
              <Modal title="Add room" trigger={<><Plus className="size-4" /> Add room</>}>
                <RoomForm typeOptions={typeOptions} />
              </Modal>
            </>
          ) : null
        }
      />
      <Tabs
        active="rooms"
        tabs={[
          { key: 'rooms', label: 'Rooms', href: '/rooms', count: rows.length },
          { key: 'types', label: 'Room types & rates', href: '/rooms/types', count: types.length },
        ]}
      />
      {types.length === 0 ? (
        <Card>
          <EmptyState
            title="No room types yet"
            description="Create room types (e.g. Standard, Deluxe, Suite) with their rates first, then add rooms."
            action={manage ? <LinkButton href="/rooms/types">Add room types</LinkButton> : undefined}
          />
        </Card>
      ) : (
        <Card>
          <form method="get" className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
            <select name="type" defaultValue={sp.type ?? ''} className="input w-auto">
              <option value="">All types</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select name="status" defaultValue={sp.status ?? ''} className="input w-auto">
              <option value="">All statuses</option>
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Maintenance</option>
              <option value="out_of_order">Out of order</option>
            </select>
            <button className="input w-auto cursor-pointer font-medium hover:bg-slate-50">Filter</button>
          </form>
          {rows.length === 0 ? (
            <EmptyState title="No rooms found" />
          ) : (
            <TableWrap>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Type</th>
                    <th>Floor</th>
                    <th>Status</th>
                    <th>Housekeeping</th>
                    <th>Current guest</th>
                    {manage ? <th className="text-right">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={r.is_active ? '' : 'opacity-50'}>
                      <td>
                        <span className="text-base font-bold">{r.room_number}</span>
                        {!r.is_active ? <Badge className="ml-2">Inactive</Badge> : null}
                        {r.notes ? <p className="text-xs text-slate-500">{r.notes}</p> : null}
                      </td>
                      <td>
                        {r.type_name}
                        <p className="text-xs text-slate-500">{formatMoney(r.base_rate, cur)}/night</p>
                      </td>
                      <td>{r.floor ?? '—'}</td>
                      <td>
                        {manage && r.status !== 'occupied' ? (
                          <ActionForm action={setRoomStatusAction} className="flex items-center gap-1">
                            <input type="hidden" name="id" value={r.id} />
                            <StatusBadge status={r.status} />
                            <select name="status" defaultValue={r.status} className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs">
                              <option value="available">Available</option>
                              <option value="maintenance">Maintenance</option>
                              <option value="out_of_order">Out of order</option>
                            </select>
                            <SubmitButton size="xs" variant="ghost">Set</SubmitButton>
                          </ActionForm>
                        ) : (
                          <StatusBadge status={r.status} />
                        )}
                      </td>
                      <td><StatusBadge status={r.housekeeping_status} /></td>
                      <td>
                        {r.booking_id ? (
                          <Link href={`/bookings/${r.booking_id}`} className="link">
                            {r.guest_name}
                          </Link>
                        ) : (
                          '—'
                        )}
                        {r.check_out_date ? <p className="text-xs text-slate-500">until {formatDate(r.check_out_date)}</p> : null}
                      </td>
                      {manage ? (
                        <td>
                          <div className="flex justify-end gap-1">
                            <Modal title={`Edit room ${r.room_number}`} trigger={<Pencil className="size-4" />} triggerVariant="ghost" triggerSize="xs" triggerTitle="Edit">
                              <RoomForm typeOptions={typeOptions} room={r} />
                            </Modal>
                            <ActionButton action={deleteRoomAction} fields={{ id: r.id }} variant="danger-ghost" size="xs" confirm={`Delete room ${r.room_number}?`} title="Delete">
                              <Trash2 className="size-4" />
                            </ActionButton>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      )}
    </>
  );
}

function RoomForm({ typeOptions, room }: { typeOptions: { value: number; label: string }[]; room?: Room }) {
  return (
    <ActionForm action={saveRoomAction}>
      {room ? <input type="hidden" name="id" value={room.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Room number" required>
          <input name="room_number" className="input" required maxLength={20} defaultValue={room?.room_number} />
        </Field>
        <Field label="Floor">
          <input name="floor" className="input" maxLength={20} defaultValue={room?.floor ?? ''} />
        </Field>
        <Field label="Room type" required className="sm:col-span-2">
          <Select name="room_type_id" options={typeOptions} required defaultValue={room?.room_type_id} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <input name="notes" className="input" maxLength={500} defaultValue={room?.notes ?? ''} placeholder="e.g. Sea view, near lift" />
        </Field>
        <Checkbox name="is_active" label="Active (available for booking)" defaultChecked={room ? !!room.is_active : true} />
      </div>
      <FormActions>
        <SubmitButton>{room ? 'Save changes' : 'Add room'}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

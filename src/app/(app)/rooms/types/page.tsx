import type { Metadata } from 'next';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteRoomTypeAction, saveRoomTypeAction } from '@/actions/rooms';
import { ActionButton, ActionForm, FormActions, SubmitButton } from '@/components/action-form';
import { Modal } from '@/components/modal';
import { Badge, Card, Checkbox, EmptyState, Field, PageHeader, TableWrap, Tabs } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { all, scalar } from '@/lib/db';
import { can } from '@/lib/permissions';
import { getSettings, roomTaxRate } from '@/lib/settings';
import type { RoomType } from '@/lib/types';
import { formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'Room types' };

export default async function RoomTypesPage() {
  const user = await requireUser('rooms_view');
  const manage = can(user.role, 'rooms_manage');
  const settings = getSettings();
  const cur = settings.currency_symbol;
  const types = all<RoomType & { rooms: number }>(
    `SELECT rt.*, (SELECT COUNT(*) FROM rooms r WHERE r.room_type_id = rt.id) AS rooms
       FROM room_types rt ORDER BY rt.base_rate, rt.name`,
  );
  const roomCount = scalar('SELECT COUNT(*) FROM rooms');

  return (
    <>
      <PageHeader
        title="Rooms"
        description="Room categories, tariffs and occupancy limits."
        actions={
          manage ? (
            <Modal title="Add room type" size="lg" trigger={<><Plus className="size-4" /> Add room type</>}>
              <TypeForm cur={cur} />
            </Modal>
          ) : null
        }
      />
      <Tabs
        active="types"
        tabs={[
          { key: 'rooms', label: 'Rooms', href: '/rooms', count: roomCount },
          { key: 'types', label: 'Room types & rates', href: '/rooms/types', count: types.length },
        ]}
      />
      <Card>
        {types.length === 0 ? (
          <EmptyState title="No room types yet" description="Add your first room type, e.g. Standard, Deluxe or Suite." />
        ) : (
          <TableWrap>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Room type</th>
                  <th className="text-right">Rate / night</th>
                  <th className="text-right">Extra bed</th>
                  <th className="text-right">{settings.tax_label}</th>
                  <th>Occupancy</th>
                  <th>Amenities</th>
                  <th className="text-right">Rooms</th>
                  {manage ? <th className="text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id} className={t.is_active ? '' : 'opacity-50'}>
                    <td>
                      <p className="font-semibold">
                        {t.name} {!t.is_active ? <Badge>Inactive</Badge> : null}
                      </p>
                      {t.description ? <p className="max-w-xs text-xs text-slate-500">{t.description}</p> : null}
                    </td>
                    <td className="whitespace-nowrap text-right font-medium">{formatMoney(t.base_rate, cur)}</td>
                    <td className="whitespace-nowrap text-right">{formatMoney(t.extra_bed_rate, cur)}</td>
                    <td className="text-right">{roomTaxRate(t.base_rate, settings)}%</td>
                    <td className="whitespace-nowrap text-xs">
                      {t.max_adults} adults · {t.max_children} children
                    </td>
                    <td className="max-w-xs text-xs text-slate-600">{t.amenities ?? '—'}</td>
                    <td className="text-right">{t.rooms}</td>
                    {manage ? (
                      <td>
                        <div className="flex justify-end gap-1">
                          <Modal title={`Edit ${t.name}`} size="lg" trigger={<Pencil className="size-4" />} triggerVariant="ghost" triggerSize="xs" triggerTitle="Edit">
                            <TypeForm cur={cur} type={t} />
                          </Modal>
                          {t.rooms === 0 ? (
                            <ActionButton action={deleteRoomTypeAction} fields={{ id: t.id }} variant="danger-ghost" size="xs" confirm={`Delete room type ${t.name}?`} title="Delete">
                              <Trash2 className="size-4" />
                            </ActionButton>
                          ) : null}
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
    </>
  );
}

function TypeForm({ cur, type }: { cur: string; type?: RoomType }) {
  return (
    <ActionForm action={saveRoomTypeAction}>
      {type ? <input type="hidden" name="id" value={type.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <input name="name" className="input" required maxLength={80} defaultValue={type?.name} placeholder="Deluxe" />
        </Field>
        <Field label={`Rate per night (${cur})`} required>
          <input type="number" name="base_rate" className="input" required min={0} step="0.01" defaultValue={type?.base_rate} />
        </Field>
        <Field label={`Extra bed rate (${cur})`}>
          <input type="number" name="extra_bed_rate" className="input" min={0} step="0.01" defaultValue={type?.extra_bed_rate ?? 0} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Max adults">
            <input type="number" name="max_adults" className="input" min={1} max={20} defaultValue={type?.max_adults ?? 2} />
          </Field>
          <Field label="Max children">
            <input type="number" name="max_children" className="input" min={0} max={20} defaultValue={type?.max_children ?? 1} />
          </Field>
        </div>
        <Field label="Amenities" className="sm:col-span-2" hint="Comma separated">
          <input name="amenities" className="input" maxLength={1000} defaultValue={type?.amenities ?? ''} placeholder="AC, TV, Wi-Fi, Mini fridge" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea name="description" rows={2} className="input" maxLength={1000} defaultValue={type?.description ?? ''} />
        </Field>
        <Checkbox name="is_active" label="Active" defaultChecked={type ? !!type.is_active : true} />
      </div>
      <FormActions>
        <SubmitButton>{type ? 'Save changes' : 'Add room type'}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

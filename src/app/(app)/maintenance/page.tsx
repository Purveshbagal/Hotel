import type { Metadata } from 'next';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteMaintenanceAction, saveMaintenanceAction } from '@/actions/operations';
import { ActionButton, ActionForm, FormActions, SubmitButton } from '@/components/action-form';
import { Modal } from '@/components/modal';
import { Badge, Card, Checkbox, EmptyState, Field, PageHeader, Select, StatusBadge, TableWrap, Tabs } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { MAINTENANCE_STATUSES, PRIORITIES } from '@/lib/constants';
import { all } from '@/lib/db';
import { can } from '@/lib/permissions';
import { getSettings } from '@/lib/settings';
import { formatDateTime, formatMoney, labelize } from '@/lib/utils';

export const metadata: Metadata = { title: 'Maintenance' };

type Req = {
  id: number; room_id: number | null; room_number: string | null; room_status: string | null; title: string; description: string | null;
  priority: string; status: string; assigned_to: number | null; assignee: string | null; reporter: string | null; cost: number;
  resolution: string | null; created_at: string; resolved_at: string | null;
};

export default async function MaintenancePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser('maintenance');
  const { tab = 'open' } = await searchParams;
  const cur = getSettings().currency_symbol;
  const open = tab !== 'closed';
  const rows = all<Req>(
    `SELECT m.*, r.room_number, r.status AS room_status, a.name AS assignee, rp.name AS reporter
       FROM maintenance_requests m
       LEFT JOIN rooms r ON r.id = m.room_id
       LEFT JOIN users a ON a.id = m.assigned_to
       LEFT JOIN users rp ON rp.id = m.reported_by
      WHERE m.status ${open ? `IN ('open','in_progress')` : `IN ('resolved','closed')`}
      ORDER BY ${open ? `CASE m.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, m.created_at` : 'm.resolved_at DESC'}
      LIMIT 300`,
  );
  const rooms = all<{ id: number; room_number: string }>('SELECT id, room_number FROM rooms WHERE is_active = 1 ORDER BY room_number COLLATE NOCASE');
  const staff = all<{ id: number; name: string; role: string }>('SELECT id, name, role FROM users WHERE is_active = 1 ORDER BY name');
  const roomOptions = rooms.map((r) => ({ value: r.id, label: `Room ${r.room_number}` }));
  const staffOptions = staff.map((s) => ({ value: s.id, label: `${s.name} (${labelize(s.role)})` }));
  const openCount = all<{ n: number }>(`SELECT COUNT(*) AS n FROM maintenance_requests WHERE status IN ('open','in_progress')`)[0].n;

  return (
    <>
      <PageHeader
        title="Maintenance"
        description="Track repairs and issues. Block rooms while they are being fixed."
        actions={
          <Modal title="Report an issue" size="lg" trigger={<><Plus className="size-4" /> Report issue</>}>
            <RequestForm roomOptions={roomOptions} staffOptions={staffOptions} cur={cur} />
          </Modal>
        }
      />
      <Tabs
        active={open ? 'open' : 'closed'}
        tabs={[
          { key: 'open', label: 'Open', href: '/maintenance', count: openCount },
          { key: 'closed', label: 'Resolved / Closed', href: '/maintenance?tab=closed' },
        ]}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title={open ? 'No open issues' : 'Nothing resolved yet'} />
        ) : (
          <TableWrap>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Room</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Assigned</th>
                  <th className="text-right">Cost</th>
                  <th>{open ? 'Reported' : 'Resolved'}</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td className="max-w-sm">
                      <p className="font-medium">{m.title}</p>
                      {m.description ? <p className="text-xs text-slate-500">{m.description}</p> : null}
                      {m.resolution ? <p className="mt-1 text-xs text-emerald-700">✓ {m.resolution}</p> : null}
                    </td>
                    <td>
                      {m.room_number ? (
                        <>
                          <span className="font-semibold">{m.room_number}</span>
                          {m.room_status === 'maintenance' || m.room_status === 'out_of_order' ? (
                            <Badge tone="yellow" className="ml-1">Blocked</Badge>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-slate-500">General</span>
                      )}
                    </td>
                    <td><StatusBadge status={m.priority} /></td>
                    <td><StatusBadge status={m.status} /></td>
                    <td>{m.assignee ?? '—'}</td>
                    <td className="whitespace-nowrap text-right">{m.cost ? formatMoney(m.cost, cur) : '—'}</td>
                    <td className="whitespace-nowrap text-xs text-slate-600">
                      {formatDateTime(open ? m.created_at : m.resolved_at)}
                      {open && m.reporter ? <p>by {m.reporter}</p> : null}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Modal title="Update request" size="lg" trigger={<><Pencil className="size-3.5" /> Update</>} triggerVariant="secondary" triggerSize="xs">
                          <RequestForm roomOptions={roomOptions} staffOptions={staffOptions} cur={cur} request={m} />
                        </Modal>
                        {can(user.role, 'rooms_manage') ? (
                          <ActionButton action={deleteMaintenanceAction} fields={{ id: m.id }} variant="danger-ghost" size="xs" confirm="Delete this request?" title="Delete">
                            <Trash2 className="size-4" />
                          </ActionButton>
                        ) : null}
                      </div>
                    </td>
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

function RequestForm({
  roomOptions,
  staffOptions,
  cur,
  request,
}: {
  roomOptions: { value: number; label: string }[];
  staffOptions: { value: number; label: string }[];
  cur: string;
  request?: Req;
}) {
  return (
    <ActionForm action={saveMaintenanceAction}>
      {request ? <input type="hidden" name="id" value={request.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" required className="sm:col-span-2">
          <input name="title" className="input" required maxLength={150} defaultValue={request?.title} placeholder="e.g. Leaking tap in bathroom" />
        </Field>
        <Field label="Room">
          <Select name="room_id" options={roomOptions} placeholder="General / common area" defaultValue={request?.room_id} />
        </Field>
        <Field label="Priority">
          <Select name="priority" options={PRIORITIES.map((p) => ({ value: p, label: labelize(p) }))} defaultValue={request?.priority ?? 'normal'} />
        </Field>
        {request ? (
          <Field label="Status">
            <Select name="status" options={MAINTENANCE_STATUSES.map((s) => ({ value: s, label: labelize(s) }))} defaultValue={request.status} />
          </Field>
        ) : null}
        <Field label="Assign to">
          <Select name="assigned_to" options={staffOptions} placeholder="Unassigned" defaultValue={request?.assigned_to} />
        </Field>
        <Field label={`Cost (${cur})`}>
          <input type="number" name="cost" className="input" min={0} step="0.01" defaultValue={request?.cost ?? 0} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea name="description" rows={2} className="input" maxLength={1000} defaultValue={request?.description ?? ''} />
        </Field>
        {request ? (
          <Field label="Resolution notes" className="sm:col-span-2">
            <textarea name="resolution" rows={2} className="input" maxLength={1000} defaultValue={request.resolution ?? ''} />
          </Field>
        ) : null}
        <div className="sm:col-span-2">
          {request ? (
            <Checkbox name="release_room" label="Make the room available again" hint="Only applies if the room is currently blocked for maintenance." />
          ) : (
            <Checkbox name="block_room" label="Block the room for maintenance" hint="The room cannot be checked into until it is released." />
          )}
        </div>
      </div>
      <FormActions>
        <SubmitButton>{request ? 'Save' : 'Create request'}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

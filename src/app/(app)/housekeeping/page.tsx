import type { Metadata } from 'next';
import { CheckCircle2, Pencil, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { setHousekeepingStatusAction } from '@/actions/rooms';
import { deleteTaskAction, saveTaskAction, updateTaskStatusAction } from '@/actions/operations';
import { ActionButton, ActionForm, FormActions, SubmitButton } from '@/components/action-form';
import { Modal } from '@/components/modal';
import { Badge, Card, CardHeader, EmptyState, Field, PageHeader, Select, StatusBadge, TableWrap, Tabs } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { HK_TASK_TYPES, PRIORITIES, optionLabel } from '@/lib/constants';
import { all } from '@/lib/db';
import { cn, formatDateTime, labelize } from '@/lib/utils';

export const metadata: Metadata = { title: 'Housekeeping' };

type RoomRow = { id: number; room_number: string; status: string; housekeeping_status: string; type_name: string; floor: string | null };
type TaskRow = {
  id: number; room_id: number; room_number: string; task_type: string; status: string; priority: string; assigned_to: number | null;
  assignee: string | null; notes: string | null; created_at: string; started_at: string | null; completed_at: string | null;
};

const HK_TONES: Record<string, string> = {
  clean: 'border-emerald-200 bg-emerald-50',
  dirty: 'border-orange-200 bg-orange-50',
  in_progress: 'border-sky-200 bg-sky-50',
  inspected: 'border-violet-200 bg-violet-50',
};

export default async function HousekeepingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser('housekeeping');
  const { tab = 'board' } = await searchParams;

  const rooms = all<RoomRow>(
    `SELECT r.id, r.room_number, r.status, r.housekeeping_status, r.floor, rt.name AS type_name
       FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id WHERE r.is_active = 1
      ORDER BY r.room_number COLLATE NOCASE`,
  );
  const tasks = all<TaskRow>(
    `SELECT t.*, r.room_number, u.name AS assignee
       FROM housekeeping_tasks t JOIN rooms r ON r.id = t.room_id LEFT JOIN users u ON u.id = t.assigned_to
      WHERE ${tab === 'done' ? `t.status = 'completed'` : `t.status <> 'completed'`}
      ORDER BY ${tab === 'done' ? 't.completed_at DESC' : `CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.created_at`}
      LIMIT 200`,
  );
  const staff = all<{ id: number; name: string; role: string }>(
    `SELECT id, name, role FROM users WHERE is_active = 1 ORDER BY role = 'housekeeping' DESC, name`,
  );
  const staffOptions = staff.map((s) => ({ value: s.id, label: `${s.name} (${labelize(s.role)})` }));
  const roomOptions = rooms.map((r) => ({ value: r.id, label: `Room ${r.room_number} · ${r.type_name}` }));
  const counts = Object.fromEntries(
    ['clean', 'dirty', 'in_progress', 'inspected'].map((s) => [s, rooms.filter((r) => r.housekeeping_status === s).length]),
  );
  const openTasks = all<{ n: number }>(`SELECT COUNT(*) AS n FROM housekeeping_tasks WHERE status <> 'completed'`)[0].n;

  return (
    <>
      <PageHeader
        title="Housekeeping"
        description={`${counts.dirty} dirty · ${counts.in_progress} in progress · ${counts.clean} clean · ${counts.inspected} inspected`}
        actions={
          <Modal title="New housekeeping task" trigger={<><Plus className="size-4" /> New task</>}>
            <TaskForm roomOptions={roomOptions} staffOptions={staffOptions} />
          </Modal>
        }
      />
      <Tabs
        active={tab}
        tabs={[
          { key: 'board', label: 'Room board', href: '/housekeeping' },
          { key: 'tasks', label: 'Open tasks', href: '/housekeeping?tab=tasks', count: openTasks },
          { key: 'done', label: 'Completed', href: '/housekeeping?tab=done' },
        ]}
      />

      {tab === 'board' ? (
        rooms.length === 0 ? (
          <Card><EmptyState title="No rooms configured" /></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {rooms.map((r) => (
              <div key={r.id} className={cn('rounded-xl border p-4', HK_TONES[r.housekeeping_status])}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xl font-bold">{r.room_number}</p>
                    <p className="text-xs text-slate-600">{r.type_name}{r.floor ? ` · ${r.floor}` : ''}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={r.housekeeping_status} />
                    {r.status !== 'available' ? <StatusBadge status={r.status} /> : null}
                  </div>
                </div>
                <ActionForm action={setHousekeepingStatusAction} className="mt-3 grid grid-cols-2 gap-1.5">
                  <input type="hidden" name="id" value={r.id} />
                  {(['dirty', 'in_progress', 'clean', 'inspected'] as const)
                    .filter((s) => s !== r.housekeeping_status)
                    .map((s) => (
                      <SubmitButton key={s} name="housekeeping_status" value={s} variant="secondary" size="xs">
                        {labelize(s)}
                      </SubmitButton>
                    ))}
                </ActionForm>
              </div>
            ))}
          </div>
        )
      ) : (
        <Card>
          <CardHeader title={tab === 'done' ? 'Recently completed tasks' : 'Open tasks'} />
          {tasks.length === 0 ? (
            <EmptyState title={tab === 'done' ? 'No completed tasks yet' : 'All caught up!'} description={tab === 'done' ? undefined : 'There are no pending housekeeping tasks.'} />
          ) : (
            <TableWrap>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Task</th>
                    <th>Priority</th>
                    <th>Assigned to</th>
                    <th>Status</th>
                    <th>{tab === 'done' ? 'Completed' : 'Created'}</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="text-base font-bold">{t.room_number}</td>
                      <td>
                        {optionLabel(HK_TASK_TYPES, t.task_type)}
                        {t.notes ? <p className="text-xs text-slate-500">{t.notes}</p> : null}
                      </td>
                      <td><StatusBadge status={t.priority} /></td>
                      <td>{t.assignee ?? <Badge>Unassigned</Badge>}</td>
                      <td><StatusBadge status={t.status} /></td>
                      <td className="whitespace-nowrap text-xs text-slate-600">{formatDateTime(tab === 'done' ? t.completed_at : t.created_at)}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          {t.status === 'pending' ? (
                            <ActionButton action={updateTaskStatusAction} fields={{ id: t.id, status: 'in_progress' }} size="xs" title="Start">
                              <Play className="size-3.5" /> Start
                            </ActionButton>
                          ) : null}
                          {t.status !== 'completed' ? (
                            <ActionButton action={updateTaskStatusAction} fields={{ id: t.id, status: 'completed' }} size="xs" variant="success" title="Complete">
                              <CheckCircle2 className="size-3.5" /> Done
                            </ActionButton>
                          ) : (
                            <ActionButton action={updateTaskStatusAction} fields={{ id: t.id, status: 'pending' }} size="xs" variant="ghost" title="Reopen">
                              <RotateCcw className="size-3.5" />
                            </ActionButton>
                          )}
                          {t.status !== 'completed' ? (
                            <Modal title="Edit task" trigger={<Pencil className="size-4" />} triggerVariant="ghost" triggerSize="xs" triggerTitle="Edit">
                              <TaskForm roomOptions={roomOptions} staffOptions={staffOptions} task={t} />
                            </Modal>
                          ) : null}
                          {user.role !== 'housekeeping' ? (
                            <ActionButton action={deleteTaskAction} fields={{ id: t.id }} size="xs" variant="danger-ghost" confirm="Delete this task?" title="Delete">
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
      )}
    </>
  );
}

function TaskForm({
  roomOptions,
  staffOptions,
  task,
}: {
  roomOptions: { value: number; label: string }[];
  staffOptions: { value: number; label: string }[];
  task?: TaskRow;
}) {
  return (
    <ActionForm action={saveTaskAction}>
      {task ? <input type="hidden" name="id" value={task.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Room" required>
          <Select name="room_id" options={roomOptions} required defaultValue={task?.room_id} placeholder="Select room" />
        </Field>
        <Field label="Task" required>
          <Select name="task_type" options={HK_TASK_TYPES} defaultValue={task?.task_type ?? 'cleaning'} />
        </Field>
        <Field label="Priority">
          <Select name="priority" options={PRIORITIES.map((p) => ({ value: p, label: labelize(p) }))} defaultValue={task?.priority ?? 'normal'} />
        </Field>
        <Field label="Assign to">
          <Select name="assigned_to" options={staffOptions} placeholder="Unassigned" defaultValue={task?.assigned_to} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea name="notes" rows={2} className="input" maxLength={500} defaultValue={task?.notes ?? ''} />
        </Field>
      </div>
      <FormActions>
        <SubmitButton>{task ? 'Save task' : 'Create task'}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

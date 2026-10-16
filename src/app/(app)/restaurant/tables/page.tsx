import { Armchair, Plus, Users } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { diningTables, type DiningTable } from '@/lib/restaurant';
import { getSettings } from '@/lib/settings';
import { formatMoney } from '@/lib/utils';
import { saveTableAction, tableStatusAction } from '@/actions/restaurant';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Modal } from '@/components/modal';
import { Badge, EmptyState, Field, LinkButton, PageHeader, StatCard } from '@/components/ui';
import { LiveRefresh } from '@/components/live-refresh';

export const metadata = { title: 'Table management' };
function TableFields({ table }: { table?: DiningTable }) {
  return <ActionForm action={saveTableAction} className="space-y-4">
    {table && <input type="hidden" name="id" value={table.id} />}
    <Field label="Table number / name"><input className="input" name="table_no" required maxLength={20} defaultValue={table?.table_no} placeholder="T01" /></Field>
    <div className="grid grid-cols-2 gap-3"><Field label="Area"><input className="input" name="area" required maxLength={60} defaultValue={table?.area ?? 'Main dining'} /></Field><Field label="Seats"><input className="input" type="number" name="seats" min={1} max={30} defaultValue={table?.seats ?? 4} /></Field></div>
    <SubmitButton>Save table</SubmitButton>
  </ActionForm>;
}
export default async function TablesPage() {
  const user = await requireUser('restaurant');
  const tables = diningTables();
  const currency = getSettings().currency_symbol;
  const available = tables.filter(t => !t.order_id && t.status === 'available').length;
  return <>
    <PageHeader title="Your dining floor" description="A clear view of every table, every guest, every order." back={{ href: '/restaurant', label: 'Restaurant' }} actions={<><LinkButton href="/restaurant/kitchen" variant="secondary">Kitchen board</LinkButton>{can(user.role, 'menu') && <Modal title="Add a table" trigger={<><Plus className="size-4" /> Add table</>}><TableFields /></Modal>}</>} />
    <div className="mb-6 grid gap-4 sm:grid-cols-3"><StatCard label="Available tables" value={available} icon={<Armchair className="size-5" />} tone="green" /><StatCard label="Occupied tables" value={tables.filter(t => t.order_id).length} icon={<Users className="size-5" />} /><StatCard label="Reserved tables" value={tables.filter(t => !t.order_id && t.status === 'reserved').length} tone="yellow" /></div>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Select a free table to start an order. Open occupied tables to add items or settle.</p><LiveRefresh /></div>
    {!tables.length && <div className="card"><EmptyState title="Set up your dining floor" description="Add your real tables and seating areas to start taking dine-in orders." /></div>}
    {[...new Set(tables.map(t => t.area))].map(area => <section key={area} className="mb-8"><h2 className="mb-4 text-lg font-semibold">{area} <span className="ml-2 text-sm font-normal text-slate-400">{tables.filter(t => t.area === area).length} tables</span></h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{tables.filter(t => t.area === area).map(t => <div key={t.id} className="card flex flex-col p-5">
        <div className="flex items-center justify-between"><div className={`rounded-xl p-3 ${t.order_id ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-500'}`}><Armchair className="size-6" /></div><Badge tone={t.order_id ? 'indigo' : t.status === 'available' ? 'green' : 'yellow'}>{t.order_id ? 'Occupied' : t.status}</Badge></div>
        <h3 className="mt-5 text-2xl font-semibold">{t.table_no}</h3><p className="mt-1 text-sm text-slate-500">{t.seats} seats · {t.area}</p>
        <div className="my-4 min-h-12 text-sm">{t.order_id ? <><p className="font-medium">{t.order_no} · {formatMoney(t.total ?? 0, currency)}</p><p className="mt-1 capitalize text-slate-500">{t.order_status}</p></> : t.status === 'reserved' ? <><p className="font-medium">{t.reservation_name}</p><p className="text-xs text-slate-500">{t.reservation_at?.replace('T', ' · ')} {t.reservation_phone}</p></> : <p className="text-slate-400">{t.status === 'available' ? 'Ready to welcome guests' : 'Unavailable for new orders'}</p>}</div>
        <div className="mt-auto flex flex-wrap gap-2">{t.order_id ? <LinkButton href={`/restaurant/${t.order_id}`} size="sm">Open order</LinkButton> : ['available', 'reserved'].includes(t.status) ? <LinkButton href={`/restaurant/new?table=${encodeURIComponent(t.table_no)}`} size="sm">{t.status === 'reserved' ? 'Seat reservation' : 'New order'}</LinkButton> : null}
          {!t.order_id && <Modal title={`Table ${t.table_no} · status`} trigger="Status" triggerVariant="secondary" triggerSize="sm"><ActionForm action={tableStatusAction} className="space-y-4"><input type="hidden" name="id" value={t.id} /><Field label="Status"><select className="input" name="status" defaultValue={t.status}><option value="available">Available</option><option value="reserved">Reserved / hold</option><option value="cleaning">Cleaning</option><option value="inactive">Inactive</option></select></Field><p className="text-xs text-slate-500">Reservations hold this table until seated or released. Time is a reference, not an automatic schedule.</p><Field label="Reservation name"><input className="input" name="reservation_name" maxLength={100} defaultValue={t.reservation_name ?? ''} /></Field><Field label="Phone"><input className="input" name="reservation_phone" maxLength={30} defaultValue={t.reservation_phone ?? ''} /></Field><Field label="Expected arrival"><input className="input" name="reservation_at" type="datetime-local" defaultValue={t.reservation_at ?? ''} /></Field><SubmitButton>Update status</SubmitButton></ActionForm></Modal>}
          {can(user.role, 'menu') && <Modal title="Edit table" trigger="Edit" triggerVariant="ghost" triggerSize="sm"><TableFields table={t} /></Modal>}
        </div>
      </div>)}</div></section>)}
  </>;
}

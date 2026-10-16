import type { Metadata } from 'next';
import { ArrowDownUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteInventoryItemAction, saveInventoryItemAction, stockMovementAction } from '@/actions/operations';
import { ActionButton, ActionForm, FormActions, SubmitButton } from '@/components/action-form';
import { Modal } from '@/components/modal';
import { Badge, Card, CardHeader, EmptyState, Field, PageHeader, StatCard, StatusBadge, TableWrap, Tabs } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { INVENTORY_CATEGORIES, INVENTORY_UNITS } from '@/lib/constants';
import { all } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import type { InventoryItem } from '@/lib/types';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/utils';

export const metadata: Metadata = { title: 'Inventory' };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  await requireUser('inventory');
  const sp = await searchParams;
  const tab = sp.tab === 'history' ? 'history' : 'stock';
  const q = sp.q?.trim() ?? '';
  const cur = getSettings().currency_symbol;
  const items = all<InventoryItem>(
    `SELECT * FROM inventory_items ${q ? 'WHERE name LIKE ? OR category LIKE ?' : ''} ORDER BY category, name`,
    ...(q ? [`%${q}%`, `%${q}%`] : []),
  );
  const low = items.filter((i) => i.quantity <= i.min_quantity);
  const stockValue = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0);
  const history =
    tab === 'history'
      ? all<{ id: number; name: string; unit: string; type: string; quantity: number; balance: number; notes: string | null; created_at: string; user_name: string | null }>(
          `SELECT t.*, i.name, i.unit, u.name AS user_name
             FROM inventory_transactions t JOIN inventory_items i ON i.id = t.item_id LEFT JOIN users u ON u.id = t.created_by
            ORDER BY t.id DESC LIMIT 300`,
        )
      : [];
  const categories = Array.from(new Set([...INVENTORY_CATEGORIES, ...items.map((i) => i.category)]));

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Linen, toiletries, kitchen and other stock with low-stock alerts."
        actions={
          <Modal title="Add inventory item" trigger={<><Plus className="size-4" /> Add item</>}>
            <ItemForm categories={categories} cur={cur} />
          </Modal>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Items" value={items.length} tone="indigo" />
        <StatCard label="Low stock" value={low.length} tone={low.length ? 'red' : 'green'} hint={low.slice(0, 3).map((i) => i.name).join(', ')} />
        <StatCard label="Stock value" value={formatMoney(stockValue, cur)} tone="green" />
      </div>
      <Tabs
        active={tab}
        tabs={[
          { key: 'stock', label: 'Stock', href: '/inventory' },
          { key: 'history', label: 'Movements', href: '/inventory?tab=history' },
        ]}
      />
      {tab === 'stock' ? (
        <Card>
          <form method="get" className="flex gap-3 border-b border-slate-200 p-4">
            <input name="q" defaultValue={q} placeholder="Search items…" className="input max-w-sm" />
            <button className="input w-auto cursor-pointer font-medium hover:bg-slate-50">Search</button>
          </form>
          {items.length === 0 ? (
            <EmptyState title="No items" description="Add items to start tracking stock." />
          ) : (
            <TableWrap>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th className="text-right">In stock</th>
                    <th className="text-right">Min level</th>
                    <th className="text-right">Unit cost</th>
                    <th className="text-right">Value</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <p className="font-medium">{i.name}</p>
                        {i.notes ? <p className="text-xs text-slate-500">{i.notes}</p> : null}
                      </td>
                      <td>{i.category}</td>
                      <td className="whitespace-nowrap text-right">
                        <span className="font-semibold">{formatNumber(i.quantity)}</span> {i.unit}
                        {i.quantity <= i.min_quantity ? <Badge tone="red" className="ml-2">Low</Badge> : null}
                      </td>
                      <td className="text-right text-slate-600">{formatNumber(i.min_quantity)}</td>
                      <td className="whitespace-nowrap text-right">{formatMoney(i.unit_cost, cur)}</td>
                      <td className="whitespace-nowrap text-right">{formatMoney(i.quantity * i.unit_cost, cur)}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Modal title={`Stock movement — ${i.name}`} description={`Current stock: ${formatNumber(i.quantity)} ${i.unit}`} trigger={<><ArrowDownUp className="size-3.5" /> Stock</>} triggerVariant="secondary" triggerSize="xs" size="sm">
                            <ActionForm action={stockMovementAction}>
                              <input type="hidden" name="item_id" value={i.id} />
                              <div className="space-y-4">
                                <Field label="Movement">
                                  <select name="type" className="input" defaultValue="in">
                                    <option value="in">Stock in (purchase / received)</option>
                                    <option value="out">Stock out (used / issued)</option>
                                    <option value="adjust">Adjust to exact count</option>
                                  </select>
                                </Field>
                                <Field label={`Quantity (${i.unit})`} required>
                                  <input type="number" name="quantity" className="input" required min={0} step="0.01" />
                                </Field>
                                <Field label="Notes">
                                  <input name="notes" className="input" maxLength={300} placeholder="e.g. Issued to 2nd floor" />
                                </Field>
                              </div>
                              <FormActions>
                                <SubmitButton>Save</SubmitButton>
                              </FormActions>
                            </ActionForm>
                          </Modal>
                          <Modal title={`Edit ${i.name}`} trigger={<Pencil className="size-4" />} triggerVariant="ghost" triggerSize="xs" triggerTitle="Edit">
                            <ItemForm categories={categories} cur={cur} item={i} />
                          </Modal>
                          <ActionButton action={deleteInventoryItemAction} fields={{ id: i.id }} variant="danger-ghost" size="xs" confirm={`Delete ${i.name} and its history?`} title="Delete">
                            <Trash2 className="size-4" />
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader title="Recent stock movements" />
          {history.length === 0 ? (
            <EmptyState title="No movements yet" />
          ) : (
            <TableWrap>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Item</th>
                    <th>Type</th>
                    <th className="text-right">Change</th>
                    <th className="text-right">Balance</th>
                    <th>Notes</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="whitespace-nowrap text-xs">{formatDateTime(h.created_at)}</td>
                      <td className="font-medium">{h.name}</td>
                      <td><StatusBadge status={h.type} /></td>
                      <td className="text-right">
                        {h.type === 'out' ? '-' : h.quantity > 0 && h.type === 'adjust' ? '+' : ''}
                        {formatNumber(h.quantity)} {h.unit}
                      </td>
                      <td className="text-right">{formatNumber(h.balance)}</td>
                      <td className="text-xs text-slate-600">{h.notes ?? '—'}</td>
                      <td className="text-xs text-slate-600">{h.user_name ?? '—'}</td>
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

function ItemForm({ categories, cur, item }: { categories: string[]; cur: string; item?: InventoryItem }) {
  return (
    <ActionForm action={saveInventoryItemAction}>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Item name" required className="sm:col-span-2">
          <input name="name" className="input" required maxLength={120} defaultValue={item?.name} />
        </Field>
        <Field label="Category" required>
          <input name="category" className="input" required list="inv-categories" maxLength={60} defaultValue={item?.category ?? 'General'} />
          <datalist id="inv-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Unit" required>
          <input name="unit" className="input" required list="inv-units" maxLength={20} defaultValue={item?.unit ?? 'pcs'} />
          <datalist id="inv-units">
            {INVENTORY_UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>
        {!item ? (
          <Field label="Opening stock">
            <input type="number" name="quantity" className="input" min={0} step="0.01" defaultValue={0} />
          </Field>
        ) : null}
        <Field label="Minimum level" hint="Alert when stock falls to this level">
          <input type="number" name="min_quantity" className="input" min={0} step="0.01" defaultValue={item?.min_quantity ?? 0} />
        </Field>
        <Field label={`Unit cost (${cur})`}>
          <input type="number" name="unit_cost" className="input" min={0} step="0.01" defaultValue={item?.unit_cost ?? 0} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <input name="notes" className="input" maxLength={500} defaultValue={item?.notes ?? ''} />
        </Field>
      </div>
      <FormActions>
        <SubmitButton>{item ? 'Save changes' : 'Add item'}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

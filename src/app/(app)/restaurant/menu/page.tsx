import type { Metadata } from 'next';
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteMenuItemAction, saveMenuItemAction, toggleMenuItemAction } from '@/actions/restaurant';
import { ActionButton, ActionForm, FormActions, SubmitButton } from '@/components/action-form';
import { Modal } from '@/components/modal';
import { Badge, Card, CardHeader, Checkbox, EmptyState, Field, PageHeader, TableWrap } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { all } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import type { MenuItem } from '@/lib/types';
import { cn, formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'Menu' };

export default async function MenuPage() {
  await requireUser('menu');
  const settings = getSettings();
  const cur = settings.currency_symbol;
  const items = all<MenuItem>('SELECT * FROM menu_items ORDER BY category, name');
  const categories = Array.from(new Set(items.map((i) => i.category)));

  return (
    <>
      <PageHeader
        title="Menu"
        description={`${items.length} items in ${categories.length} categories`}
        back={{ href: '/restaurant', label: 'Restaurant' }}
        actions={
          <Modal title="Add menu item" trigger={<><Plus className="size-4" /> Add item</>}>
            <MenuForm categories={categories} cur={cur} defaultTax={settings.food_tax_rate} />
          </Modal>
        }
      />
      {items.length === 0 ? (
        <Card><EmptyState title="No menu items yet" description="Add the dishes and drinks you serve." /></Card>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => (
            <Card key={cat}>
              <CardHeader title={cat} />
              <TableWrap>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Price</th>
                      <th className="text-right">Tax</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items
                      .filter((i) => i.category === cat)
                      .map((m) => (
                        <tr key={m.id} className={m.is_available ? '' : 'opacity-60'}>
                          <td>
                            <span className="flex items-center gap-2 font-medium">
                              <span className={cn('inline-block size-2.5 rounded-full', m.is_veg ? 'bg-emerald-500' : 'bg-rose-500')} title={m.is_veg ? 'Veg' : 'Non-veg'} />
                              {m.name}
                            </span>
                            {m.description ? <p className="text-xs text-slate-500">{m.description}</p> : null}
                          </td>
                          <td className="whitespace-nowrap text-right font-medium">{formatMoney(m.price, cur)}</td>
                          <td className="text-right">{m.tax_rate}%</td>
                          <td>{m.is_available ? <Badge tone="green">Available</Badge> : <Badge>Unavailable</Badge>}</td>
                          <td>
                            <div className="flex justify-end gap-1">
                              <ActionButton action={toggleMenuItemAction} fields={{ id: m.id }} variant="ghost" size="xs" title={m.is_available ? 'Mark unavailable' : 'Mark available'}>
                                {m.is_available ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                              </ActionButton>
                              <Modal title={`Edit ${m.name}`} trigger={<Pencil className="size-4" />} triggerVariant="ghost" triggerSize="xs" triggerTitle="Edit">
                                <MenuForm categories={categories} cur={cur} defaultTax={settings.food_tax_rate} item={m} />
                              </Modal>
                              <ActionButton action={deleteMenuItemAction} fields={{ id: m.id }} variant="danger-ghost" size="xs" confirm={`Delete ${m.name}?`} title="Delete">
                                <Trash2 className="size-4" />
                              </ActionButton>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </TableWrap>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function MenuForm({ categories, cur, defaultTax, item }: { categories: string[]; cur: string; defaultTax: string; item?: MenuItem }) {
  const listId = `menu-categories-${item?.id ?? 'new'}`;
  return (
    <ActionForm action={saveMenuItemAction}>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <input name="name" className="input" required maxLength={120} defaultValue={item?.name} />
        </Field>
        <Field label="Category" required>
          <input name="category" className="input" required maxLength={60} list={listId} defaultValue={item?.category} placeholder="e.g. Main Course" />
          <datalist id={listId}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label={`Price (${cur})`} required>
          <input type="number" name="price" className="input" required min={0} step="0.01" defaultValue={item?.price} />
        </Field>
        <Field label="Tax rate (%)">
          <input type="number" name="tax_rate" className="input" min={0} max={100} step="0.01" defaultValue={item?.tax_rate ?? defaultTax} />
        </Field>
        <Field label="Description">
          <input name="description" className="input" maxLength={300} defaultValue={item?.description ?? ''} />
        </Field>
        <Checkbox name="is_veg" label="Vegetarian" defaultChecked={item ? !!item.is_veg : true} />
        <Checkbox name="is_available" label="Available" defaultChecked={item ? !!item.is_available : true} />
      </div>
      <FormActions>
        <SubmitButton>{item ? 'Save changes' : 'Add item'}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

import type { Metadata } from 'next';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteExpenseAction, saveExpenseAction } from '@/actions/operations';
import { ActionButton, ActionForm, FormActions, SubmitButton } from '@/components/action-form';
import { DonutChart } from '@/components/charts';
import { Modal } from '@/components/modal';
import { Card, CardHeader, EmptyState, Field, LinkButton, PageHeader, Select, TableWrap } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, optionLabel } from '@/lib/constants';
import { all } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatDate, formatMoney, isDateStr, monthStart, todayStr } from '@/lib/utils';

export const metadata: Metadata = { title: 'Expenses' };

type Expense = {
  id: number; expense_date: string; category: string; description: string; amount: number; payment_method: string;
  vendor: string | null; reference: string | null; created_by_name: string | null;
};

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser('expenses');
  const sp = await searchParams;
  const today = todayStr();
  const from = isDateStr(sp.from) ? sp.from : monthStart(today);
  const to = isDateStr(sp.to) ? sp.to : today;
  const category = sp.category ?? '';
  const cur = getSettings().currency_symbol;

  const rows = all<Expense>(
    `SELECT e.*, u.name AS created_by_name FROM expenses e LEFT JOIN users u ON u.id = e.created_by
      WHERE e.expense_date BETWEEN ? AND ? ${category ? 'AND e.category = ?' : ''}
      ORDER BY e.expense_date DESC, e.id DESC`,
    ...(category ? [from, to, category] : [from, to]),
  );
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byCategory = new Map<string, number>();
  for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount);

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Record and track hotel operating expenses."
        actions={
          <>
            <LinkButton href={`/api/export/expenses?from=${from}&to=${to}`} variant="secondary">
              <Download className="size-4" /> Export
            </LinkButton>
            <Modal title="Record expense" trigger={<><Plus className="size-4" /> Add expense</>}>
              <ExpenseForm today={today} cur={cur} />
            </Modal>
          </>
        }
      />
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="block">
          <span className="label">From</span>
          <input type="date" name="from" defaultValue={from} className="input" />
        </label>
        <label className="block">
          <span className="label">To</span>
          <input type="date" name="to" defaultValue={to} className="input" />
        </label>
        <label className="block">
          <span className="label">Category</span>
          <select name="category" defaultValue={category} className="input">
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <button className="input w-auto cursor-pointer bg-indigo-600 font-medium text-white hover:bg-indigo-700">Apply</button>
      </form>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={`${rows.length} expense(s)`} description={`Total ${formatMoney(total, cur)}`} />
          {rows.length === 0 ? (
            <EmptyState title="No expenses in this period" />
          ) : (
            <TableWrap>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Paid via</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap">{formatDate(e.expense_date)}</td>
                      <td>
                        <p className="font-medium">{e.description}</p>
                        <p className="text-xs text-slate-500">{[e.vendor, e.reference, e.created_by_name ? `by ${e.created_by_name}` : null].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="text-sm">{optionLabel(EXPENSE_CATEGORIES, e.category)}</td>
                      <td className="text-sm">{optionLabel(PAYMENT_METHODS, e.payment_method)}</td>
                      <td className="whitespace-nowrap text-right font-medium">{formatMoney(e.amount, cur)}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Modal title="Edit expense" trigger={<Pencil className="size-4" />} triggerVariant="ghost" triggerSize="xs" triggerTitle="Edit">
                            <ExpenseForm today={today} cur={cur} expense={e} />
                          </Modal>
                          <ActionButton action={deleteExpenseAction} fields={{ id: e.id }} variant="danger-ghost" size="xs" confirm="Delete this expense?" title="Delete">
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
        <Card>
          <CardHeader title="By category" />
          <div className="p-4">
            <DonutChart currency={cur} data={[...byCategory.entries()].map(([k, v]) => ({ name: optionLabel(EXPENSE_CATEGORIES, k), value: Math.round(v) }))} />
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {[...byCategory.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <li key={k} className="flex justify-between py-1.5">
                    <span className="text-slate-600">{optionLabel(EXPENSE_CATEGORIES, k)}</span>
                    <span className="font-medium">{formatMoney(v, cur)}</span>
                  </li>
                ))}
            </ul>
          </div>
        </Card>
      </div>
    </>
  );
}

function ExpenseForm({ today, cur, expense }: { today: string; cur: string; expense?: Expense }) {
  return (
    <ActionForm action={saveExpenseAction}>
      {expense ? <input type="hidden" name="id" value={expense.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" required>
          <input type="date" name="expense_date" className="input" required max={today} defaultValue={expense?.expense_date ?? today} />
        </Field>
        <Field label="Category" required>
          <Select name="category" options={EXPENSE_CATEGORIES} defaultValue={expense?.category ?? 'other'} />
        </Field>
        <Field label="Description" required className="sm:col-span-2">
          <input name="description" className="input" required maxLength={200} defaultValue={expense?.description} />
        </Field>
        <Field label={`Amount (${cur})`} required>
          <input type="number" name="amount" className="input" required min={0.01} step="0.01" defaultValue={expense?.amount} />
        </Field>
        <Field label="Paid via">
          <Select name="payment_method" options={PAYMENT_METHODS} defaultValue={expense?.payment_method ?? 'cash'} />
        </Field>
        <Field label="Vendor">
          <input name="vendor" className="input" maxLength={150} defaultValue={expense?.vendor ?? ''} />
        </Field>
        <Field label="Bill / reference no.">
          <input name="reference" className="input" maxLength={100} defaultValue={expense?.reference ?? ''} />
        </Field>
      </div>
      <FormActions>
        <SubmitButton>{expense ? 'Save changes' : 'Save expense'}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Crown, Plus } from 'lucide-react';
import { saveGuestAction } from '@/actions/guests';
import { ActionForm, FormActions, SubmitButton } from '@/components/action-form';
import { Modal } from '@/components/modal';
import { Badge, Card, EmptyState, PageHeader, Pagination, TableWrap } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { all, scalar } from '@/lib/db';
import { formatDate } from '@/lib/utils';
import { GuestFields } from './guest-fields';

export const metadata: Metadata = { title: 'Guests' };

const PAGE_SIZE = 25;

export default async function GuestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser('guests');
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const filter = sp.filter ?? '';
  const page = Math.max(1, Number(sp.page) || 1);

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (q) {
    where.push('(g.name LIKE ? OR g.phone LIKE ? OR g.email LIKE ? OR g.id_number LIKE ? OR g.city LIKE ? OR g.company_name LIKE ?)');
    params.push(...Array(6).fill(`%${q}%`));
  }
  if (filter === 'vip') where.push('g.is_vip = 1');
  if (filter === 'blacklisted') where.push('g.is_blacklisted = 1');
  if (filter === 'inhouse') where.push(`EXISTS (SELECT 1 FROM bookings b WHERE b.guest_id = g.id AND b.status = 'checked_in')`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = scalar(`SELECT COUNT(*) FROM guests g ${whereSql}`, ...params);
  const rows = all<{
    id: number; name: string; phone: string | null; email: string | null; city: string | null; country: string | null;
    is_vip: number; is_blacklisted: number; stays: number; last_stay: string | null; in_house: number;
  }>(
    `SELECT g.id, g.name, g.phone, g.email, g.city, g.country, g.is_vip, g.is_blacklisted,
            (SELECT COUNT(*) FROM bookings b WHERE b.guest_id = g.id AND b.status IN ('checked_in','checked_out')) AS stays,
            (SELECT MAX(check_in_date) FROM bookings b WHERE b.guest_id = g.id AND b.status IN ('checked_in','checked_out')) AS last_stay,
            EXISTS (SELECT 1 FROM bookings b WHERE b.guest_id = g.id AND b.status = 'checked_in') AS in_house
       FROM guests g ${whereSql}
      ORDER BY g.id DESC LIMIT ? OFFSET ?`,
    ...params,
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE,
  );

  return (
    <>
      <PageHeader
        title="Guests"
        description="Guest directory with stay history, ID records and preferences."
        actions={
          <Modal title="Add guest" size="lg" trigger={<><Plus className="size-4" /> Add guest</>}>
            <ActionForm action={saveGuestAction}>
              <GuestFields />
              <FormActions>
                <SubmitButton>Save guest</SubmitButton>
              </FormActions>
            </ActionForm>
          </Modal>
        }
      />
      <Card>
        <form method="get" className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <input name="q" defaultValue={q} placeholder="Search name, phone, email, ID, city, company…" className="input max-w-md flex-1" />
          <select name="filter" defaultValue={filter} className="input w-auto">
            <option value="">All guests</option>
            <option value="inhouse">In-house now</option>
            <option value="vip">VIP</option>
            <option value="blacklisted">Blacklisted</option>
          </select>
          <button className="input w-auto cursor-pointer bg-indigo-600 font-medium text-white hover:bg-indigo-700">Search</button>
        </form>
        {rows.length === 0 ? (
          <EmptyState title="No guests found" description="Guests are added automatically when you create a booking." />
        ) : (
          <TableWrap>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Location</th>
                  <th className="text-right">Stays</th>
                  <th>Last stay</th>
                  <th>Tags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <Link href={`/guests/${g.id}`} className="flex items-center gap-1.5 font-medium hover:text-indigo-600">
                        {g.name} {g.is_vip ? <Crown className="size-3.5 text-amber-500" /> : null}
                      </Link>
                    </td>
                    <td>
                      <p>{g.phone ?? '—'}</p>
                      <p className="text-xs text-slate-500">{g.email}</p>
                    </td>
                    <td className="text-slate-600">{[g.city, g.country].filter(Boolean).join(', ') || '—'}</td>
                    <td className="text-right">{g.stays}</td>
                    <td className="whitespace-nowrap">{formatDate(g.last_stay)}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {g.in_house ? <Badge tone="green">In-house</Badge> : null}
                        {g.is_vip ? <Badge tone="yellow">VIP</Badge> : null}
                        {g.is_blacklisted ? <Badge tone="red">Blacklisted</Badge> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/guests" params={{ q, filter }} />
      </Card>
    </>
  );
}

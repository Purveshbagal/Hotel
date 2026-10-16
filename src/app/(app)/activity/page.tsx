import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, EmptyState, PageHeader, Pagination, TableWrap } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { all, scalar } from '@/lib/db';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Activity Log' };

const PAGE_SIZE = 50;

const ENTITY_LINKS: Record<string, string> = {
  booking: '/bookings/',
  guest: '/guests/',
  order: '/restaurant/',
};

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser('activity');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const userId = Number(sp.user) || 0;
  const q = sp.q?.trim() ?? '';

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (userId) {
    where.push('a.user_id = ?');
    params.push(userId);
  }
  if (q) {
    where.push('(a.action LIKE ? OR a.details LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = scalar(`SELECT COUNT(*) FROM activity_logs a ${whereSql}`, ...params);
  const rows = all<{ id: number; action: string; entity_type: string | null; entity_id: number | null; details: string | null; created_at: string; user_name: string | null }>(
    `SELECT a.*, u.name AS user_name FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id ${whereSql}
      ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    ...params,
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE,
  );
  const users = all<{ id: number; name: string }>('SELECT id, name FROM users ORDER BY name');

  return (
    <>
      <PageHeader title="Activity Log" description="Audit trail of every important action taken by staff." />
      <Card>
        <form method="get" className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <input name="q" defaultValue={q} placeholder="Search actions or details…" className="input max-w-sm" />
          <select name="user" defaultValue={userId || ''} className="input w-auto">
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <button className="input w-auto cursor-pointer font-medium hover:bg-slate-50">Filter</button>
        </form>
        {rows.length === 0 ? (
          <EmptyState title="No activity found" />
        ) : (
          <TableWrap>
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-xs text-slate-600">{formatDateTime(r.created_at)}</td>
                    <td className="whitespace-nowrap">{r.user_name ?? 'System'}</td>
                    <td className="whitespace-nowrap font-medium">{r.action}</td>
                    <td className="text-sm text-slate-600">
                      {r.entity_type && r.entity_id && ENTITY_LINKS[r.entity_type] ? (
                        <Link href={`${ENTITY_LINKS[r.entity_type]}${r.entity_id}`} className="link">
                          {r.details ?? `#${r.entity_id}`}
                        </Link>
                      ) : (
                        r.details ?? '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/activity" params={{ q, user: userId ? String(userId) : undefined }} />
      </Card>
    </>
  );
}

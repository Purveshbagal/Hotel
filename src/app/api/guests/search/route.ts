import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { all } from '@/lib/db';
import { can } from '@/lib/permissions';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, 'guests')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json([]);
  const like = `%${q}%`;
  const rows = all(
    `SELECT id, name, phone, email, city, id_type, id_number, is_vip, is_blacklisted
       FROM guests
      WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? OR id_number LIKE ?
      ORDER BY name LIMIT 12`,
    like, like, like, like,
  );
  return NextResponse.json(rows);
}

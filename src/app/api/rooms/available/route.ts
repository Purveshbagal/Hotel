import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { availableRooms } from '@/lib/services/booking';
import { isDateStr } from '@/lib/utils';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, 'frontdesk')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const from = sp.get('from');
  const to = sp.get('to');
  const exclude = Number(sp.get('exclude') ?? 0) || 0;
  if (!isDateStr(from) || !isDateStr(to) || to <= from) return NextResponse.json([]);
  return NextResponse.json(availableRooms(from, to, exclude));
}

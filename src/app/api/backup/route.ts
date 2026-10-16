import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { logActivity } from '@/lib/action';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { can } from '@/lib/permissions';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, 'settings')) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(os.tmpdir(), `hotel-backup-${stamp}-${process.pid}.db`);
  try {
    // Online backup: safe while the app is running.
    await getDb().backup(file);
    const data = await fs.readFile(file);
    logActivity(user.id, 'Downloaded database backup', 'settings', null);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': 'application/vnd.sqlite3',
        'Content-Disposition': `attachment; filename="hotel-backup-${stamp}.db"`,
        'Cache-Control': 'no-store',
      },
    });
  } finally {
    await fs.rm(file, { force: true });
  }
}

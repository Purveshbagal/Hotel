import { requireUser } from '@/lib/auth';

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">{children}</div>;
}

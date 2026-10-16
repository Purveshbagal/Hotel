'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !document.querySelector('[role="dialog"]') && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '')) router.refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [router]);
  return <button type="button" onClick={() => router.refresh()} className="inline-flex items-center gap-2 text-xs text-slate-500"><RefreshCw className="size-3.5" /> Refresh · updates every 15s</button>;
}

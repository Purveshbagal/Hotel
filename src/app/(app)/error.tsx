'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 rounded-full bg-amber-50 p-4 text-amber-600">
        <AlertTriangle className="size-8" />
      </div>
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="mt-1 max-w-md text-sm text-slate-500">
        The page could not be loaded. Please try again. If the problem continues, contact your administrator.
        {error.digest ? <span className="mt-2 block font-mono text-xs text-slate-400">Ref: {error.digest}</span> : null}
      </p>
      <Button onClick={reset} className="mt-6">
        Try again
      </Button>
    </div>
  );
}

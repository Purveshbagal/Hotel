'use client';

import { Printer } from 'lucide-react';
import { buttonClass } from './ui';

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass('primary', 'md', 'no-print')}>
      <Printer className="size-4" />
      {label}
    </button>
  );
}

export function CloseButton() {
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}
      className={buttonClass('secondary', 'md', 'no-print')}
    >
      Back
    </button>
  );
}

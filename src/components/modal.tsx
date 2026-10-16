'use client';

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { buttonClass, type ButtonSize, type ButtonVariant } from './ui';
import { cn } from '@/lib/utils';

const ModalContext = createContext<{ close: () => void } | null>(null);

export function useModal() {
  return useContext(ModalContext);
}

const WIDTHS = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Modal({
  title,
  description,
  trigger,
  triggerVariant = 'primary',
  triggerSize = 'md',
  triggerClassName,
  triggerTitle,
  size = 'md',
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  trigger: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerClassName?: string;
  triggerTitle?: string;
  size?: keyof typeof WIDTHS;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []);
    (dialogRef.current?.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea') ?? focusable()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'Tab') {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      previousFocus?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        title={triggerTitle}
        className={buttonClass(triggerVariant, triggerSize, triggerClassName)}
        onClick={() => setOpen(true)}
      >
        {trigger}
      </button>
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-[1px] sm:items-center"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn('my-8 w-full rounded-2xl bg-white shadow-2xl', WIDTHS[size])}>
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                  <div>
                    <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>
                    {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Close"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <div className="px-5 py-4">
                  <ModalContext.Provider value={{ close: () => setOpen(false) }}>{children}</ModalContext.Provider>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

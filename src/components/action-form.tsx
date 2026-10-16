'use client';

import { createContext, useContext, useRef, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { ActionState, FormAction } from '@/lib/action-types';
import { buttonClass, type ButtonSize, type ButtonVariant } from './ui';
import { useModal } from './modal';

const PendingContext = createContext(false);

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  confirm,
  id,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
  id?: string;
}) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const modal = useModal();

  // Results are handled inside the transition (not in an effect) so the toast and redirect
  // still happen when the action's revalidation removes this form from the page.
  const handle = (state: ActionState) => {
    if (!state) return;
    if (state.ok) {
      if (state.message) toast.success(state.message);
      if (resetOnSuccess) formRef.current?.reset();
      modal?.close();
      if (state.redirectTo) router.push(state.redirectTo);
    } else if (state.error) {
      toast.error(state.error);
    }
  };

  return (
    <form
      ref={formRef}
      id={id}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        if (confirm && !window.confirm(confirm)) return;
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        const fd = new FormData(e.currentTarget, submitter);
        startTransition(async () => {
          try {
            handle(await action(null, fd));
          } catch {
            toast.error('Could not reach the server. Check your connection and try again.');
          }
        });
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
    </form>
  );
}

export function SubmitButton({
  children,
  variant = 'primary',
  size = 'md',
  className,
  name,
  value,
  title,
  disabled = false,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  name?: string;
  value?: string;
  title?: string;
  disabled?: boolean;
}) {
  const pending = useContext(PendingContext);
  return (
    <button
      type="submit"
      name={name}
      value={value}
      title={title}
      disabled={pending || disabled}
      className={buttonClass(variant, size, className)}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

/** A one-click action button (with optional confirmation) that posts hidden fields to a server action. */
export function ActionButton({
  action,
  fields,
  confirm,
  children,
  variant = 'secondary',
  size = 'sm',
  className,
  title,
}: {
  action: FormAction;
  fields: Record<string, string | number>;
  confirm?: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  title?: string;
}) {
  return (
    <ActionForm action={action} confirm={confirm} className="inline-flex">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
      <SubmitButton variant={variant} size={size} className={className} title={title}>
        {children}
      </SubmitButton>
    </ActionForm>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">{children}</div>;
}

'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogIn, Eye, EyeOff } from 'lucide-react';
import { loginAction } from '@/actions/auth';
import { buttonClass } from '@/components/ui';

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, null);
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (state?.ok && state.redirectTo) router.replace(state.redirectTo);
  }, [state, router]);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {state?.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</div>
      ) : null}
      <label className="block">
        <span className="label">Username</span>
        <input name="username" className="input" autoComplete="username" autoFocus required />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <span className="relative block"><input name="password" type={showPassword ? 'text' : 'password'} className="input pr-12" autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute inset-y-0 right-0 px-3 text-slate-500">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span>
      </label>
      <button type="submit" disabled={pending || !!state?.ok} className={buttonClass('primary', 'lg', 'w-full')}>
        {pending || state?.ok ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
        Sign in
      </button>
    </form>
  );
}

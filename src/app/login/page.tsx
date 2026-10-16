import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Hotel } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { homeFor } from '@/lib/permissions';
import { getSettings } from '@/lib/settings';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  const settings = getSettings();

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.08fr_1fr]">
      <section className="login-panel relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:p-14 xl:p-20">
        <div className="login-arch pointer-events-none absolute -bottom-24 right-[-100px] h-[650px] w-[500px] rotate-12" />
        <div className="login-arch pointer-events-none absolute -bottom-16 right-[-40px] h-[540px] w-[380px] rotate-12" />
        <div className="relative flex items-center gap-3"><div className="rounded-2xl border border-white/20 p-3 text-[#dec895]"><Hotel className="size-7" /></div><div><p className="text-xl font-semibold">{settings.hotel_name}</p><p className="mt-1 text-xs uppercase tracking-[.2em] text-white/55">Hospitality workspace</p></div></div>
        <div className="relative my-20 max-w-lg">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[.25em] text-[#dec895]">Thoughtful service. Effortless operations.</p>
          <h1 className="text-5xl font-medium leading-[1.15] tracking-tight xl:text-6xl">Great hospitality<br /><span className="font-serif italic text-[#dec895]">starts here.</span></h1>
          <p className="mt-7 max-w-sm text-base leading-7 text-white/65">From the first reservation to the last table of the evening. One calm, connected space for your entire team.</p>
          <div className="mt-10 grid grid-cols-3 gap-3 border-t border-white/15 pt-6 text-sm"><div><p className="font-medium">Stay</p><p className="mt-1 text-xs text-white/50">Rooms & reservations</p></div><div><p className="font-medium">Dine</p><p className="mt-1 text-xs text-white/50">Tables & kitchen</p></div><div><p className="font-medium">Manage</p><p className="mt-1 text-xs text-white/50">Billing & insights</p></div></div>
        </div>
        <p className="relative text-xs text-white/45">© {new Date().getFullYear()} {settings.hotel_name} · Hotel & Restaurant Management</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md rounded-3xl border border-white bg-white/80 p-7 shadow-[0_16px_80px_#173c3510] sm:p-10">
          <div className="mb-8 inline-flex rounded-2xl bg-indigo-50 p-3 text-indigo-700"><Hotel className="size-7" /></div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-indigo-600">Staff workspace</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Welcome back.</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">Sign in to {settings.hotel_name} to start your day.</p>
          <div className="mt-8"><LoginForm /></div>
          <p className="mt-8 border-t border-slate-100 pt-5 text-center text-xs leading-5 text-slate-500">Need access or help signing in?<br />Contact your hotel administrator.</p>
        </div>
      </section>
    </div>
  );
}

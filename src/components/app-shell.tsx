'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity, BarChart3, BedDouble, BookOpen, Boxes, CalendarDays, ConciergeBell, LayoutDashboard, LogOut, Menu,
  NotebookTabs, Receipt, Settings, Sparkles, UserCog, Users, UtensilsCrossed, Wallet, Wrench, X, Hotel, KeyRound,
} from 'lucide-react';
import type { IconName, NavItem } from '@/lib/permissions';
import { cn, initials } from '@/lib/utils';
import { logoutAction } from '@/actions/auth';

const ICONS: Record<IconName, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  frontdesk: ConciergeBell,
  calendar: CalendarDays,
  bookings: NotebookTabs,
  guests: Users,
  rooms: BedDouble,
  housekeeping: Sparkles,
  maintenance: Wrench,
  restaurant: UtensilsCrossed,
  menu: BookOpen,
  inventory: Boxes,
  billing: Receipt,
  expenses: Wallet,
  reports: BarChart3,
  users: UserCog,
  settings: Settings,
  activity: Activity,
};

function isActive(pathname: string, href: string, all: NavItem[]) {
  if (pathname === href) return true;
  if (!pathname.startsWith(href + '/')) return false;
  // Prefer the most specific nav entry (e.g. /restaurant/menu over /restaurant)
  return !all.some((n) => n.href !== href && n.href.startsWith(href) && (pathname === n.href || pathname.startsWith(n.href + '/')));
}

export function AppShell({
  nav,
  hotelName,
  user,
  children,
}: {
  nav: NavItem[];
  hotelName: string;
  user: { name: string; roleLabel: string };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const sections: { name: string; items: NavItem[] }[] = [];
  for (const item of nav) {
    const s = sections.find((x) => x.name === item.section);
    if (s) s.items.push(item);
    else sections.push({ name: item.section, items: [item] });
  }

  const sidebar = (
    <div className="hospitality-sidebar flex h-full flex-col text-slate-300">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <div className="rounded-lg bg-indigo-500 p-1.5 text-white">
          <Hotel className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{hotelName}</p>
          <p className="text-xs text-slate-400">Hotel & Restaurant</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.name} className="mb-5">
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{section.name}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isActive(pathname, item.href, nav);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        active ? 'bg-white/10 text-white ring-1 ring-white/15' : 'hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <Icon className="size-4.5 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <Link href="/profile" className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-indigo-500 text-sm font-semibold text-white">
            {initials(user.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-xs text-slate-400">{user.roleLabel}</p>
          </div>
        </Link>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <Link
            href="/profile"
            className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs hover:bg-white/5 hover:text-white"
          >
            <KeyRound className="size-3.5" /> Profile
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs hover:bg-white/5 hover:text-white"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen"><a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3">Skip to content</a>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {open ? (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-xl">
            {sidebar}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1 text-slate-400 hover:text-white"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <p className="truncate font-semibold">{hotelName}</p>
        </header>
        <div className="no-print hidden h-16 items-center justify-between border-b border-slate-200/80 bg-white/80 px-8 lg:flex">
          <p className="text-sm text-slate-500">Workspace <span className="mx-3 text-slate-300">/</span><span className="font-medium text-slate-800">{nav.find(n => isActive(pathname, n.href, nav))?.label ?? 'My account'}</span></p>
          <div className="flex items-center gap-4"><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">Hotel & Restaurant</span><span className="text-sm text-slate-500">{user.name}</span></div>
        </div>
        <main id="main-content" className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn, labelize } from '@/lib/utils';

const BUTTON_VARIANTS = {
  primary: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700',
  secondary: 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
  warning: 'bg-amber-500 text-white shadow-sm hover:bg-amber-600',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  'danger-ghost': 'text-rose-600 hover:bg-rose-50',
} as const;

const BUTTON_SIZES = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3.5 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
export type ButtonSize = keyof typeof BUTTON_SIZES;

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-60',
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  href,
  variant,
  size,
  className,
  children,
  target,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
  target?: string;
}) {
  // File downloads (API routes) must be plain anchors: next/link would try to prefetch them.
  if (href.startsWith('/api/')) {
    return (
      <a href={href} target={target} className={buttonClass(variant, size, className)}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} target={target} prefetch={target ? false : undefined} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

const TONES = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  yellow: 'bg-amber-50 text-amber-700 ring-amber-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200',
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  confirmed: 'blue',
  checked_in: 'green',
  checked_out: 'gray',
  cancelled: 'red',
  no_show: 'orange',
  available: 'green',
  occupied: 'indigo',
  maintenance: 'yellow',
  out_of_order: 'red',
  clean: 'green',
  dirty: 'orange',
  inspected: 'purple',
  pending: 'yellow',
  in_progress: 'blue',
  completed: 'green',
  open: 'yellow',
  resolved: 'green',
  closed: 'gray',
  preparing: 'blue',
  served: 'purple',
  low: 'gray',
  normal: 'blue',
  high: 'orange',
  urgent: 'red',
  payment: 'green',
  refund: 'red',
  in: 'green',
  out: 'orange',
  adjust: 'blue',
  active: 'green',
  inactive: 'gray',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'gray'}>{label ?? labelize(status)}</Badge>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card', className)}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back ? (
        <Link href={back.href} className="mb-2 inline-block text-sm text-slate-500 hover:text-slate-800">
          ← {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'indigo',
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'indigo' | 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'orange' | 'gray';
  href?: string;
}) {
  const iconTones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-emerald-50 text-emerald-600',
    yellow: 'bg-amber-50 text-amber-600',
    red: 'bg-rose-50 text-rose-600',
    blue: 'bg-sky-50 text-sky-600',
    purple: 'bg-violet-50 text-violet-600',
    orange: 'bg-orange-50 text-orange-600',
    gray: 'bg-slate-100 text-slate-600',
  };
  const body = (
    <div className="card flex items-start gap-4 p-5 transition-shadow hover:shadow-md">
      {icon ? <div className={cn('rounded-lg p-2.5', iconTones[tone])}>{icon}</div> : null}
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-2xl font-bold text-slate-900">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Field({
  label,
  children,
  hint,
  required,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="label">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Checkbox({
  name,
  label,
  defaultChecked,
  hint,
}: {
  name: string;
  label: ReactNode;
  defaultChecked?: boolean;
  hint?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      <span className="text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}

export function Select({
  name,
  options,
  defaultValue,
  placeholder,
  required,
  className,
  disabled,
}: {
  name: string;
  options: { value: string | number; label: string }[];
  defaultValue?: string | number | null;
  placeholder?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ''}
      required={required}
      disabled={disabled}
      className={cn('input', className)}
    >
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400">
        <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      </div>
      <p className="font-medium text-slate-700">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function DescList({ items, columns = 2 }: { items: [ReactNode, ReactNode][]; columns?: 1 | 2 | 3 }) {
  const cols = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }[columns];
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3', cols)}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-slate-900">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set('page', String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
      <p className="text-slate-500">
        Page {page} of {pages} · {total} records
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <LinkButton href={href(page - 1)} variant="secondary" size="sm">
            Previous
          </LinkButton>
        ) : null}
        {page < pages ? (
          <LinkButton href={href(page + 1)} variant="secondary" size="sm">
            Next
          </LinkButton>
        ) : null}
      </div>
    </div>
  );
}

/** Link-based tab bar. */
export function Tabs({ tabs, active }: { tabs: { href: string; label: string; key: string; count?: number }[]; active: string }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            '-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium',
            t.key === active
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
          )}
        >
          {t.label}
          {t.count !== undefined ? (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{t.count}</span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

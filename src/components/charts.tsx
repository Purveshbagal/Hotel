'use client';

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const fmt = (symbol: string) => (v: unknown) =>
  `${symbol}${Number(v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export function RevenueChart({ data, currency }: { data: { label: string; revenue: number; expenses?: number }[]; currency: string }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={fmt(currency)} width={70} />
          <Tooltip formatter={(v) => fmt(currency)(v)} cursor={{ fill: '#f1f5f9' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="revenue" name="Collections" fill="#248779" radius={[4, 4, 0, 0]} />
          {data.some((d) => d.expenses !== undefined) ? (
            <Bar dataKey="expenses" name="Expenses" fill="#f97316" radius={[4, 4, 0, 0]} />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OccupancyChart({ data }: { data: { label: string; occupancy: number }[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="occ" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={45} />
          <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
          <Area type="monotone" dataKey="occupancy" name="Occupancy" stroke="#10b981" strokeWidth={2} fill="url(#occ)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const PIE_COLORS = ['#248779', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6', '#ec4899', '#64748b'];

export function DonutChart({ data, currency }: { data: { name: string; value: number }[]; currency?: string }) {
  const filtered = data.filter((d) => d.value > 0);
  if (!filtered.length) return <p className="py-16 text-center text-sm text-slate-400">No data for this period</p>;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={filtered} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
            {filtered.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => (currency ? fmt(currency)(v) : String(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

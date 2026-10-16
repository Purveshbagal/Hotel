'use client';

import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Crown, Search, UserPlus, Users, X } from 'lucide-react';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Badge } from '@/components/ui';
import { BOOKING_SOURCES, GENDERS, ID_TYPES, PAYMENT_METHODS } from '@/lib/constants';
import type { FormAction } from '@/lib/action-types';
import type { RoomWithType } from '@/lib/types';
import { cn, diffDays, formatDate, formatMoney, round2 } from '@/lib/utils';

type GuestHit = {
  id: number;
  name: string;
  phone: string | null;
  email?: string | null;
  city?: string | null;
  id_number?: string | null;
  is_vip?: number;
  is_blacklisted?: number;
};

export type BookingFormInitial = {
  id?: number;
  room_id?: number;
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
  rate_per_night?: number;
  extra_beds: number;
  extra_bed_rate?: number;
  discount_amount: number;
  source: string;
  special_requests: string;
  notes: string;
};

export function BookingForm({
  mode,
  action,
  currency,
  tax,
  today,
  initial,
  guest,
  lockCheckIn,
  walkIn,
}: {
  mode: 'create' | 'edit';
  action: FormAction;
  currency: string;
  tax: { enabled: boolean; threshold: number; low: number; high: number };
  today: string;
  initial: BookingFormInitial;
  guest?: GuestHit | null;
  lockCheckIn?: boolean;
  walkIn?: boolean;
}) {
  const [checkIn, setCheckIn] = useState(initial.check_in_date);
  const [checkOut, setCheckOut] = useState(initial.check_out_date);
  const [rooms, setRooms] = useState<RoomWithType[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomId, setRoomId] = useState<number | ''>(initial.room_id ?? '');
  const [rate, setRate] = useState<string>(initial.rate_per_night !== undefined ? String(initial.rate_per_night) : '');
  const [extraBeds, setExtraBeds] = useState(String(initial.extra_beds));
  const [extraBedRate, setExtraBedRate] = useState(initial.extra_bed_rate !== undefined ? String(initial.extra_bed_rate) : '0');
  const [discount, setDiscount] = useState(String(initial.discount_amount || ''));
  const [adults, setAdults] = useState(String(initial.adults));
  const [children, setChildren] = useState(String(initial.children));
  const [checkInNow, setCheckInNow] = useState(!!walkIn);

  const [guestMode, setGuestMode] = useState<'existing' | 'new'>(guest ? 'existing' : 'new');
  const [selectedGuest, setSelectedGuest] = useState<GuestHit | null>(guest ?? null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GuestHit[]>([]);
  const [searching, setSearching] = useState(false);

  const datesValid = !!checkIn && !!checkOut && checkOut > checkIn;
  const nights = datesValid ? diffDays(checkIn, checkOut) : 0;

  useEffect(() => {
    if (!datesValid) {
      setRooms([]);
      return;
    }
    const ctrl = new AbortController();
    setLoadingRooms(true);
    fetch(`/api/rooms/available?from=${checkIn}&to=${checkOut}&exclude=${initial.id ?? 0}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: RoomWithType[]) => setRooms(data))
      .catch(() => {})
      .finally(() => setLoadingRooms(false));
    return () => ctrl.abort();
  }, [checkIn, checkOut, datesValid, initial.id]);

  useEffect(() => {
    if (guestMode !== 'existing' || selectedGuest || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setSearching(true);
      fetch(`/api/guests/search?q=${encodeURIComponent(query.trim())}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then(setResults)
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, guestMode, selectedGuest]);

  const selectedRoom = rooms.find((r) => r.id === roomId);
  const roomUnavailable = roomId !== '' && datesValid && !loadingRooms && !selectedRoom;

  const grouped = useMemo(() => {
    const map = new Map<string, RoomWithType[]>();
    for (const r of rooms) {
      const list = map.get(r.type_name) ?? [];
      list.push(r);
      map.set(r.type_name, list);
    }
    return [...map.entries()];
  }, [rooms]);

  const rateNum = Number(rate) || 0;
  const roomTotal = round2(nights * rateNum + nights * (Number(extraBeds) || 0) * (Number(extraBedRate) || 0));
  const discountNum = Math.min(Number(discount) || 0, roomTotal);
  const taxRate = tax.enabled ? (rateNum > tax.threshold ? tax.high : tax.low) : 0;
  const taxable = round2(roomTotal - discountNum);
  const taxAmount = round2((taxable * taxRate) / 100);
  const grandTotal = round2(taxable + taxAmount);
  const capacity = selectedRoom ? selectedRoom.max_adults + (Number(extraBeds) || 0) : null;

  const canCheckInNow = mode === 'create' && datesValid && checkIn <= today && checkOut > today;

  return (
    <ActionForm action={action} className="grid gap-6 xl:grid-cols-3">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="space-y-6 xl:col-span-2">
        {/* Guest */}
        {mode === 'create' ? (
          <section className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Guest</h2>
              <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
                {(['existing', 'new'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setGuestMode(m)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium',
                      guestMode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                    )}
                  >
                    {m === 'existing' ? <Users className="size-4" /> : <UserPlus className="size-4" />}
                    {m === 'existing' ? 'Existing guest' : 'New guest'}
                  </button>
                ))}
              </div>
            </div>

            {guestMode === 'existing' ? (
              selectedGuest ? (
                <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
                  <input type="hidden" name="guest_id" value={selectedGuest.id} />
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      {selectedGuest.name}
                      {selectedGuest.is_vip ? <Crown className="size-4 text-amber-500" /> : null}
                    </p>
                    <p className="text-sm text-slate-600">{[selectedGuest.phone, selectedGuest.email].filter(Boolean).join(' · ')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedGuest(null)}
                    className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-800"
                    aria-label="Change guest"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      className="input pl-9"
                      placeholder="Search by name, phone, email or ID number…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="mt-2 max-h-64 overflow-y-auto">
                    {searching ? <p className="px-1 py-2 text-sm text-slate-500">Searching…</p> : null}
                    {!searching && query.trim().length >= 2 && results.length === 0 ? (
                      <p className="px-1 py-2 text-sm text-slate-500">
                        No guest found.{' '}
                        <button type="button" className="link" onClick={() => setGuestMode('new')}>
                          Create a new guest
                        </button>
                      </p>
                    ) : null}
                    {results.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        disabled={!!g.is_blacklisted}
                        onClick={() => setSelectedGuest(g)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span>
                          <span className="font-medium">{g.name}</span>
                          <span className="ml-2 text-sm text-slate-500">{[g.phone, g.city].filter(Boolean).join(' · ')}</span>
                        </span>
                        {g.is_blacklisted ? <Badge tone="red">Blacklisted</Badge> : g.is_vip ? <Badge tone="yellow">VIP</Badge> : null}
                      </button>
                    ))}
                  </div>
                </div>
              )
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Full name <span className="text-rose-500">*</span></span>
                  <input name="guest_name" className="input" required maxLength={120} />
                </label>
                <label className="block">
                  <span className="label">Phone <span className="text-rose-500">*</span></span>
                  <input name="guest_phone" className="input" required maxLength={30} inputMode="tel" />
                </label>
                <label className="block">
                  <span className="label">Email</span>
                  <input name="guest_email" type="email" className="input" maxLength={150} />
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="label">Gender</span>
                    <select name="guest_gender" className="input" defaultValue="">
                      <option value="">—</option>
                      {GENDERS.map((g) => (
                        <option key={g.value} value={g.value}>{g.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Nationality</span>
                    <input name="guest_nationality" className="input" defaultValue="Indian" maxLength={60} />
                  </label>
                </div>
                <label className="block">
                  <span className="label">ID proof type</span>
                  <select name="guest_id_type" className="input" defaultValue="aadhaar">
                    <option value="">—</option>
                    {ID_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">ID number</span>
                  <input name="guest_id_number" className="input" maxLength={60} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="label">Address</span>
                  <input name="guest_address" className="input" maxLength={300} />
                </label>
                <div className="grid grid-cols-3 gap-4 sm:col-span-2">
                  <label className="block">
                    <span className="label">City</span>
                    <input name="guest_city" className="input" maxLength={80} />
                  </label>
                  <label className="block">
                    <span className="label">State</span>
                    <input name="guest_state" className="input" maxLength={80} />
                  </label>
                  <label className="block">
                    <span className="label">Country</span>
                    <input name="guest_country" className="input" defaultValue="India" maxLength={80} />
                  </label>
                </div>
                <label className="block">
                  <span className="label">Company (for GST invoice)</span>
                  <input name="guest_company" className="input" maxLength={150} />
                </label>
                <label className="block">
                  <span className="label">Company GSTIN</span>
                  <input name="guest_gstin" className="input uppercase" maxLength={20} />
                </label>
              </div>
            )}
          </section>
        ) : null}

        {/* Stay */}
        <section className="card p-5">
          <h2 className="mb-4 text-base font-semibold">Stay details</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="label">Check-in <span className="text-rose-500">*</span></span>
              <input
                type="date"
                name="check_in_date"
                className="input"
                value={checkIn}
                readOnly={lockCheckIn}
                onChange={(e) => {
                  setCheckIn(e.target.value);
                  if (e.target.value && (!checkOut || checkOut <= e.target.value)) {
                    const d = new Date(`${e.target.value}T00:00:00Z`);
                    d.setUTCDate(d.getUTCDate() + 1);
                    setCheckOut(d.toISOString().slice(0, 10));
                  }
                }}
                required
              />
            </label>
            <label className="block">
              <span className="label">Check-out <span className="text-rose-500">*</span></span>
              <input
                type="date"
                name="check_out_date"
                className="input"
                value={checkOut}
                min={checkIn || undefined}
                onChange={(e) => setCheckOut(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="label">Adults</span>
              <input type="number" name="adults" min={1} max={20} className="input" value={adults} onChange={(e) => setAdults(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Children</span>
              <input type="number" name="children" min={0} max={20} className="input" value={children} onChange={(e) => setChildren(e.target.value)} />
            </label>
          </div>
          {datesValid ? (
            <p className="mt-2 text-sm text-slate-500">
              {formatDate(checkIn)} → {formatDate(checkOut)} · <strong>{nights}</strong> night{nights > 1 ? 's' : ''}
            </p>
          ) : checkIn && checkOut ? (
            <p className="mt-2 text-sm text-rose-600">Check-out must be after check-in.</p>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="label">Room <span className="text-rose-500">*</span></span>
              <select
                name="room_id"
                className="input"
                value={roomId}
                required
                onChange={(e) => {
                  const id = Number(e.target.value) || '';
                  setRoomId(id);
                  const room = rooms.find((r) => r.id === id);
                  if (room) {
                    setRate(String(room.base_rate));
                    setExtraBedRate(String(room.extra_bed_rate));
                  }
                }}
              >
                <option value="">
                  {!datesValid ? 'Choose dates first' : loadingRooms ? 'Loading available rooms…' : rooms.length ? 'Select a room' : 'No rooms available for these dates'}
                </option>
                {roomUnavailable ? <option value={roomId}>Current room (not available for new dates)</option> : null}
                {grouped.map(([type, list]) => (
                  <optgroup key={type} label={`${type} — ${formatMoney(list[0].base_rate, currency)}/night`}>
                    {list.map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.room_number}
                        {r.floor ? ` · ${r.floor}` : ''}
                        {r.status === 'maintenance' ? ' · under maintenance' : ''}
                        {r.housekeeping_status === 'dirty' ? ' · needs cleaning' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {roomUnavailable ? (
                <span className="mt-1 block text-xs text-rose-600">
                  The selected room is already booked for some of these dates. Choose another room.
                </span>
              ) : null}
              {selectedRoom && capacity !== null && Number(adults) > capacity ? (
                <span className="mt-1 block text-xs text-amber-600">
                  {selectedRoom.type_name} allows {selectedRoom.max_adults} adults. Consider adding an extra bed.
                </span>
              ) : null}
            </label>
            <label className="block">
              <span className="label">Rate per night ({currency})</span>
              <input type="number" name="rate_per_night" min={0} step="0.01" className="input" value={rate} onChange={(e) => setRate(e.target.value)} required />
            </label>
            <label className="block">
              <span className="label">Discount ({currency})</span>
              <input type="number" name="discount_amount" min={0} step="0.01" className="input" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
            </label>
            <label className="block">
              <span className="label">Extra beds</span>
              <input type="number" name="extra_beds" min={0} max={10} className="input" value={extraBeds} onChange={(e) => setExtraBeds(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Extra bed rate / night ({currency})</span>
              <input type="number" name="extra_bed_rate" min={0} step="0.01" className="input" value={extraBedRate} onChange={(e) => setExtraBedRate(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Booking source</span>
              <select name="source" className="input" defaultValue={initial.source}>
                {BOOKING_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Special requests</span>
              <textarea name="special_requests" rows={2} className="input" defaultValue={initial.special_requests} maxLength={1000} />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Internal notes</span>
              <textarea name="notes" rows={2} className="input" defaultValue={initial.notes} maxLength={1000} />
            </label>
          </div>
        </section>

        {mode === 'create' ? (
          <section className="card p-5">
            <h2 className="mb-4 text-base font-semibold">Advance payment</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="label">Amount ({currency})</span>
                <input type="number" name="advance_amount" min={0} step="0.01" className="input" placeholder="0" />
              </label>
              <label className="block">
                <span className="label">Method</span>
                <select name="advance_method" className="input" defaultValue="cash">
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Reference / Txn ID</span>
                <input name="advance_reference" className="input" maxLength={100} />
              </label>
            </div>
          </section>
        ) : null}
      </div>

      {/* Summary */}
      <aside className="xl:col-span-1">
        <div className="card sticky top-6 p-5">
          <h2 className="mb-4 text-base font-semibold">Summary</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Room</dt>
              <dd className="font-medium">{selectedRoom ? `${selectedRoom.room_number} · ${selectedRoom.type_name}` : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Nights</dt>
              <dd className="font-medium">{nights || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Guests</dt>
              <dd className="font-medium">
                {adults} adult{Number(adults) === 1 ? '' : 's'}
                {Number(children) ? `, ${children} child${Number(children) === 1 ? '' : 'ren'}` : ''}
              </dd>
            </div>
            <div className="my-3 border-t border-dashed border-slate-200" />
            <div className="flex justify-between">
              <dt className="text-slate-500">Room charges</dt>
              <dd>{formatMoney(roomTotal, currency)}</dd>
            </div>
            {discountNum > 0 ? (
              <div className="flex justify-between text-emerald-700">
                <dt>Discount</dt>
                <dd>-{formatMoney(discountNum, currency)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-slate-500">Tax ({taxRate}%)</dt>
              <dd>{formatMoney(taxAmount, currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
              <dt>Estimated total</dt>
              <dd>{formatMoney(grandTotal, currency)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-slate-500">Extra services and restaurant bills are added to the folio during the stay.</p>

          {canCheckInNow ? (
            <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <input
                type="checkbox"
                name="check_in_now"
                checked={checkInNow}
                onChange={(e) => setCheckInNow(e.target.checked)}
                className="mt-0.5 size-4 rounded border-slate-300 text-emerald-600"
              />
              <span className="text-sm">
                <span className="flex items-center gap-1 font-medium text-emerald-800">
                  <BadgeCheck className="size-4" /> Check in immediately
                </span>
                <span className="text-xs text-emerald-700">For walk-in guests arriving now.</span>
              </span>
            </label>
          ) : null}

          <SubmitButton size="lg" className="mt-5 w-full">
            {mode === 'create' ? (checkInNow && canCheckInNow ? 'Create & check in' : 'Create booking') : 'Save changes'}
          </SubmitButton>
          {mode === 'edit' && lockCheckIn ? (
            <p className="mt-3 text-xs text-slate-500">Guest is in-house, so the check-in date is locked.</p>
          ) : null}
        </div>
      </aside>
    </ActionForm>
  );
}

'use client';
import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { settleOrderAction } from '@/actions/restaurant';
import { ActionForm, SubmitButton } from './action-form';
import { PAYMENT_METHODS } from '@/lib/constants';
import { formatMoney, round2 } from '@/lib/utils';
export function RestaurantPayment({ id, total, currency }: { id: number; total: number; currency: string }) {
  const [method, setMethod] = useState('cash');
  const [split, setSplit] = useState(false);
  const [secondMethod, setSecondMethod] = useState('upi');
  const [second, setSecond] = useState('');
  const [received, setReceived] = useState('');
  const secondAmount = split ? Number(second) || 0 : 0;
  const first = round2(total - secondAmount);
  const cash = method === 'cash' ? first : split && secondMethod === 'cash' ? secondAmount : 0;
  const money = (n: number) => formatMoney(n, currency);
  return <ActionForm action={settleOrderAction} className="space-y-3" confirm={`Confirm receipt of ${money(total)} and close this bill?`}>
    <input type="hidden" name="id" value={id} /><input type="hidden" name="settlement" value="paid" />
    <label className="block"><span className="label">Payment method {split ? `· ${money(first)}` : ''}</span><select name="payment_method" className="input" value={method} onChange={e => { setMethod(e.target.value); if (e.target.value === secondMethod) setSecondMethod(PAYMENT_METHODS.find(m => m.value !== e.target.value)!.value); }}>{PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
    <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={split} onChange={e => setSplit(e.target.checked)} />Split across two payment methods</label>
    {split && <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3"><label><span className="label">Second method</span><select name="second_method" className="input" value={secondMethod} onChange={e => setSecondMethod(e.target.value)}>{PAYMENT_METHODS.map(m => <option key={m.value} value={m.value} disabled={m.value === method}>{m.label}</option>)}</select></label><label><span className="label">Amount</span><input className="input" name="second_amount" type="number" min="0.01" max={Math.max(0, total - 0.01)} step="0.01" required value={second} onChange={e => setSecond(e.target.value)} /></label></div>}
    {cash > 0 && <label className="block"><span className="label">Cash tendered (optional)</span><input className="input" name="cash_received" type="number" min={cash} step="0.01" placeholder={String(cash)} value={received} onChange={e => setReceived(e.target.value)} /><span className="mt-2 block text-sm font-medium text-indigo-700">Change: {money(Math.max(0, round2((Number(received) || cash) - cash)))}</span></label>}
    <SubmitButton className="w-full" variant="success"><Wallet className="size-4" />Receive {money(total)}</SubmitButton>
  </ActionForm>;
}

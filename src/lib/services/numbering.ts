import { get } from '../db';
import { getSettings } from '../settings';
import { financialYear } from '../utils';

function next(counter: string): number {
  const row = get<{ value: number }>(
    `INSERT INTO counters(name, value) VALUES (?, 1)
     ON CONFLICT(name) DO UPDATE SET value = value + 1
     RETURNING value`,
    counter,
  );
  return row!.value;
}

function clean(prefix: string, fallback: string) {
  return (prefix || fallback).trim().replace(/\s+/g, '');
}

export function nextBookingNo(): string {
  const year = new Date().getFullYear();
  const prefix = clean(getSettings().booking_prefix, 'BK');
  return `${prefix}-${year}-${String(next(`booking:${year}`)).padStart(4, '0')}`;
}

export function nextInvoiceNo(): string {
  const fy = financialYear();
  const prefix = clean(getSettings().invoice_prefix, 'INV');
  return `${prefix}/${fy}/${String(next(`invoice:${fy}`)).padStart(4, '0')}`;
}

export function nextReceiptNo(): string {
  const fy = financialYear();
  const prefix = clean(getSettings().receipt_prefix, 'RCP');
  return `${prefix}/${fy}/${String(next(`receipt:${fy}`)).padStart(4, '0')}`;
}

export function nextOrderNo(): string {
  const year = new Date().getFullYear();
  const prefix = clean(getSettings().order_prefix, 'ORD');
  return `${prefix}-${year}-${String(next(`order:${year}`)).padStart(5, '0')}`;
}

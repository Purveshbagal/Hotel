import { cache } from 'react';
import { all } from './db';
import { DEFAULT_SETTINGS, type Settings } from './settings-defaults';

export { DEFAULT_SETTINGS, type Settings };

export const getSettings = cache((): Settings => {
  const rows = all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in settings) (settings as Record<string, string>)[row.key] = row.value;
  }
  return settings;
});

export function taxEnabled(s: Settings): boolean {
  return s.tax_enabled === '1';
}

/** GST slab for room tariff: the rate depends on the per-night tariff. */
export function roomTaxRate(ratePerNight: number, s: Settings): number {
  if (!taxEnabled(s)) return 0;
  const threshold = Number(s.room_tax_threshold) || 0;
  return ratePerNight > threshold ? Number(s.room_tax_rate_high) || 0 : Number(s.room_tax_rate_low) || 0;
}

export function effectiveTaxRate(rate: number, s: Settings): number {
  return taxEnabled(s) ? rate : 0;
}

export function hotelAddressLines(s: Settings): string[] {
  const cityLine = [s.hotel_city, s.hotel_state, s.hotel_pincode].filter(Boolean).join(', ');
  return [s.hotel_address, cityLine].filter(Boolean);
}

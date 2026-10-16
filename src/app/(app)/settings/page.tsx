import type { Metadata } from 'next';
import { Database, Download, Sparkles } from 'lucide-react';
import { loadDemoDataAction, saveSettingsAction } from '@/actions/admin';
import { ActionButton, ActionForm, SubmitButton } from '@/components/action-form';
import { Card, CardHeader, Checkbox, Field, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { databasePath, scalar } from '@/lib/db';
import { getSettings } from '@/lib/settings';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  await requireUser('settings');
  const s = getSettings();
  const empty = scalar('SELECT COUNT(*) FROM rooms') === 0 && scalar('SELECT COUNT(*) FROM bookings') === 0;

  return (
    <>
      <PageHeader title="Settings" description="Hotel profile, taxes, invoices and system data." />
      <div className="grid gap-6 xl:grid-cols-3">
        <ActionForm action={saveSettingsAction} className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Hotel profile" description="Shown on invoices, receipts and the login screen." />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Hotel name" required>
                <input name="hotel_name" className="input" required maxLength={120} defaultValue={s.hotel_name} />
              </Field>
              <Field label="Tagline">
                <input name="hotel_tagline" className="input" maxLength={150} defaultValue={s.hotel_tagline} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <input name="hotel_address" className="input" maxLength={300} defaultValue={s.hotel_address} />
              </Field>
              <div className="grid grid-cols-3 gap-4 sm:col-span-2">
                <Field label="City">
                  <input name="hotel_city" className="input" maxLength={80} defaultValue={s.hotel_city} />
                </Field>
                <Field label="State">
                  <input name="hotel_state" className="input" maxLength={80} defaultValue={s.hotel_state} />
                </Field>
                <Field label="PIN code">
                  <input name="hotel_pincode" className="input" maxLength={20} defaultValue={s.hotel_pincode} />
                </Field>
              </div>
              <Field label="Phone">
                <input name="hotel_phone" className="input" maxLength={50} defaultValue={s.hotel_phone} />
              </Field>
              <Field label="Email">
                <input name="hotel_email" type="email" className="input" maxLength={150} defaultValue={s.hotel_email} />
              </Field>
              <Field label="Website">
                <input name="hotel_website" className="input" maxLength={150} defaultValue={s.hotel_website} />
              </Field>
              <Field label="GSTIN" hint="15-character GST number">
                <input name="hotel_gstin" className="input uppercase" maxLength={15} defaultValue={s.hotel_gstin} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Front office" />
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <Field label="Standard check-in time">
                <input type="time" name="check_in_time" className="input" defaultValue={s.check_in_time} />
              </Field>
              <Field label="Standard check-out time">
                <input type="time" name="check_out_time" className="input" defaultValue={s.check_out_time} />
              </Field>
              <Field label="Currency symbol">
                <input name="currency_symbol" className="input" maxLength={5} defaultValue={s.currency_symbol} />
              </Field>
              <div className="sm:col-span-3">
                <Checkbox name="require_id_at_checkin" label="Require guest ID proof before check-in" defaultChecked={s.require_id_at_checkin === '1'} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Taxes (GST)" description="Room tax slab is chosen from the per-night tariff." />
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <div className="flex flex-wrap gap-6 sm:col-span-3">
                <Checkbox name="tax_enabled" label="Charge tax" defaultChecked={s.tax_enabled === '1'} hint="Untick if the hotel is not GST registered" />
                <Checkbox name="split_tax" label="Show as CGST + SGST" defaultChecked={s.split_tax === '1'} hint="Untick for IGST / single tax line" />
              </div>
              <Field label="Tax label">
                <input name="tax_label" className="input" maxLength={20} defaultValue={s.tax_label} />
              </Field>
              <Field label="Room slab threshold (per night)">
                <input type="number" name="room_tax_threshold" className="input" min={0} step="0.01" defaultValue={s.room_tax_threshold} />
              </Field>
              <div />
              <Field label="Room tax ≤ threshold (%)">
                <input type="number" name="room_tax_rate_low" className="input" min={0} max={100} step="0.01" defaultValue={s.room_tax_rate_low} />
              </Field>
              <Field label="Room tax > threshold (%)">
                <input type="number" name="room_tax_rate_high" className="input" min={0} max={100} step="0.01" defaultValue={s.room_tax_rate_high} />
              </Field>
              <div />
              <Field label="Default service tax (%)" hint="Laundry, transport, other charges">
                <input type="number" name="service_tax_rate" className="input" min={0} max={100} step="0.01" defaultValue={s.service_tax_rate} />
              </Field>
              <Field label="Default food tax (%)" hint="Used for new menu items">
                <input type="number" name="food_tax_rate" className="input" min={0} max={100} step="0.01" defaultValue={s.food_tax_rate} />
              </Field>
            </div>
            <p className="px-5 pb-5 text-xs text-slate-500">
              Changes apply to new bookings and charges. Existing bookings keep the tax rate they were created with (it is recalculated when the booking rate is edited).
            </p>
          </Card>

          <Card>
            <CardHeader title="Numbering & invoice text" />
            <div className="grid gap-4 p-5 sm:grid-cols-4">
              <Field label="Booking prefix">
                <input name="booking_prefix" className="input" maxLength={10} defaultValue={s.booking_prefix} />
              </Field>
              <Field label="Invoice prefix">
                <input name="invoice_prefix" className="input" maxLength={10} defaultValue={s.invoice_prefix} />
              </Field>
              <Field label="Receipt prefix">
                <input name="receipt_prefix" className="input" maxLength={10} defaultValue={s.receipt_prefix} />
              </Field>
              <Field label="Order prefix">
                <input name="order_prefix" className="input" maxLength={10} defaultValue={s.order_prefix} />
              </Field>
              <Field label="Invoice terms & conditions" className="sm:col-span-4">
                <textarea name="invoice_terms" rows={3} className="input" maxLength={2000} defaultValue={s.invoice_terms} />
              </Field>
              <Field label="Invoice footer" className="sm:col-span-4">
                <input name="invoice_footer" className="input" maxLength={300} defaultValue={s.invoice_footer} />
              </Field>
            </div>
          </Card>

          <div className="flex justify-end">
            <SubmitButton size="lg">Save settings</SubmitButton>
          </div>
        </ActionForm>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Backup" />
            <div className="space-y-3 p-5 text-sm">
              <p className="text-slate-600">
                Download a complete copy of the database. Keep backups somewhere safe (e.g. Google Drive or a USB drive) — take one every day.
              </p>
              <a href="/api/backup" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 font-medium text-white hover:bg-indigo-700">
                <Download className="size-4" /> Download backup
              </a>
              <p className="flex items-start gap-2 break-all rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                <Database className="mt-0.5 size-3.5 shrink-0" /> {databasePath()}
              </p>
              <p className="text-xs text-slate-500">
                To restore, stop the app and replace this file with a downloaded backup.
              </p>
            </div>
          </Card>
          {empty ? (
            <Card>
              <CardHeader title="Demo data" />
              <div className="space-y-3 p-5 text-sm">
                <p className="text-slate-600">
                  Load sample room types, rooms, guests, bookings, menu, inventory and expenses to explore the system. Only available while the system is empty.
                </p>
                <ActionButton action={loadDemoDataAction} fields={{}} variant="secondary" size="md" confirm="Load demo data into this empty system?">
                  <Sparkles className="size-4" /> Load demo data
                </ActionButton>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

import { Checkbox, Field, Select } from '@/components/ui';
import { GENDERS, ID_TYPES } from '@/lib/constants';
import type { Guest } from '@/lib/types';

/** Shared guest form fields (used in the create modal and the guest profile page). */
export function GuestFields({ guest }: { guest?: Guest }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {guest ? <input type="hidden" name="id" value={guest.id} /> : null}
      <Field label="Full name" required>
        <input name="name" className="input" required maxLength={120} defaultValue={guest?.name} />
      </Field>
      <Field label="Phone">
        <input name="phone" className="input" maxLength={30} inputMode="tel" defaultValue={guest?.phone ?? ''} />
      </Field>
      <Field label="Email">
        <input name="email" type="email" className="input" maxLength={150} defaultValue={guest?.email ?? ''} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Gender">
          <Select name="gender" options={GENDERS} placeholder="—" defaultValue={guest?.gender} />
        </Field>
        <Field label="Date of birth">
          <input name="date_of_birth" type="date" className="input" defaultValue={guest?.date_of_birth ?? ''} />
        </Field>
      </div>
      <Field label="ID proof type">
        <Select name="id_type" options={ID_TYPES} placeholder="—" defaultValue={guest?.id_type ?? 'aadhaar'} />
      </Field>
      <Field label="ID number">
        <input name="id_number" className="input" maxLength={60} defaultValue={guest?.id_number ?? ''} />
      </Field>
      <Field label="Nationality">
        <input name="nationality" className="input" maxLength={60} defaultValue={guest?.nationality ?? 'Indian'} />
      </Field>
      <Field label="Address">
        <input name="address" className="input" maxLength={300} defaultValue={guest?.address ?? ''} />
      </Field>
      <div className="grid grid-cols-2 gap-4 sm:col-span-2 sm:grid-cols-4">
        <Field label="City">
          <input name="city" className="input" maxLength={80} defaultValue={guest?.city ?? ''} />
        </Field>
        <Field label="State">
          <input name="state" className="input" maxLength={80} defaultValue={guest?.state ?? ''} />
        </Field>
        <Field label="Country">
          <input name="country" className="input" maxLength={80} defaultValue={guest?.country ?? 'India'} />
        </Field>
        <Field label="PIN code">
          <input name="pincode" className="input" maxLength={20} defaultValue={guest?.pincode ?? ''} />
        </Field>
      </div>
      <Field label="Company name">
        <input name="company_name" className="input" maxLength={150} defaultValue={guest?.company_name ?? ''} />
      </Field>
      <Field label="Company GSTIN">
        <input name="company_gstin" className="input uppercase" maxLength={20} defaultValue={guest?.company_gstin ?? ''} />
      </Field>
      <Field label="Notes / preferences" className="sm:col-span-2">
        <textarea name="notes" rows={2} className="input" maxLength={1000} defaultValue={guest?.notes ?? ''} />
      </Field>
      <div className="flex flex-wrap gap-6 sm:col-span-2">
        <Checkbox name="is_vip" label="VIP guest" defaultChecked={!!guest?.is_vip} />
        <Checkbox name="is_blacklisted" label="Blacklisted" hint="Blocks new bookings and check-in" defaultChecked={!!guest?.is_blacklisted} />
      </div>
    </div>
  );
}

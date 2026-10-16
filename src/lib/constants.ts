export type Option = { value: string; label: string };

export const BOOKING_STATUSES = ['confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const ROOM_STATUSES = ['available', 'occupied', 'maintenance', 'out_of_order'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const HK_STATUSES = ['clean', 'dirty', 'in_progress', 'inspected'] as const;
export type HousekeepingStatus = (typeof HK_STATUSES)[number];

export const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const MAINTENANCE_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export const ORDER_TYPES = ['room_service', 'dine_in', 'takeaway'] as const;
export const ORDER_STATUSES = ['pending', 'preparing', 'served', 'completed', 'cancelled'] as const;

export const BOOKING_SOURCES: Option[] = [
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'phone', label: 'Phone' },
  { value: 'website', label: 'Website' },
  { value: 'ota', label: 'OTA (Booking.com / MMT / Agoda…)' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'travel_agent', label: 'Travel Agent' },
  { value: 'other', label: 'Other' },
];

export const PAYMENT_METHODS: Option[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Credit / Debit Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online / OTA Prepaid' },
  { value: 'other', label: 'Other' },
];

export const ID_TYPES: Option[] = [
  { value: 'aadhaar', label: 'Aadhaar Card' },
  { value: 'passport', label: 'Passport' },
  { value: 'driving_license', label: 'Driving License' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'pan', label: 'PAN Card' },
  { value: 'other', label: 'Other' },
];

export const GENDERS: Option[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export const CHARGE_CATEGORIES: Option[] = [
  { value: 'food', label: 'Food & Beverage' },
  { value: 'room_service', label: 'Room Service' },
  { value: 'minibar', label: 'Minibar' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'transport', label: 'Transport / Cab' },
  { value: 'spa', label: 'Spa / Wellness' },
  { value: 'telephone', label: 'Telephone / Internet' },
  { value: 'early_checkin', label: 'Early Check-in' },
  { value: 'late_checkout', label: 'Late Check-out' },
  { value: 'damage', label: 'Damage / Loss' },
  { value: 'extra_service', label: 'Extra Service' },
  { value: 'other', label: 'Other' },
];

export const EXPENSE_CATEGORIES: Option[] = [
  { value: 'salaries', label: 'Salaries & Wages' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'water', label: 'Water' },
  { value: 'gas', label: 'Gas / Fuel' },
  { value: 'internet', label: 'Internet & Phone' },
  { value: 'maintenance', label: 'Repairs & Maintenance' },
  { value: 'supplies', label: 'Housekeeping Supplies' },
  { value: 'kitchen', label: 'Kitchen / F&B Purchase' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'commission', label: 'OTA / Agent Commission' },
  { value: 'rent', label: 'Rent / Lease' },
  { value: 'taxes', label: 'Taxes & Licences' },
  { value: 'other', label: 'Other' },
];

export const HK_TASK_TYPES: Option[] = [
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'deep_cleaning', label: 'Deep Cleaning' },
  { value: 'linen_change', label: 'Linen Change' },
  { value: 'turndown', label: 'Turndown Service' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'restock', label: 'Restock Amenities' },
];

export const INVENTORY_CATEGORIES = ['Linen', 'Toiletries', 'Cleaning', 'Kitchen', 'Minibar', 'Stationery', 'Maintenance', 'General'];
export const INVENTORY_UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'pack', 'bottle', 'set', 'roll', 'dozen'];

export function optionLabel(options: Option[], value?: string | null): string {
  if (value === 'split') return 'Split payment';
  if (!value) return '—';
  return options.find((o) => o.value === value)?.label ?? value;
}

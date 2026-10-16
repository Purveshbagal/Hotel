export const DEFAULT_SETTINGS = {
  hotel_name: 'My Hotel',
  hotel_tagline: '',
  hotel_address: '',
  hotel_city: '',
  hotel_state: '',
  hotel_pincode: '',
  hotel_phone: '',
  hotel_email: '',
  hotel_website: '',
  hotel_gstin: '',
  currency_symbol: '₹',
  check_in_time: '12:00',
  check_out_time: '11:00',
  require_id_at_checkin: '1',
  tax_enabled: '1',
  tax_label: 'GST',
  split_tax: '1',
  room_tax_threshold: '7500',
  room_tax_rate_low: '5',
  room_tax_rate_high: '18',
  service_tax_rate: '18',
  food_tax_rate: '5',
  booking_prefix: 'BK',
  invoice_prefix: 'INV',
  receipt_prefix: 'RCP',
  order_prefix: 'ORD',
  invoice_terms:
    'Check-out time is 11:00 AM. Late check-out is subject to availability and may be chargeable.\nAll disputes are subject to local jurisdiction.',
  invoice_footer: 'Thank you for staying with us. We look forward to welcoming you again!',
};

export type Settings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof Settings;

import type { BookingStatus, HousekeepingStatus, RoomStatus } from './constants';
import type { Role } from './permissions';

export interface User {
  id: number;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: Role;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
}

export interface RoomType {
  id: number;
  name: string;
  description: string | null;
  base_rate: number;
  extra_bed_rate: number;
  max_adults: number;
  max_children: number;
  amenities: string | null;
  is_active: number;
  created_at: string;
}

export interface Room {
  id: number;
  room_number: string;
  room_type_id: number;
  floor: string | null;
  status: RoomStatus;
  housekeeping_status: HousekeepingStatus;
  notes: string | null;
  is_active: number;
  created_at: string;
}

export interface RoomWithType extends Room {
  type_name: string;
  base_rate: number;
  extra_bed_rate: number;
  max_adults: number;
  max_children: number;
}

export interface Guest {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  id_type: string | null;
  id_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  company_name: string | null;
  company_gstin: string | null;
  notes: string | null;
  is_vip: number;
  is_blacklisted: number;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: number;
  booking_no: string;
  guest_id: number;
  room_id: number;
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
  rate_per_night: number;
  extra_beds: number;
  extra_bed_rate: number;
  room_tax_rate: number;
  discount_amount: number;
  source: string;
  status: BookingStatus;
  special_requests: string | null;
  notes: string | null;
  actual_check_in: string | null;
  actual_check_out: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface BookingDetail extends Booking {
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  guest_address: string | null;
  guest_city: string | null;
  guest_state: string | null;
  guest_country: string | null;
  guest_id_type: string | null;
  guest_id_number: string | null;
  guest_company: string | null;
  guest_gstin: string | null;
  guest_is_vip: number;
  guest_is_blacklisted: number;
  room_number: string;
  room_status: RoomStatus;
  room_type_id: number;
  room_type_name: string;
  created_by_name: string | null;
}

export interface FolioCharge {
  id: number;
  booking_id: number;
  charge_date: string;
  category: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  source: string;
  source_id: number | null;
  is_void: number;
  void_reason: string | null;
  created_by: number | null;
  created_at: string;
}

export interface Payment {
  id: number;
  receipt_no: string;
  booking_id: number | null;
  amount: number;
  type: 'payment' | 'refund';
  method: string;
  reference: string | null;
  notes: string | null;
  payment_date: string;
  received_by: number | null;
  created_at: string;
}

export interface Invoice {
  id: number;
  invoice_no: string;
  booking_id: number;
  invoice_date: string;
  room_amount: number;
  other_amount: number;
  discount: number;
  taxable_amount: number;
  tax_amount: number;
  total: number;
  paid: number;
  balance: number;
  created_at: string;
}

export interface MenuItem {
  id: number;
  name: string;
  category: string;
  description: string | null;
  price: number;
  tax_rate: number;
  is_veg: number;
  is_available: number;
}

export interface RestaurantOrder {
  discount_percent: number;
  discount_reason: string | null;
  id: number;
  order_no: string;
  order_type: 'room_service' | 'dine_in' | 'takeaway';
  booking_id: number | null;
  table_no: string | null;
  customer_name: string | null;
  status: 'pending' | 'preparing' | 'served' | 'completed' | 'cancelled';
  subtotal: number;
  tax_amount: number;
  total: number;
  settlement: 'room' | 'paid' | null;
  payment_method: string | null;
  notes: string | null;
  created_by: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface OrderItem {
  kot_batch: number;
  kitchen_status: string;
  id: number;
  order_id: number;
  menu_item_id: number | null;
  name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  amount: number;
  tax_amount: number;
  notes: string | null;
}

export interface InventoryItem {
  id: number;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  min_quantity: number;
  unit_cost: number;
  notes: string | null;
}

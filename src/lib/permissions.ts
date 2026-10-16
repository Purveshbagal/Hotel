export const ROLES = ['admin', 'manager', 'receptionist', 'housekeeping', 'accountant', 'restaurant'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  receptionist: 'Receptionist',
  housekeeping: 'Housekeeping',
  accountant: 'Accountant',
  restaurant: 'Restaurant Staff',
};

const PERMISSIONS = {
  dashboard: ['admin', 'manager', 'receptionist', 'accountant'],
  frontdesk: ['admin', 'manager', 'receptionist'],
  bookings: ['admin', 'manager', 'receptionist', 'accountant'],
  guests: ['admin', 'manager', 'receptionist'],
  rooms_view: ['admin', 'manager', 'receptionist', 'housekeeping'],
  rooms_manage: ['admin', 'manager'],
  billing: ['admin', 'manager', 'receptionist', 'accountant'],
  billing_admin: ['admin', 'manager', 'accountant'],
  housekeeping: ['admin', 'manager', 'receptionist', 'housekeeping'],
  maintenance: ['admin', 'manager', 'receptionist', 'housekeeping'],
  restaurant: ['admin', 'manager', 'receptionist', 'restaurant'],
  menu: ['admin', 'manager', 'restaurant'],
  inventory: ['admin', 'manager', 'housekeeping', 'restaurant'],
  expenses: ['admin', 'manager', 'accountant'],
  reports: ['admin', 'manager', 'accountant'],
  activity: ['admin', 'manager'],
  users: ['admin'],
  settings: ['admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function homeFor(role: Role): string {
  if (can(role, 'dashboard')) return '/dashboard';
  if (role === 'housekeeping') return '/housekeeping';
  if (role === 'restaurant') return '/restaurant';
  return '/profile';
}

export type IconName =
  | 'dashboard' | 'frontdesk' | 'calendar' | 'bookings' | 'guests' | 'rooms' | 'housekeeping' | 'maintenance'
  | 'restaurant' | 'menu' | 'inventory' | 'billing' | 'expenses' | 'reports' | 'users' | 'settings' | 'activity';

export type NavItem = { href: string; label: string; icon: IconName; section: string };

const NAV: (NavItem & { permission: Permission })[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', section: 'Overview', permission: 'dashboard' },
  { href: '/front-desk', label: 'Front Desk', icon: 'frontdesk', section: 'Front Office', permission: 'frontdesk' },
  { href: '/calendar', label: 'Room Calendar', icon: 'calendar', section: 'Front Office', permission: 'frontdesk' },
  { href: '/bookings', label: 'Bookings', icon: 'bookings', section: 'Front Office', permission: 'bookings' },
  { href: '/guests', label: 'Guests', icon: 'guests', section: 'Front Office', permission: 'guests' },
  { href: '/rooms', label: 'Rooms', icon: 'rooms', section: 'Operations', permission: 'rooms_view' },
  { href: '/housekeeping', label: 'Housekeeping', icon: 'housekeeping', section: 'Operations', permission: 'housekeeping' },
  { href: '/maintenance', label: 'Maintenance', icon: 'maintenance', section: 'Operations', permission: 'maintenance' },
  { href: '/restaurant', label: 'Orders / POS', icon: 'restaurant', section: 'Restaurant', permission: 'restaurant' },
  { href: '/restaurant/tables', label: 'Dining Floor', icon: 'rooms', section: 'Restaurant', permission: 'restaurant' },
  { href: '/restaurant/kitchen', label: 'Kitchen Board', icon: 'restaurant', section: 'Restaurant', permission: 'restaurant' },
  { href: '/restaurant/menu', label: 'Menu', icon: 'menu', section: 'Restaurant', permission: 'menu' },
  { href: '/inventory', label: 'Inventory', icon: 'inventory', section: 'Operations', permission: 'inventory' },
  { href: '/billing', label: 'Billing & Payments', icon: 'billing', section: 'Finance', permission: 'billing' },
  { href: '/expenses', label: 'Expenses', icon: 'expenses', section: 'Finance', permission: 'expenses' },
  { href: '/reports', label: 'Reports', icon: 'reports', section: 'Finance', permission: 'reports' },
  { href: '/users', label: 'Staff & Users', icon: 'users', section: 'Administration', permission: 'users' },
  { href: '/activity', label: 'Activity Log', icon: 'activity', section: 'Administration', permission: 'activity' },
  { href: '/settings', label: 'Settings', icon: 'settings', section: 'Administration', permission: 'settings' },
];

export function navFor(role: Role): NavItem[] {
  return NAV.filter((n) => can(role, n.permission)).map(({ permission: _p, ...item }) => item);
}

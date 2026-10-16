/**
 * Database migrations. Each entry runs once, in order, and bumps PRAGMA user_version.
 * Never edit a migration that has shipped — append a new one instead.
 */
export const MIGRATIONS: string[] = [
  /* 1 — initial schema */ `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email         TEXT,
    phone         TEXT,
    role          TEXT NOT NULL CHECK (role IN ('admin','manager','receptionist','housekeeping','accountant','restaurant')),
    password_hash TEXT NOT NULL,
    is_active     INTEGER NOT NULL DEFAULT 1,
    last_login_at TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE sessions (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    ip         TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE counters (
    name  TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE room_types (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL UNIQUE COLLATE NOCASE,
    description    TEXT,
    base_rate      REAL NOT NULL DEFAULT 0 CHECK (base_rate >= 0),
    extra_bed_rate REAL NOT NULL DEFAULT 0 CHECK (extra_bed_rate >= 0),
    max_adults     INTEGER NOT NULL DEFAULT 2,
    max_children   INTEGER NOT NULL DEFAULT 1,
    amenities      TEXT,
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE rooms (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    room_number         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    room_type_id        INTEGER NOT NULL REFERENCES room_types(id),
    floor               TEXT,
    status              TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','occupied','maintenance','out_of_order')),
    housekeeping_status TEXT NOT NULL DEFAULT 'clean' CHECK (housekeeping_status IN ('clean','dirty','in_progress','inspected')),
    notes               TEXT,
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_rooms_type ON rooms(room_type_id);

  CREATE TABLE guests (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    phone          TEXT,
    email          TEXT,
    gender         TEXT,
    date_of_birth  TEXT,
    nationality    TEXT,
    id_type        TEXT,
    id_number      TEXT,
    address        TEXT,
    city           TEXT,
    state          TEXT,
    country        TEXT,
    pincode        TEXT,
    company_name   TEXT,
    company_gstin  TEXT,
    notes          TEXT,
    is_vip         INTEGER NOT NULL DEFAULT 0,
    is_blacklisted INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_guests_name ON guests(name);
  CREATE INDEX idx_guests_phone ON guests(phone);

  CREATE TABLE bookings (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_no       TEXT NOT NULL UNIQUE,
    guest_id         INTEGER NOT NULL REFERENCES guests(id),
    room_id          INTEGER NOT NULL REFERENCES rooms(id),
    check_in_date    TEXT NOT NULL,
    check_out_date   TEXT NOT NULL,
    adults           INTEGER NOT NULL DEFAULT 1,
    children         INTEGER NOT NULL DEFAULT 0,
    rate_per_night   REAL NOT NULL DEFAULT 0 CHECK (rate_per_night >= 0),
    extra_beds       INTEGER NOT NULL DEFAULT 0,
    extra_bed_rate   REAL NOT NULL DEFAULT 0,
    room_tax_rate    REAL NOT NULL DEFAULT 0,
    discount_amount  REAL NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    source           TEXT NOT NULL DEFAULT 'walk_in',
    status           TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','checked_in','checked_out','cancelled','no_show')),
    special_requests TEXT,
    notes            TEXT,
    actual_check_in  TEXT,
    actual_check_out TEXT,
    cancelled_at     TEXT,
    cancel_reason    TEXT,
    created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    CHECK (check_out_date > check_in_date)
  );
  CREATE INDEX idx_bookings_room_dates ON bookings(room_id, check_in_date, check_out_date);
  CREATE INDEX idx_bookings_status ON bookings(status);
  CREATE INDEX idx_bookings_guest ON bookings(guest_id);
  CREATE INDEX idx_bookings_dates ON bookings(check_in_date, check_out_date);

  CREATE TABLE folio_charges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id  INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    charge_date TEXT NOT NULL,
    category    TEXT NOT NULL,
    description TEXT NOT NULL,
    quantity    REAL NOT NULL DEFAULT 1,
    unit_price  REAL NOT NULL DEFAULT 0,
    amount      REAL NOT NULL DEFAULT 0,
    tax_rate    REAL NOT NULL DEFAULT 0,
    tax_amount  REAL NOT NULL DEFAULT 0,
    total       REAL NOT NULL DEFAULT 0,
    source      TEXT NOT NULL DEFAULT 'manual',
    source_id   INTEGER,
    is_void     INTEGER NOT NULL DEFAULT 0,
    void_reason TEXT,
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_charges_booking ON folio_charges(booking_id);

  CREATE TABLE payments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_no   TEXT NOT NULL UNIQUE,
    booking_id   INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
    amount       REAL NOT NULL CHECK (amount > 0),
    type         TEXT NOT NULL DEFAULT 'payment' CHECK (type IN ('payment','refund')),
    method       TEXT NOT NULL,
    reference    TEXT,
    notes        TEXT,
    payment_date TEXT NOT NULL,
    received_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_payments_booking ON payments(booking_id);
  CREATE INDEX idx_payments_date ON payments(payment_date);

  CREATE TABLE invoices (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no     TEXT NOT NULL UNIQUE,
    booking_id     INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    invoice_date   TEXT NOT NULL,
    room_amount    REAL NOT NULL DEFAULT 0,
    other_amount   REAL NOT NULL DEFAULT 0,
    discount       REAL NOT NULL DEFAULT 0,
    taxable_amount REAL NOT NULL DEFAULT 0,
    tax_amount     REAL NOT NULL DEFAULT 0,
    total          REAL NOT NULL DEFAULT 0,
    paid           REAL NOT NULL DEFAULT 0,
    balance        REAL NOT NULL DEFAULT 0,
    created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_invoices_date ON invoices(invoice_date);

  CREATE TABLE menu_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    category     TEXT NOT NULL DEFAULT 'General',
    description  TEXT,
    price        REAL NOT NULL CHECK (price >= 0),
    tax_rate     REAL NOT NULL DEFAULT 5,
    is_veg       INTEGER NOT NULL DEFAULT 1,
    is_available INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE restaurant_orders (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no       TEXT NOT NULL UNIQUE,
    order_type     TEXT NOT NULL CHECK (order_type IN ('room_service','dine_in','takeaway')),
    booking_id     INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
    table_no       TEXT,
    customer_name  TEXT,
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','preparing','served','completed','cancelled')),
    subtotal       REAL NOT NULL DEFAULT 0,
    tax_amount     REAL NOT NULL DEFAULT 0,
    total          REAL NOT NULL DEFAULT 0,
    settlement     TEXT CHECK (settlement IN ('room','paid')),
    payment_method TEXT,
    notes          TEXT,
    created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    completed_at   TEXT
  );
  CREATE INDEX idx_orders_status ON restaurant_orders(status);
  CREATE INDEX idx_orders_booking ON restaurant_orders(booking_id);

  CREATE TABLE restaurant_order_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id     INTEGER NOT NULL REFERENCES restaurant_orders(id) ON DELETE CASCADE,
    menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
    name         TEXT NOT NULL,
    quantity     INTEGER NOT NULL CHECK (quantity > 0),
    unit_price   REAL NOT NULL,
    tax_rate     REAL NOT NULL DEFAULT 0,
    amount       REAL NOT NULL,
    tax_amount   REAL NOT NULL DEFAULT 0,
    notes        TEXT
  );
  CREATE INDEX idx_order_items_order ON restaurant_order_items(order_id);

  CREATE TABLE housekeeping_tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id      INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    task_type    TEXT NOT NULL DEFAULT 'cleaning',
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
    priority     TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
    assigned_to  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes        TEXT,
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    started_at   TEXT,
    completed_at TEXT
  );
  CREATE INDEX idx_hk_status ON housekeeping_tasks(status);

  CREATE TABLE maintenance_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id     INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    title       TEXT NOT NULL,
    description TEXT,
    priority    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    cost        REAL NOT NULL DEFAULT 0,
    resolution  TEXT,
    reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    resolved_at TEXT
  );
  CREATE INDEX idx_maint_status ON maintenance_requests(status);

  CREATE TABLE expenses (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_date   TEXT NOT NULL,
    category       TEXT NOT NULL,
    description    TEXT NOT NULL,
    amount         REAL NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL DEFAULT 'cash',
    vendor         TEXT,
    reference      TEXT,
    created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_expenses_date ON expenses(expense_date);

  CREATE TABLE inventory_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    category     TEXT NOT NULL DEFAULT 'General',
    unit         TEXT NOT NULL DEFAULT 'pcs',
    quantity     REAL NOT NULL DEFAULT 0,
    min_quantity REAL NOT NULL DEFAULT 0,
    unit_cost    REAL NOT NULL DEFAULT 0,
    notes        TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE inventory_transactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id    INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    type       TEXT NOT NULL CHECK (type IN ('in','out','adjust')),
    quantity   REAL NOT NULL,
    balance    REAL NOT NULL,
    notes      TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_inv_tx_item ON inventory_transactions(item_id);

  CREATE TABLE activity_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   INTEGER,
    details     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_activity_created ON activity_logs(created_at);
  `,

  /* 2 — force a password change for default / reset passwords */ `
  ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
  `,
  /* 3 — restaurant floor management; existing orders remain intact */ `
  CREATE TABLE restaurant_tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_no TEXT NOT NULL UNIQUE COLLATE NOCASE,
    area TEXT NOT NULL DEFAULT 'Main dining',
    seats INTEGER NOT NULL DEFAULT 4 CHECK(seats BETWEEN 1 AND 30),
    status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','reserved','cleaning','inactive')),
    reservation_name TEXT,
    reservation_phone TEXT,
    reservation_at TEXT,
    notes TEXT
  );
  INSERT OR IGNORE INTO restaurant_tables(table_no)
    SELECT DISTINCT trim(table_no) FROM restaurant_orders WHERE table_no IS NOT NULL AND trim(table_no) <> '';
  CREATE INDEX idx_orders_table ON restaurant_orders(table_no, status);
  `,
  /* 4 — auditable restaurant tender breakdown */ `
  CREATE TABLE restaurant_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES restaurant_orders(id),
    method TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount >= 0),
    received_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_restaurant_payments_order ON restaurant_payments(order_id);
  INSERT INTO restaurant_payments(order_id, method, amount, received_by, created_at)
    SELECT id, COALESCE(payment_method, 'cash'), total, created_by, completed_at
    FROM restaurant_orders WHERE status = 'completed' AND settlement = 'paid';
  ALTER TABLE restaurant_orders ADD COLUMN cash_received REAL;
  `,
  /* 5 — additional kitchen rounds */ `
  ALTER TABLE restaurant_order_items ADD COLUMN kot_batch INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE restaurant_order_items ADD COLUMN kitchen_status TEXT NOT NULL DEFAULT 'pending';
  UPDATE restaurant_order_items SET kitchen_status = COALESCE((
    SELECT CASE WHEN status IN ('served','completed') THEN 'served' WHEN status = 'preparing' THEN 'preparing' ELSE 'pending' END
    FROM restaurant_orders WHERE id = restaurant_order_items.order_id
  ), 'pending');
  `,
  /* 6 — approved restaurant discounts */ `
  ALTER TABLE restaurant_orders ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0;
  ALTER TABLE restaurant_orders ADD COLUMN discount_reason TEXT;
  `,
];

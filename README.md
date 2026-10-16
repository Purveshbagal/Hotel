# Hotel Management System

A complete hotel management system built with **Next.js 16**, **React 19**, **Tailwind CSS 4** and **SQLite** (`better-sqlite3`). It runs on one computer at the front desk or on a small server, and other devices on the hotel network use it from a browser.

## Features

For dining-floor setup, kitchen rounds, split payments, discounts and 58/80 mm thermal printing, see [Restaurant guide](RESTAURANT-GUIDE.md).

| Area | What it does |
| --- | --- |
| **Dashboard** | Live occupancy, arrivals and departures, the day's and month's collections, charts and a room status board |
| **Front Desk** | Today's arrivals, departures and in-house guests; one-click check-in; walk-in bookings; night audit (marks no-shows) |
| **Room Calendar** | Tape chart of rooms × dates; click an empty cell to book |
| **Bookings** | Availability check (double bookings are blocked), rates, extra beds, discounts, advance payment, edit or extend a stay, change room, cancel, no-show, undo check-out |
| **Guests** | Guest profiles with ID proof, company and GSTIN, VIP and blacklist flags, stay history and total spend |
| **Billing / Folio** | Room charges, extra charges (laundry, minibar, transport…), void with reason, payments and refunds by method, GST tax invoice with CGST/SGST and SAC codes, payment receipts, outstanding balances |
| **Rooms** | Room types and rates, rooms (bulk add), maintenance / out-of-order status |
| **Housekeeping** | Room board (dirty / cleaning / clean / inspected); task assignment. A cleaning task is created automatically at check-out |
| **Maintenance** | Issue tracking; a room can be blocked while it is repaired and released afterwards |
| **Restaurant / POS** | Menu, POS order screen, room service, dine-in, takeaway, KOT and bill printing; an order can be posted to the room folio or paid directly |
| **Inventory** | Stock items, stock in / out / adjust, low-stock alerts, movement history |
| **Expenses** | Expense records by category with charts |
| **Reports** | Collections by method, GST summary, occupancy, ADR, RevPAR, booking sources, F&B sales, top items; CSV/Excel exports (GST register, guest register for the police record, and more) |
| **Staff & security** | 6 roles (Admin, Manager, Receptionist, Housekeeping, Accountant, Restaurant), audit log, login throttling, session management |
| **Settings & backup** | Hotel profile, GSTIN, tax slabs, number prefixes, invoice terms; one-click database backup |

## Requirements

- **Node.js 22 or newer** (https://nodejs.org)
- Windows, Linux or macOS. No separate database server is needed, because SQLite is a single file.

## Installation

```bash
npm install
npm run build
npm start
```

Open **http://localhost:3000**. Other computers and phones on the same Wi-Fi or LAN can use `http://<this-computer's-IP>:3000`.

On Windows you can also double-click **`start-hotel.bat`**. It builds the app on the first run and then starts it.

### First login

| Username | Password |
| --- | --- |
| `admin` | `123456` (or the value of `ADMIN_PASSWORD` in `.env`) |

You can change the password at any time from **Profile → Change password**. After signing in:

1. **Settings**: enter the hotel name, address, GSTIN and tax rates.
2. **Rooms → Room types & rates**: add the room types (Standard, Deluxe…).
3. **Rooms → Bulk add**: create the rooms (for example 101–110).
4. **Restaurant → Menu**: add the menu, if the hotel has a restaurant.
5. **Staff & Users**: create a login for each staff member and choose the right role.

> To try the system first, open **Settings → Load demo data**. This option is available only while the system is empty. For real use, start again with a fresh database: stop the app and delete `data/hotel.db`.

## Configuration (`.env`)

Copy `.env.example` to `.env` and change what you need:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_PATH` | `./data/hotel.db` | Location of the SQLite database file |
| `ADMIN_PASSWORD` | `123456` | Password of the first admin account. Used only when the database is created |
| `COOKIE_SECURE` | `false` | Set to `true` only when the site is served over HTTPS |
| `SESSION_HOURS` | `24` | How long a login stays valid |

Use a different port with `npm start -- -p 8080`.

**Timezone:** dates such as "today", check-in and the night audit use the server computer's clock. Make sure the computer's timezone is set correctly (for example IST, UTC+05:30).

## Running in production

### Windows (recommended for a single hotel)

1. Install Node.js 22+ and copy this folder to, for example, `C:\HotelApp`.
2. Run `npm install` and `npm run build` once.
3. To start the app automatically when the PC starts, use one of these:
   - **PM2:** run `npm i -g pm2 pm2-windows-startup`, then `pm2 start npm --name hotel -- start`, `pm2 save` and `pm2-startup install`.
   - **Task Scheduler:** create a task that runs `start-hotel.bat` "At startup".
4. Allow port 3000 in Windows Firewall so other devices can connect.

### Linux server

```bash
npm ci && npm run build
pm2 start npm --name hotel -- start && pm2 save && pm2 startup
```

To serve the app over HTTPS, put Nginx or Caddy in front of it and set `COOKIE_SECURE=true`.

## Backups (important!)

All data is stored in a single file: `data/hotel.db`.

- **Settings → Download backup** creates a consistent copy while the app is running. Take a backup **every day** and keep copies outside the PC (Google Drive, a pen drive).
- **To restore:** stop the app, replace `data/hotel.db` with the backup file, delete any `hotel.db-wal` and `hotel.db-shm` files, then start the app again.

## Forgotten admin password

```bash
npm run reset-admin -- NewPassword123          # resets "admin"
npm run reset-admin -- NewPassword123 manager1 # resets another user
```

## Roles

| Role | Access |
| --- | --- |
| Admin | Everything, including users, settings and backups |
| Manager | Everything except user management and settings |
| Receptionist | Front desk, bookings, guests, billing, restaurant orders, housekeeping and maintenance |
| Housekeeping | Housekeeping board, tasks, maintenance, inventory |
| Accountant | Dashboard, bookings (view), billing, expenses, reports |
| Restaurant | Restaurant orders, menu, inventory |

## GST notes

- Room tax is chosen from the per-night tariff. By default it is 5% up to ₹7,500 and 18% above that; both values can be changed in Settings.
- Each extra charge and each menu item has its own tax rate.
- Invoices show CGST + SGST. To show a single tax line (for IGST), untick "Show as CGST + SGST".
- If the hotel is not GST-registered, untick "Charge tax".

## Project structure

```
src/
  app/(app)/        pages behind login (dashboard, bookings, rooms, …)
  app/print/        printable invoice, receipt, KOT/bill
  app/api/          CSV export, backup, guest search, room availability
  actions/          server actions (all writes; each checks permissions)
  lib/              database, migrations, auth, permissions, billing logic, reports
  components/       shared UI components
scripts/reset-admin.mjs
data/hotel.db       created on first start
```

Database migrations run automatically on startup (`src/lib/schema.ts`, tracked with `PRAGMA user_version`).

# Restaurant workspace and thermal printing

The existing hotel modules remain available. The shared interface now uses deep teal, warm neutral surfaces, restrained gold on the sign-in page, consistent cards and clearer navigation. Login supports password visibility; dialogs support keyboard focus containment and return focus when closed.

## Daily restaurant workflow

1. Add dishes under **Restaurant → Menu**, with prices, tax rates, vegetarian flags and availability.
2. Open **Dining Floor → Add table**. Enter each actual table number, dining area and seat count. Existing table numbers are imported from old orders during migration; fictional tables are not added.
3. Select **New order** on an available table. Dine-in orders require a configured, usable table. Add food, quantities and kitchen notes, then place the order. Use Takeaway or Room service for those order types.
4. Open **Kitchen Board**. Move tickets from New tickets to In preparation to Served. The board refreshes every 15 seconds while visible. Updates pause while a dialog or form input is in use.
5. Open an occupied table to add items, transfer its order to another free table, print a ticket, or settle the bill. A stale second browser cannot create another open order on the same table.
6. Each later item addition gets a new kitchen round. KOT printing defaults to the latest round; choose an earlier round or All rounds explicitly for a reprint. Previously served items retain their kitchen state. Adding food to a served order reopens it for the kitchen.
7. Admins and managers can apply a percentage discount with an audit reason. Item amounts and their taxes are recalculated before settlement. The discount also applies to subsequent additions to that order.
8. Receive payment using one method or split the total between two different methods. Optional cash tender shows change. Payments are recorded separately and collection reports allocate them to the actual methods. Alternatively, post the order to a checked-in room folio.
9. Settlement or cancellation releases the table. Use its Status dialog to mark it Cleaning, Available, Reserved or Inactive.

Reservations are manual table holds. The recorded name, phone and arrival time are a reference: holds do not expire automatically and there is no future time-slot booking engine. **Seat reservation** consumes the hold when its order is created.

## Thermal printer setup

- Install the printer's Windows driver and confirm it prints a Windows test page.
- Open an order and choose **Bill** or **KOT**.
- Choose **58 mm** or **80 mm** in the receipt preview. This choice is remembered on that browser/device.
- In the browser print dialog select the actual thermal printer and its matching roll-paper size. Set scale to **100%**, margins to **None**, and disable browser headers/footers.
- Configure cutting/feed behavior in the printer driver. This implementation uses browser/driver printing, not raw ESC/POS, and does not silently print, open a cash drawer, or confirm physical delivery.
- Customer bills show item quantity/rate, discounts, configured tax breakdown, total, payment breakdown and cash change. Unsettled bills are marked provisional and cancelled orders are labelled accordingly.
- Hotel tax invoices and hotel payment receipts retain their existing page formats; the new roll-width controls apply to restaurant bills and KOTs.

Generated test receipts are available at `artifacts/receipt-58mm.pdf` and `artifacts/receipt-80mm.pdf`. Actual printer output, character rendering and cutting still require a test on the installation's hardware.

## Implementation and verification

Migrations 3–6 add dining tables, tender records, kitchen rounds and discounts. They preserve historical orders and backfill existing paid orders into the tender ledger. A snapshot of the existing database was migrated and passed SQLite integrity and foreign-key checks. The live database was not used for test transactions.

Validated with a production build and Chromium against a separate temporary database:

- Login, table/menu creation, POS ordering, kitchen progression, table transfer, cancellation and settlement.
- Duplicate-table rejection from a stale browser and separation of new kitchen rounds from old served items.
- A 240.00 item with 10% discount: 216.00 taxable amount, 10.80 tax, 226.80 total; split into 126.80 cash and 100.00 UPI, with 73.20 change on 200.00 cash tender.
- 58/80 mm print layout, generated PDFs, mobile floor/POS layout and navigation, and successful rendering of 13 main routes without browser exceptions.

This is a local hotel and restaurant operations system. Advanced workflows not implemented here include restaurant refund/credit-note processing, per-item split/merged bills, ingredient-recipe stock deduction, purchase orders, delivery-platform integrations, multi-branch synchronisation, automatic printer routing and offline order queues. Inventory currently remains a manually managed stock ledger. These should not be represented as completed features.

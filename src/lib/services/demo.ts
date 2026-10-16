import { run, transaction } from '../db';
import { getSettings, roomTaxRate } from '../settings';
import { addDays, round2, todayStr } from '../utils';
import { getBookingDetail, getFolio } from './booking';
import { nextBookingNo, nextInvoiceNo, nextOrderNo, nextReceiptNo } from './numbering';

/** Fills an empty database with realistic sample data so the system can be explored. */
export function seedDemoData(userId: number) {
  const s = getSettings();
  const today = todayStr();

  transaction(() => {
    const types = [
      ['Standard', 'Comfortable room for couples and solo travellers.', 2000, 500, 2, 1, 'AC, LED TV, Wi-Fi, Attached bathroom, Hot water'],
      ['Deluxe', 'Spacious room with city view and work desk.', 3500, 700, 3, 2, 'AC, Smart TV, Wi-Fi, Mini fridge, Tea/coffee maker, Work desk'],
      ['Suite', 'Premium suite with separate living area.', 8500, 1200, 4, 2, 'Living room, Bathtub, Minibar, Smart TV, Wi-Fi, Bathrobes'],
    ] as const;
    const typeIds: number[] = [];
    for (const t of types) {
      typeIds.push(
        Number(
          run(
            `INSERT INTO room_types(name, description, base_rate, extra_bed_rate, max_adults, max_children, amenities)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ...t,
          ).lastInsertRowid,
        ),
      );
    }

    const roomIds: Record<string, number> = {};
    const addRoom = (no: string, typeIdx: number, floor: string) => {
      roomIds[no] = Number(run('INSERT INTO rooms(room_number, room_type_id, floor) VALUES (?, ?, ?)', no, typeIds[typeIdx], floor).lastInsertRowid);
    };
    for (let n = 101; n <= 106; n++) addRoom(String(n), 0, '1st Floor');
    for (let n = 201; n <= 206; n++) addRoom(String(n), 1, '2nd Floor');
    for (let n = 301; n <= 303; n++) addRoom(String(n), 2, '3rd Floor');

    const guests = [
      ['Rahul Sharma', '9876543210', 'rahul.sharma@example.com', 'male', 'Indian', 'aadhaar', 'XXXX-XXXX-4521', '12, MG Road', 'Pune', 'Maharashtra', 'India', 0],
      ['Priya Patil', '9823456781', 'priya.patil@example.com', 'female', 'Indian', 'driving_license', 'MH12-20190012345', '45, FC Road', 'Pune', 'Maharashtra', 'India', 1],
      ['Amit Deshmukh', '9922334455', 'amit.d@example.com', 'male', 'Indian', 'aadhaar', 'XXXX-XXXX-7788', 'Plot 7, Shivaji Nagar', 'Nagpur', 'Maharashtra', 'India', 0],
      ['Sneha Kulkarni', '9765432109', 'sneha.k@example.com', 'female', 'Indian', 'voter_id', 'ABC1234567', '3, Andheri West', 'Mumbai', 'Maharashtra', 'India', 0],
      ['John Miller', '+44 7700 900123', 'john.miller@example.com', 'male', 'British', 'passport', 'GB5521873', '10 Baker Street', 'London', '', 'United Kingdom', 1],
      ['Vikram Joshi', '9811122233', 'vikram.j@example.com', 'male', 'Indian', 'pan', 'ABCPJ1234K', '22, Sector 15', 'Navi Mumbai', 'Maharashtra', 'India', 0],
    ] as const;
    const guestIds = guests.map((g) =>
      Number(
        run(
          `INSERT INTO guests(name, phone, email, gender, nationality, id_type, id_number, address, city, state, country, is_vip)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ...g,
        ).lastInsertRowid,
      ),
    );

    const addBooking = (
      guestIdx: number, room: string, typeIdx: number, checkIn: string, checkOut: string,
      status: string, source: string, adults = 2, children = 0,
    ) => {
      const rate = types[typeIdx][2];
      const id = Number(
        run(
          `INSERT INTO bookings(booking_no, guest_id, room_id, check_in_date, check_out_date, adults, children,
                                rate_per_night, extra_bed_rate, room_tax_rate, source, status, actual_check_in, actual_check_out, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          nextBookingNo(), guestIds[guestIdx], roomIds[room], checkIn, checkOut, adults, children, rate, types[typeIdx][3],
          roomTaxRate(rate, s), source, status,
          status === 'checked_in' || status === 'checked_out' ? `${checkIn} 13:15:00` : null,
          status === 'checked_out' ? `${checkOut} 10:40:00` : null,
          userId,
        ).lastInsertRowid,
      );
      if (status === 'checked_in') run(`UPDATE rooms SET status = 'occupied' WHERE id = ?`, roomIds[room]);
      return id;
    };
    const pay = (bookingId: number, amount: number, method: string, date: string, notes: string | null = null) =>
      run(
        `INSERT INTO payments(receipt_no, booking_id, amount, type, method, payment_date, notes, received_by)
         VALUES (?, ?, ?, 'payment', ?, ?, ?, ?)`,
        nextReceiptNo(), bookingId, amount, method, date, notes, userId,
      );
    const charge = (bookingId: number, date: string, category: string, description: string, qty: number, price: number, taxRate: number) => {
      const amount = round2(qty * price);
      const tax = round2((amount * taxRate) / 100);
      run(
        `INSERT INTO folio_charges(booking_id, charge_date, category, description, quantity, unit_price, amount, tax_rate, tax_amount, total, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bookingId, date, category, description, qty, price, amount, taxRate, tax, round2(amount + tax), userId,
      );
    };
    const serviceTax = s.tax_enabled === '1' ? Number(s.service_tax_rate) : 0;

    // Past stay, fully paid and invoiced
    const past = addBooking(3, '202', 1, addDays(today, -6), addDays(today, -3), 'checked_out', 'ota');
    charge(past, addDays(today, -5), 'laundry', 'Laundry — 4 pieces', 4, 80, serviceTax);
    {
      const b = getBookingDetail(past)!;
      const f = getFolio(b);
      pay(past, f.total, 'upi', addDays(today, -3), 'Settled at check-out');
      run(
        `INSERT INTO invoices(invoice_no, booking_id, invoice_date, room_amount, other_amount, discount, taxable_amount,
                              tax_amount, total, paid, balance, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        nextInvoiceNo(), past, addDays(today, -3), f.roomAmount, f.otherAmount, f.discount, f.taxable, f.tax, f.total, f.total, userId,
      );
    }

    // In-house guests
    const inHouse1 = addBooking(0, '101', 0, addDays(today, -1), addDays(today, 2), 'checked_in', 'walk_in');
    pay(inHouse1, 2000, 'cash', addDays(today, -1), 'Advance payment');
    charge(inHouse1, addDays(today, -1), 'laundry', 'Laundry — shirts & trousers', 5, 60, serviceTax);
    const inHouse2 = addBooking(1, '201', 1, today, addDays(today, 1), 'checked_in', 'phone', 2, 1);
    pay(inHouse2, 3500, 'card', today, 'Advance payment');
    const departing = addBooking(4, '203', 1, addDays(today, -2), today, 'checked_in', 'website', 1);
    pay(departing, 4000, 'online', addDays(today, -2), 'Prepaid online');

    // Arrivals & future reservations
    addBooking(2, '102', 0, today, addDays(today, 2), 'confirmed', 'phone');
    const future = addBooking(5, '301', 2, addDays(today, 5), addDays(today, 8), 'confirmed', 'corporate', 3);
    pay(future, 10000, 'bank_transfer', today, 'Advance via NEFT');

    // Housekeeping & maintenance
    run(`UPDATE rooms SET housekeeping_status = 'dirty' WHERE id = ?`, roomIds['202']);
    run(
      `INSERT INTO housekeeping_tasks(room_id, task_type, priority, notes, created_by) VALUES (?, 'cleaning', 'high', 'Check-out cleaning', ?)`,
      roomIds['202'], userId,
    );
    run(`UPDATE rooms SET status = 'maintenance' WHERE id = ?`, roomIds['106']);
    run(
      `INSERT INTO maintenance_requests(room_id, title, description, priority, reported_by) VALUES (?, ?, ?, 'high', ?)`,
      roomIds['106'], 'AC not cooling', 'Guest reported the AC is not cooling properly. Technician visit required.', userId,
    );

    // Menu
    const menu = [
      ['Masala Tea', 'Beverages', 40, 1], ['Filter Coffee', 'Beverages', 60, 1], ['Fresh Lime Soda', 'Beverages', 80, 1],
      ['Poha', 'Breakfast', 90, 1], ['Misal Pav', 'Breakfast', 140, 1], ['Aloo Paratha with Curd', 'Breakfast', 150, 1],
      ['Veg Sandwich', 'Snacks', 120, 1], ['Paneer Tikka', 'Starters', 280, 1], ['Chicken Tikka', 'Starters', 340, 0],
      ['Paneer Butter Masala', 'Main Course', 320, 1], ['Dal Tadka', 'Main Course', 220, 1], ['Butter Chicken', 'Main Course', 380, 0],
      ['Veg Biryani', 'Rice', 260, 1], ['Chicken Biryani', 'Rice', 340, 0], ['Butter Naan', 'Breads', 50, 1], ['Gulab Jamun (2 pcs)', 'Desserts', 90, 1],
    ] as const;
    const menuIds = menu.map((m) =>
      Number(run('INSERT INTO menu_items(name, category, price, tax_rate, is_veg) VALUES (?, ?, ?, ?, ?)', m[0], m[1], m[2], Number(s.food_tax_rate) || 5, m[3]).lastInsertRowid),
    );

    // Restaurant orders: one completed walk-in sale, one open room-service order
    const foodTax = s.tax_enabled === '1' ? Number(s.food_tax_rate) || 0 : 0;
    const makeOrder = (type: string, bookingId: number | null, table: string | null, lines: [number, number][], status: string, settlement: string | null, method: string | null) => {
      const orderId = Number(
        run(
          `INSERT INTO restaurant_orders(order_no, order_type, booking_id, table_no, status, settlement, payment_method, created_by, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          nextOrderNo(), type, bookingId, table, status, settlement, method, userId, status === 'completed' ? `${today} 13:30:00` : null,
        ).lastInsertRowid,
      );
      let subtotal = 0;
      let tax = 0;
      for (const [idx, qty] of lines) {
        const amount = round2(menu[idx][2] * qty);
        const t = round2((amount * foodTax) / 100);
        subtotal += amount;
        tax += t;
        run(
          `INSERT INTO restaurant_order_items(order_id, menu_item_id, name, quantity, unit_price, tax_rate, amount, tax_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          orderId, menuIds[idx], menu[idx][0], qty, menu[idx][2], foodTax, amount, t,
        );
      }
      run('UPDATE restaurant_orders SET subtotal = ?, tax_amount = ?, total = ? WHERE id = ?', round2(subtotal), round2(tax), round2(subtotal + tax), orderId);
    };
    makeOrder('dine_in', null, 'T4', [[7, 1], [9, 2], [14, 4], [0, 2]], 'completed', 'paid', 'upi');
    makeOrder('room_service', inHouse1, null, [[4, 2], [1, 2]], 'preparing', null, null);

    // Inventory
    const inventory = [
      ['Bath Towels', 'Linen', 'pcs', 80, 30, 250], ['Bed Sheets (Double)', 'Linen', 'pcs', 60, 25, 450],
      ['Toilet Rolls', 'Toiletries', 'roll', 18, 40, 25], ['Shampoo Sachets', 'Toiletries', 'pcs', 300, 100, 3],
      ['Soap Bars', 'Toiletries', 'pcs', 150, 80, 12], ['Floor Cleaner', 'Cleaning', 'litre', 12, 5, 180],
      ['Mineral Water 1L', 'Minibar', 'bottle', 96, 48, 18], ['Tea Bags', 'Kitchen', 'box', 4, 6, 220],
    ] as const;
    for (const it of inventory) {
      const id = run(
        'INSERT INTO inventory_items(name, category, unit, quantity, min_quantity, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
        ...it,
      ).lastInsertRowid;
      run(
        `INSERT INTO inventory_transactions(item_id, type, quantity, balance, notes, created_by) VALUES (?, 'in', ?, ?, 'Opening stock', ?)`,
        id, it[3], it[3], userId,
      );
    }

    // Expenses
    const expenses = [
      [-9, 'electricity', 'Electricity bill — MSEDCL', 18450, 'bank_transfer', 'MSEDCL'],
      [-7, 'kitchen', 'Vegetables & groceries', 6200, 'cash', 'Local market'],
      [-5, 'supplies', 'Housekeeping supplies', 3400, 'upi', 'CleanPro Supplies'],
      [-3, 'maintenance', 'Plumbing repair — Room 204', 1200, 'cash', 'Ganesh Plumbing'],
      [-1, 'kitchen', 'Dairy & bakery', 2150, 'upi', 'Sai Dairy'],
    ] as const;
    for (const e of expenses)
      run(
        `INSERT INTO expenses(expense_date, category, description, amount, payment_method, vendor, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        addDays(today, e[0]), e[1], e[2], e[3], e[4], e[5], userId,
      );
  });
}

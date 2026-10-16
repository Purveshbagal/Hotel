import { all } from './db';

export type DiningTable = {
  id: number; table_no: string; area: string; seats: number; status: string;
  reservation_name: string | null; reservation_phone: string | null; reservation_at: string | null;
  order_id: number | null; order_no: string | null; total: number | null; order_status: string | null;
};

export function diningTables() {
  return all<DiningTable>(`SELECT t.*, o.id AS order_id, o.order_no, o.total, o.status AS order_status
    FROM restaurant_tables t LEFT JOIN restaurant_orders o ON o.id = (
      SELECT id FROM restaurant_orders WHERE table_no = t.table_no COLLATE NOCASE
      AND order_type = 'dine_in' AND status IN ('pending','preparing','served') ORDER BY id LIMIT 1
    ) ORDER BY t.area, length(t.table_no), t.table_no COLLATE NOCASE`);
}

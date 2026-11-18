# Delta Pumps & Valves Co. - Inventory & Procurement Procedure (OPS-PRC-002)

FICTIONAL DEMO DOCUMENT.

1. Stock is held in two warehouses: **CAI** (Cairo, 10th of Ramadan) and **ALX** (Alexandria, Borg El Arab).
2. **Available stock = on hand - reserved.** Reserved stock belongs to confirmed customer orders.
3. A SKU must be reordered **in a warehouse** when its available stock is **below** that warehouse's reorder level.
   Each warehouse reorders separately; stock is not transferred between warehouses to avoid a reorder.
4. The reorder quantity is the `reorder_qty` for that warehouse line.
5. Purchase cost is `unit_cost_egp` from the price list. Purchase orders are grouped **per supplier**.
6. If a supplier's grouped order value is below its `min_order_egp`, the order is **not placed**; it is flagged
   to the Planner for consolidation with next month's order.
7. Expected arrival = order date + supplier lead time (calendar days).
8. Purchase orders above 250,000 EGP require Finance Manager approval.

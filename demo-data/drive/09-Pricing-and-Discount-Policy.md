# Delta Pumps & Valves Co. - Pricing & Discount Policy (SAL-POL-002, rev. 2026)

FICTIONAL DEMO DOCUMENT.

1. List prices are in the 2026 price list, in EGP, excluding 14% VAT.
2. **Volume discount per order line:** quantity 20-49 -> 3%; 50-99 -> 5%; 100 or more -> 8%.
3. **Customer tier discount:** Gold 7%, Silver 4%, Bronze 0%.
4. Volume and tier discounts are **added**, capped at **12%** in total.
5. A line discount above the allowed amount requires written approval from the Sales Director
   (Hana Helmy, E1002), recorded in the order's `discount_approved_by` field.
6. Net line value = quantity x unit price x (1 - discount). Invoices add 14% VAT on the net value.
7. Quotations and orders above **50,000 EGP** net need a department approver; above **250,000 EGP**,
   Finance Manager approval as well.
8. **Credit control:** a customer's exposure = unpaid invoice balances (incl. VAT) + open orders not yet invoiced
   (statuses Submitted and Delivered, valued incl. VAT). New orders are blocked while exposure exceeds the credit limit.

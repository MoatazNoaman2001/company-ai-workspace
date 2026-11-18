"""
Generates a FICTIONAL company dataset ("Delta Pumps & Valves Co.") for testing the AI workspace,
plus an answer key computed from the same data.

The files cross-reference each other (employee ids, customer ids, SKUs, order ids), so useful questions
need several documents and real arithmetic: leave balances, policy breaches, credit exposure,
invoice aging, commissions, reorder plans.

    python demo-data/generate.py

Outputs:
    demo-data/drive/*.md, *.csv   -> upload to the Google Drive folder (text files the connector can read)
    docs/demo-answer-key.md       -> expected answers; never upload this to Drive

All names, numbers and companies are invented. Deterministic (fixed seed).
"""

from __future__ import annotations

import csv
import datetime as dt
import random
from collections import defaultdict
from pathlib import Path

random.seed(20261118)
ROOT = Path(__file__).resolve().parent
OUT = ROOT / "drive"
KEY = ROOT.parent / "docs" / "demo-answer-key.md"
OUT.mkdir(parents=True, exist_ok=True)

D = dt.date
AS_OF = D(2026, 10, 31)  # "today" for balances, aging and credit checks
VAT = 0.14

# ---------------------------------------------------------------- calendar
HOLIDAYS = {
    D(2026, 1, 7): "Coptic Christmas",
    D(2026, 1, 25): "Revolution Day",
    D(2026, 3, 19): "Eid al-Fitr (day 1)",
    D(2026, 3, 22): "Eid al-Fitr (day 3, observed)",
    D(2026, 4, 13): "Sham El-Nessim",
    D(2026, 4, 26): "Sinai Liberation Day (observed)",
    D(2026, 5, 26): "Arafat Day",
    D(2026, 5, 27): "Eid al-Adha (day 1)",
    D(2026, 5, 28): "Eid al-Adha (day 2)",
    D(2026, 6, 16): "Islamic New Year",
    D(2026, 6, 30): "June 30 Revolution",
    D(2026, 7, 23): "Revolution Day (July 23)",
    D(2026, 8, 25): "Prophet's Birthday",
    D(2026, 10, 6): "Armed Forces Day",
}


def is_working_day(d: dt.date) -> bool:
    return d.weekday() not in (4, 5) and d not in HOLIDAYS  # Fri=4, Sat=5 weekend


def working_days(a: dt.date, b: dt.date) -> int:
    return sum(1 for i in range((b - a).days + 1) if is_working_day(a + dt.timedelta(i)))


def calendar_days(a: dt.date, b: dt.date) -> int:
    return (b - a).days + 1


def write_csv(name: str, header: list[str], rows: list[list]) -> None:
    with open(OUT / name, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def write_md(name: str, text: str) -> None:
    (OUT / name).write_text(text.strip() + "\n", encoding="utf-8")


def egp(x: float) -> str:
    return f"{x:,.2f} EGP"


# ---------------------------------------------------------------- employees
FIRST = ["Ahmed", "Mona", "Omar", "Sara", "Youssef", "Nour", "Karim", "Hana", "Mostafa", "Laila", "Tarek", "Dina",
         "Hassan", "Rana", "Amr", "Salma", "Khaled", "Yasmin", "Sherif", "Mariam", "Walid", "Farida", "Ziad", "Habiba",
         "Adel", "Aya", "Islam", "Reem", "Bassem", "Nada"]
LAST = ["Hassan", "Fathy", "Saeed", "Mahmoud", "Ibrahim", "Kamal", "Nabil", "Farouk", "Salem", "Gamal", "Rashad",
        "Lotfy", "Sabry", "Mansour", "Zaki", "Shawky", "Helmy", "Attia", "Fouad", "Ezzat"]

DEPTS = {
    "Executive": [("General Manager", "G5")],
    "Sales": [("Sales Director", "G5"), ("Key Account Manager", "G4"), ("Key Account Manager", "G4"),
              ("Sales Representative", "G3"), ("Sales Representative", "G3"), ("Sales Representative", "G3"),
              ("Sales Representative", "G2"), ("Sales Coordinator", "G2")],
    "Finance": [("Finance Manager", "G5"), ("Senior Accountant", "G3"), ("Accountant", "G2"), ("AR Clerk", "G1")],
    "HR": [("HR Manager", "G4"), ("HR Specialist", "G2")],
    "Operations": [("Operations Manager", "G4"), ("Procurement Specialist", "G3"), ("Planner", "G2")],
    "Warehouse": [("Warehouse Supervisor", "G3"), ("Storekeeper", "G1"), ("Storekeeper", "G1"), ("Forklift Operator", "G1")],
    "IT": [("IT Manager", "G4"), ("Systems Administrator", "G3")],
}
SALARY = {"G1": (9000, 13000), "G2": (14000, 20000), "G3": (21000, 32000), "G4": (33000, 48000), "G5": (50000, 85000)}

names = random.sample([(f, l) for f in FIRST for l in LAST], 40)
employees = []  # dict rows
eid = 1001
gm_id = None
dept_heads = {}
for dept, roles in DEPTS.items():
    for i, (title, grade) in enumerate(roles):
        f, l = names.pop()
        years_ago = random.choice([1, 2, 3, 4, 4, 5, 6, 7, 9, 12]) if grade != "G1" else random.choice([0, 1, 2, 3, 6])
        hire = D(2026 - years_ago, random.randint(1, 12), random.randint(1, 28))
        if hire > D(2026, 3, 1):
            hire = D(2026, 2, random.randint(1, 20))
        e = {"emp_id": f"E{eid}", "name": f"{f} {l}", "department": dept, "title": title, "grade": grade,
             "hire_date": hire, "base_salary_egp": round(random.randint(*SALARY[grade]), -2),
             "email": f"{f.lower()}.{l.lower()}@deltapv.example"}
        if dept == "Executive":
            gm_id = e["emp_id"]
        if i == 0:
            dept_heads[dept] = e["emp_id"]
        employees.append(e)
        eid += 1
for e in employees:
    if e["emp_id"] == gm_id:
        e["manager_id"] = ""
    elif e["emp_id"] == dept_heads[e["department"]]:
        e["manager_id"] = gm_id
    else:
        e["manager_id"] = dept_heads[e["department"]]
# Make one hire date land exactly on the 5-year boundary edge cases.
employees[3]["hire_date"] = D(2021, 1, 1)    # exactly 5 years on 1 Jan 2026 -> 30 days
employees[4]["hire_date"] = D(2021, 1, 2)    # one day short -> 21 days
emp_by_id = {e["emp_id"]: e for e in employees}
reps = [e for e in employees if e["department"] == "Sales" and e["title"] in ("Key Account Manager", "Sales Representative")]

write_csv("03-Employees.csv",
          ["emp_id", "name", "department", "title", "grade", "manager_id", "hire_date", "base_salary_egp", "email"],
          [[e["emp_id"], e["name"], e["department"], e["title"], e["grade"], e["manager_id"], e["hire_date"],
            e["base_salary_egp"], e["email"]] for e in employees])

# ---------------------------------------------------------------- leave
def entitlement(e) -> int:
    ref = D(2026, 1, 1)
    years = ref.year - e["hire_date"].year - ((ref.month, ref.day) < (e["hire_date"].month, e["hire_date"].day))
    if e["hire_date"] > D(2025, 7, 1):
        return 0 if e["hire_date"] > D(2026, 1, 1) else 10  # first-year rule (see policy)
    return 30 if years >= 5 else 21


carry = {e["emp_id"]: random.choice([0, 0, 2, 3, 5, 7, 9]) for e in employees if e["hire_date"] < D(2025, 1, 1)}
write_csv("05-Leave-Carryover-2025.csv", ["emp_id", "days_carried_from_2025", "note"],
          [[k, v, "capped at 7 by policy" if v > 7 else ""] for k, v in carry.items()])

leave_rows = []
rid = 1
for e in random.sample(employees, 24):
    for _ in range(random.randint(1, 4)):
        start = D(2026, 1, 4) + dt.timedelta(days=random.randint(0, 290))
        while not is_working_day(start):
            start += dt.timedelta(days=1)
        end = start + dt.timedelta(days=random.choice([0, 1, 2, 3, 4, 6, 7, 9, 11, 13]))
        ltype = random.choices(["Annual", "Sick", "Unpaid"], [8, 2, 1])[0]
        wd = working_days(start, end)
        claimed = wd if random.random() > 0.22 else calendar_days(start, end)  # some employees count weekends
        status = random.choices(["Approved", "Pending", "Rejected"], [7, 2, 1])[0]
        leave_rows.append({"request_id": f"LR-{rid:04d}", "emp_id": e["emp_id"], "type": ltype, "start": start,
                           "end": end, "days_requested": claimed, "status": status, "_wd": wd})
        rid += 1
leave_rows.sort(key=lambda r: r["start"])
write_csv("04-Leave-Requests-2026.csv",
          ["request_id", "emp_id", "leave_type", "start_date", "end_date", "days_requested", "status"],
          [[r["request_id"], r["emp_id"], r["type"], r["start"], r["end"], r["days_requested"], r["status"]]
           for r in leave_rows])

write_md("02-HR-Leave-Policy.md", f"""
# Delta Pumps & Valves Co. - Annual Leave Policy (HR-POL-004, rev. 2026)

FICTIONAL DEMO DOCUMENT.

## 1. Working week and holidays
- The working week is **Sunday to Thursday**. Friday and Saturday are weekends.
- Leave is counted in **working days only**. Weekends and company holidays inside a leave period are not deducted.
- 2026 company holidays:
{chr(10).join(f'  - {d.isoformat()} ({d.strftime("%A")}): {n}' for d, n in sorted(HOLIDAYS.items()))}

## 2. Annual entitlement (calendar year 2026)
- **21 working days** for employees with less than 5 full years of service on **1 January 2026**.
- **30 working days** for employees with **5 or more full years** of service on 1 January 2026
  (an employee hired on 1 January 2021 has exactly 5 full years and qualifies).
- Employees hired between 2 July 2025 and 1 January 2026 receive **10 days** for 2026.
- Employees hired after 1 January 2026 receive no annual leave in 2026 (probation).

## 3. Carry-over from 2025
- At most **7 days** may be carried over from 2025. Any recorded amount above 7 is void.
- Carried-over days are used **first** and only for annual leave taken **on or before 31 March 2026**.
  Carried-over days not used by 31 March 2026 are forfeited.

## 4. Counting
- Only **Approved** requests reduce the balance. Pending and Rejected requests do not.
- Sick leave and unpaid leave do **not** reduce the annual balance.
- If an employee writes the wrong number of days on a request, HR deducts the **correct working-day count**.

## 5. Remaining balance
Remaining 2026 balance = 2026 entitlement - approved annual working days not covered by valid carry-over.
""")

# compute balances
leave_answers = []
miscounted = []
for e in employees:
    ent = entitlement(e)
    co = min(carry.get(e["emp_id"], 0), 7)
    co_left = co
    used_from_ent = 0
    for r in [r for r in leave_rows if r["emp_id"] == e["emp_id"]]:
        if r["days_requested"] != r["_wd"]:
            miscounted.append(r)
        if r["status"] != "Approved" or r["type"] != "Annual":
            continue
        days = r["_wd"]
        # carry-over only covers days on or before 31 March
        q1_days = working_days(r["start"], min(r["end"], D(2026, 3, 31))) if r["start"] <= D(2026, 3, 31) else 0
        from_co = min(co_left, q1_days)
        co_left -= from_co
        used_from_ent += days - from_co
    if any(r["emp_id"] == e["emp_id"] for r in leave_rows):
        leave_answers.append((e, ent, co, co - co_left, used_from_ent, ent - used_from_ent))

# ---------------------------------------------------------------- expenses
CITY = {  # per diem (meals) per day, international flag
    "Cairo": (600, False), "Alexandria": (550, False), "Aswan": (500, False), "Hurghada": (550, False),
    "Dubai": (1800, True), "Riyadh": (1700, True),
}
HOTEL_CAP = {"G1": 2000, "G2": 2000, "G3": 2800, "G4": 4000, "G5": 4000}
INTL_HOTEL_MULT = 2.2

write_md("06-Travel-and-Expense-Policy.md", f"""
# Delta Pumps & Valves Co. - Travel & Expense Policy (FIN-POL-011, rev. 2026)

FICTIONAL DEMO DOCUMENT. All amounts in EGP, VAT included.

## 1. Hotels (per night)
| Grade | Domestic cap | International cap |
|---|---|---|
| G1-G2 | 2,000 | 4,400 |
| G3 | 2,800 | 6,160 |
| G4-G5 | 4,000 | 8,800 |
International cap = domestic cap x {INTL_HOTEL_MULT}. A hotel claim is checked as amount / nights.

## 2. Meals (per diem)
Meals are reimbursed up to the city per diem multiplied by the number of trip days:
{chr(10).join(f'- {c}: {v[0]:,} per day' for c, v in CITY.items())}

## 3. Transport
Local transport (taxi, ride-hailing, fuel) above **500** per claim line requires a receipt.

## 4. Flights
Economy class only. Business class is allowed only for **G5** employees, or for flights longer than **4 hours**.

## 5. Client entertainment
Requires a pre-approval reference (PA-xxxx). Maximum **1,200 per attendee** (attendees include the employee).

## 6. Approvals
- Every claim line is approved by the employee's direct manager.
- A claim line above **10,000** additionally needs Finance Manager approval.
""")

claims = []
cid = 1
claim_violations = []
travellers = [e for e in employees if e["department"] in ("Sales", "Executive", "Operations", "Finance", "IT")]
for _ in range(46):
    e = random.choice(travellers)
    city = random.choice(list(CITY))
    per_diem, intl = CITY[city]
    date = D(2026, 7, 1) + dt.timedelta(days=random.randint(0, 91))
    cat = random.choices(["Hotel", "Meals", "Transport", "Flight", "Entertainment"], [4, 4, 3, 2, 2])[0]
    row = {"claim_id": f"EXP-{cid:04d}", "emp_id": e["emp_id"], "date": date, "city": city, "category": cat,
           "nights_or_days": "", "attendees": "", "flight_class": "", "flight_hours": "", "receipt": "Y",
           "pre_approval": "", "amount_egp": 0}
    cap = HOTEL_CAP[e["grade"]] * (INTL_HOTEL_MULT if intl else 1)
    if cat == "Hotel":
        n = random.randint(1, 4)
        row["nights_or_days"] = n
        row["amount_egp"] = round(n * cap * random.choice([0.7, 0.85, 0.95, 1.0, 1.12, 1.3]), -1)
        if row["amount_egp"] / n > cap + 1e-9:
            claim_violations.append((row, f"hotel {egp(row['amount_egp'] / n)}/night > cap {egp(cap)}"))
    elif cat == "Meals":
        n = random.randint(1, 5)
        row["nights_or_days"] = n
        row["amount_egp"] = round(n * per_diem * random.choice([0.6, 0.9, 1.0, 1.15, 1.4]), -1)
        if row["amount_egp"] > n * per_diem:
            claim_violations.append((row, f"meals {egp(row['amount_egp'])} > {n} day(s) x {per_diem}"))
    elif cat == "Transport":
        row["amount_egp"] = random.choice([180, 320, 450, 520, 640, 900, 1250])
        row["receipt"] = random.choice(["Y", "Y", "N"])
        if row["amount_egp"] > 500 and row["receipt"] == "N":
            claim_violations.append((row, "transport above 500 without receipt"))
    elif cat == "Flight":
        hours = random.choice([1.0, 1.2, 3.5, 4.5, 5.0]) if intl else random.choice([1.0, 1.2, 1.5])
        cls = random.choice(["Economy", "Economy", "Business"])
        row["flight_class"], row["flight_hours"] = cls, hours
        row["amount_egp"] = round((9000 if intl else 3200) * (2.8 if cls == "Business" else 1) * random.uniform(0.9, 1.1), -1)
        if cls == "Business" and e["grade"] != "G5" and hours <= 4:
            claim_violations.append((row, f"business class, grade {e['grade']}, flight {hours}h"))
    else:
        att = random.randint(2, 6)
        row["attendees"] = att
        row["pre_approval"] = random.choice([f"PA-{random.randint(100, 999)}", f"PA-{random.randint(100, 999)}", ""])
        row["amount_egp"] = round(att * 1200 * random.choice([0.7, 0.9, 1.0, 1.25]), -1)
        reasons = []
        if not row["pre_approval"]:
            reasons.append("no pre-approval")
        if row["amount_egp"] > att * 1200:
            reasons.append(f"{egp(row['amount_egp'] / att)} per attendee > 1,200")
        if reasons:
            claim_violations.append((row, "; ".join(reasons)))
    claims.append(row)
    cid += 1
claims.sort(key=lambda r: r["date"])
write_csv("07-Expense-Claims-Q3-2026.csv",
          ["claim_id", "emp_id", "date", "city", "category", "nights_or_days", "attendees", "flight_class",
           "flight_hours", "receipt", "pre_approval", "amount_egp"],
          [[r[k] for k in ["claim_id", "emp_id", "date", "city", "category", "nights_or_days", "attendees",
                           "flight_class", "flight_hours", "receipt", "pre_approval", "amount_egp"]] for r in claims])
finance_needed = [r for r in claims if r["amount_egp"] > 10000]

# ---------------------------------------------------------------- products, suppliers, inventory
SUPPLIERS = [
    ("SUP-01", "Grundtal Pumpen GmbH", "Germany", 45, "EUR", 150000),
    ("SUP-02", "Shanghai Flowtech Ltd", "China", 60, "USD", 80000),
    ("SUP-03", "Istanbul Valf Sanayi", "Turkey", 21, "USD", 40000),
    ("SUP-04", "Nile Seals & Gaskets", "Egypt", 7, "EGP", 10000),
    ("SUP-05", "Milano Motori SpA", "Italy", 35, "EUR", 120000),
    ("SUP-06", "Delta Local Fabrication", "Egypt", 10, "EGP", 0),
]
write_csv("14-Suppliers.csv", ["supplier_id", "name", "country", "lead_time_days", "currency", "min_order_egp"],
          [list(s) for s in SUPPLIERS])
sup_by_id = {s[0]: s for s in SUPPLIERS}

PRODUCTS = []
catalog = [
    ("Centrifugal Pump", "Pumps", ["CP-50", "CP-80", "CP-100", "CP-150"], (18000, 95000), "SUP-01"),
    ("Submersible Pump", "Pumps", ["SP-2", "SP-4", "SP-6"], (12000, 60000), "SUP-02"),
    ("Gate Valve", "Valves", ["GV-2in", "GV-4in", "GV-6in"], (1800, 9500), "SUP-03"),
    ("Ball Valve", "Valves", ["BV-1in", "BV-2in", "BV-3in"], (650, 3200), "SUP-03"),
    ("Check Valve", "Valves", ["CV-2in", "CV-4in"], (1500, 6000), "SUP-03"),
    ("Mechanical Seal Kit", "Spares", ["MS-A", "MS-B", "MS-C"], (900, 4200), "SUP-04"),
    ("Electric Motor", "Motors", ["EM-5.5kW", "EM-11kW", "EM-22kW"], (14000, 52000), "SUP-05"),
    ("Pump Base Frame", "Spares", ["BF-S", "BF-L"], (2500, 7800), "SUP-06"),
    ("Pressure Gauge", "Spares", ["PG-10bar", "PG-25bar"], (350, 900), "SUP-04"),
]
for name, cat, variants, (lo, hi), sup in catalog:
    for i, v in enumerate(variants):
        price = round(lo + (hi - lo) * i / max(len(variants) - 1, 1), -1)
        cost = round(price * random.uniform(0.58, 0.74), -1)
        PRODUCTS.append({"sku": v, "name": f"{name} {v}", "category": cat, "unit_price_egp": price,
                         "unit_cost_egp": cost, "supplier_id": sup})
prod_by_sku = {p["sku"]: p for p in PRODUCTS}
write_csv("08-Product-Price-List-2026.csv",
          ["sku", "name", "category", "unit_price_egp", "unit_cost_egp", "supplier_id"],
          [[p["sku"], p["name"], p["category"], p["unit_price_egp"], p["unit_cost_egp"], p["supplier_id"]] for p in PRODUCTS])

inv = []
for p in PRODUCTS:
    for wh in ("CAI", "ALX"):
        reorder = random.choice([5, 10, 20, 40]) if p["category"] in ("Pumps", "Motors") else random.choice([30, 60, 100])
        on_hand = max(0, int(reorder * random.choice([0.2, 0.6, 0.9, 1.2, 1.8, 2.5, 3])))
        reserved = min(on_hand, int(on_hand * random.choice([0, 0.1, 0.3, 0.5])))
        inv.append({"sku": p["sku"], "warehouse": wh, "on_hand": on_hand, "reserved": reserved,
                    "reorder_level": reorder, "reorder_qty": reorder * 2})
write_csv("13-Inventory-Stock-2026-10-31.csv",
          ["sku", "warehouse", "on_hand", "reserved", "reorder_level", "reorder_qty"],
          [[r["sku"], r["warehouse"], r["on_hand"], r["reserved"], r["reorder_level"], r["reorder_qty"]] for r in inv])

write_md("18-Inventory-and-Procurement-Procedure.md", """
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
""")

reorder_lines = []
for r in inv:
    avail = r["on_hand"] - r["reserved"]
    if avail < r["reorder_level"]:
        p = prod_by_sku[r["sku"]]
        reorder_lines.append((r, avail, p, r["reorder_qty"] * p["unit_cost_egp"]))
po_by_sup = defaultdict(list)
for line in reorder_lines:
    po_by_sup[line[2]["supplier_id"]].append(line)

# ---------------------------------------------------------------- customers, orders, invoices
TIERS = {"Gold": 7, "Silver": 4, "Bronze": 0}
cust_names = ["Cairo Water Utilities", "Red Sea Resorts Group", "Alex Petrochem", "Upper Egypt Agri Co",
              "Sinai Mining Works", "Giza Towers Developments", "Port Said Logistics", "Mansoura Food Industries",
              "Suez Cement Partners", "Fayoum Irrigation Board", "Hurghada Marina Services", "Tanta Textiles",
              "Ismailia Desal Plant", "New Capital Facilities Mgmt", "Assiut Sugar Refinery", "Damietta Furniture Hub"]
customers = []
for i, n in enumerate(cust_names):
    tier = random.choices(list(TIERS), [3, 4, 4])[0]
    customers.append({"cust_id": f"C{i + 101}", "name": n + " (fictional)", "tier": tier,
                      "credit_limit_egp": random.choice([250000, 400000, 600000, 900000, 1500000]),
                      "payment_terms_days": random.choice([30, 30, 45, 60]),
                      "account_manager": random.choice(reps)["emp_id"]})
cust_by_id = {c["cust_id"]: c for c in customers}
write_csv("10-Customers.csv",
          ["cust_id", "name", "tier", "credit_limit_egp", "payment_terms_days", "account_manager_emp_id"],
          [[c["cust_id"], c["name"], c["tier"], c["credit_limit_egp"], c["payment_terms_days"], c["account_manager"]]
           for c in customers])

director = next(e for e in employees if e["title"] == "Sales Director")
write_md("09-Pricing-and-Discount-Policy.md", f"""
# Delta Pumps & Valves Co. - Pricing & Discount Policy (SAL-POL-002, rev. 2026)

FICTIONAL DEMO DOCUMENT.

1. List prices are in the 2026 price list, in EGP, excluding 14% VAT.
2. **Volume discount per order line:** quantity 20-49 -> 3%; 50-99 -> 5%; 100 or more -> 8%.
3. **Customer tier discount:** Gold 7%, Silver 4%, Bronze 0%.
4. Volume and tier discounts are **added**, capped at **12%** in total.
5. A line discount above the allowed amount requires written approval from the Sales Director
   ({director['name']}, {director['emp_id']}), recorded in the order's `discount_approved_by` field.
6. Net line value = quantity x unit price x (1 - discount). Invoices add 14% VAT on the net value.
7. Quotations and orders above **50,000 EGP** net need a department approver; above **250,000 EGP**,
   Finance Manager approval as well.
8. **Credit control:** a customer's exposure = unpaid invoice balances (incl. VAT) + open orders not yet invoiced
   (statuses Submitted and Delivered, valued incl. VAT). New orders are blocked while exposure exceeds the credit limit.
""")


def allowed_discount(qty: int, tier: str) -> int:
    vol = 8 if qty >= 100 else 5 if qty >= 50 else 3 if qty >= 20 else 0
    return min(vol + TIERS[tier], 12)


orders = []
oid = 5001
for _ in range(34):
    c = random.choice(customers)
    date = D(2026, 7, 1) + dt.timedelta(days=random.randint(0, 91))
    status = random.choices(["Draft", "Submitted", "Delivered", "Invoiced", "Paid"], [1, 2, 2, 4, 4])[0]
    for ln, p in enumerate(random.sample(PRODUCTS, random.randint(1, 4)), 1):
        qty = random.choice([2, 5, 8, 12, 20, 25, 40, 60, 80, 120]) if p["category"] in ("Valves", "Spares") \
            else random.choice([1, 1, 2, 2, 3, 4, 6])
        allowed = allowed_discount(qty, c["tier"])
        disc = allowed if random.random() > 0.2 else allowed + random.choice([2, 3, 5])
        approved = director["emp_id"] if disc > allowed and random.random() > 0.5 else ""
        orders.append({"so_id": f"SO-{oid}", "line": ln, "cust_id": c["cust_id"], "order_date": date, "sku": p["sku"],
                       "qty": qty, "unit_price_egp": p["unit_price_egp"], "discount_pct": disc,
                       "discount_approved_by": approved, "status": status, "_allowed": allowed})
    oid += 1
write_csv("11-Sales-Orders-Q3-2026.csv",
          ["so_id", "line", "cust_id", "order_date", "sku", "qty", "unit_price_egp", "discount_pct",
           "discount_approved_by", "status"],
          [[o[k] for k in ["so_id", "line", "cust_id", "order_date", "sku", "qty", "unit_price_egp", "discount_pct",
                           "discount_approved_by", "status"]] for o in orders])


def net(o) -> float:
    return o["qty"] * o["unit_price_egp"] * (1 - o["discount_pct"] / 100)


so_net = defaultdict(float)
so_meta = {}
for o in orders:
    so_net[o["so_id"]] += net(o)
    so_meta[o["so_id"]] = o
discount_breaches = [o for o in orders if o["discount_pct"] > o["_allowed"] and not o["discount_approved_by"]]

invoices = []
iid = 9001
for so, meta in so_meta.items():
    if meta["status"] not in ("Invoiced", "Paid"):
        continue
    c = cust_by_id[meta["cust_id"]]
    inv_date = meta["order_date"] + dt.timedelta(days=random.randint(3, 15))
    gross = round(so_net[so] * (1 + VAT), 2)
    due = inv_date + dt.timedelta(days=c["payment_terms_days"])
    if meta["status"] == "Paid":
        paid, paid_date = gross, min(due + dt.timedelta(days=random.randint(-20, 25)), AS_OF)
    else:
        paid = random.choice([0, 0, round(gross * 0.5, 2)])
        paid_date = inv_date + dt.timedelta(days=random.randint(10, 40)) if paid else ""
        if paid_date and paid_date > AS_OF:
            paid_date = AS_OF
    invoices.append({"invoice_id": f"INV-{iid}", "so_id": so, "cust_id": meta["cust_id"], "invoice_date": inv_date,
                     "net_egp": round(so_net[so], 2), "vat_egp": round(gross - round(so_net[so], 2), 2),
                     "total_egp": gross, "due_date": due, "paid_egp": paid, "last_payment_date": paid_date})
    iid += 1
write_csv("12-Invoices-and-Payments.csv",
          ["invoice_id", "so_id", "cust_id", "invoice_date", "net_egp", "vat_egp", "total_egp", "due_date", "paid_egp",
           "last_payment_date"],
          [[i[k] for k in ["invoice_id", "so_id", "cust_id", "invoice_date", "net_egp", "vat_egp", "total_egp",
                           "due_date", "paid_egp", "last_payment_date"]] for i in invoices])

# exposure & aging
exposure = defaultdict(float)
aging = defaultdict(lambda: defaultdict(float))
for i in invoices:
    bal = round(i["total_egp"] - i["paid_egp"], 2)
    if bal > 0.005:
        exposure[i["cust_id"]] += bal
        late = (AS_OF - i["due_date"]).days
        bucket = "not due" if late <= 0 else "1-30" if late <= 30 else "31-60" if late <= 60 else "61-90" if late <= 90 else "90+"
        aging[i["cust_id"]][bucket] += bal
for so, meta in so_meta.items():
    if meta["status"] in ("Submitted", "Delivered"):
        exposure[meta["cust_id"]] += so_net[so] * (1 + VAT)
over_limit = [(c, exposure[c["cust_id"]]) for c in customers if exposure[c["cust_id"]] > c["credit_limit_egp"]]

# ---------------------------------------------------------------- commission
targets = {r["emp_id"]: random.choice([600000, 800000, 1000000, 1200000]) for r in reps}
write_csv("16-Sales-Targets-Q3-2026.csv", ["emp_id", "q3_target_net_egp"], [[k, v] for k, v in targets.items()])
write_md("15-Sales-Commission-Plan-2026.md", """
# Delta Pumps & Valves Co. - Sales Commission Plan 2026 (SAL-COM-2026)

FICTIONAL DEMO DOCUMENT.

1. **Commissionable revenue** for a quarter = the net value (excluding VAT) of invoices dated in that quarter for
   customers whose `account_manager_emp_id` is the sales person.
2. **Attainment** = commissionable revenue / quarterly target (`16-Sales-Targets-Q3-2026.csv`).
3. Rates:
   - attainment below 80%: **2%** of commissionable revenue;
   - 80% up to and including 100%: **3.5%** of commissionable revenue;
   - above 100%: **3.5%** on revenue up to the target, plus **6%** on revenue above the target.
4. **Clawback:** for any invoice in the quarter that still has an unpaid balance more than **60 days past its due
   date** on the calculation date, its net value is removed from commissionable revenue **after** the rate has been
   determined (the attainment tier is not recalculated). Below target the removed revenue loses its tier rate;
   for sales people above 100% attainment, each clawed-back pound reduces commission at **3.5%**.
5. Calculation date for Q3 2026: **31 October 2026**.
""")

commission = []
for r in reps:
    my_inv = [i for i in invoices if cust_by_id[i["cust_id"]]["account_manager"] == r["emp_id"]
              and D(2026, 7, 1) <= i["invoice_date"] <= D(2026, 9, 30)]
    rev = sum(i["net_egp"] for i in my_inv)
    t = targets[r["emp_id"]]
    att = rev / t
    claw = sum(i["net_egp"] for i in my_inv
               if i["total_egp"] - i["paid_egp"] > 0.005 and (AS_OF - i["due_date"]).days > 60)
    base = rev - claw
    if att < 0.8:
        com = base * 0.02
    elif att <= 1.0:
        com = base * 0.035
    else:
        # excess is computed on full revenue; clawback reduces at the 3.5% rate then 6% portion first? keep simple:
        above = max(0.0, rev - t)
        com = min(rev, t) * 0.035 + above * 0.06 - claw * 0.035
    commission.append((r, len(my_inv), rev, t, att, claw, com))

# ---------------------------------------------------------------- company overview + board memo
fin_mgr = next(e for e in employees if e["title"] == "Finance Manager")
write_md("01-Company-Overview.md", f"""
# Delta Pumps & Valves Co. - Company Overview

FICTIONAL DEMO COMPANY. Any resemblance to real companies is coincidental.

Delta Pumps & Valves Co. distributes industrial pumps, valves, motors and spare parts to utilities, industry and
hospitality customers across Egypt. Head office: Cairo. Warehouses: Cairo (CAI) and Alexandria (ALX).

- Fiscal year: calendar year. Currency: EGP. VAT: 14%.
- Headcount: {len(employees)} employees in {len(DEPTS)} departments (see 03-Employees.csv).
- General Manager: {emp_by_id[gm_id]['name']} ({gm_id}).
- Sales Director: {director['name']} ({director['emp_id']}).
- Finance Manager: {fin_mgr['name']} ({fin_mgr['emp_id']}).

## Document index
| File | Content |
|---|---|
| 02-HR-Leave-Policy.md | leave entitlement, carry-over, holidays |
| 03-Employees.csv | staff list, grades, managers, hire dates |
| 04-Leave-Requests-2026.csv | 2026 leave requests |
| 05-Leave-Carryover-2025.csv | days carried from 2025 |
| 06-Travel-and-Expense-Policy.md | hotel caps, per diem, flights, entertainment |
| 07-Expense-Claims-Q3-2026.csv | Q3 expense claim lines |
| 08-Product-Price-List-2026.csv | SKUs, prices, costs, suppliers |
| 09-Pricing-and-Discount-Policy.md | discount rules, approval limits, credit control |
| 10-Customers.csv | customers, tiers, credit limits, terms, account managers |
| 11-Sales-Orders-Q3-2026.csv | Q3 order lines and status |
| 12-Invoices-and-Payments.csv | invoices, due dates, payments |
| 13-Inventory-Stock-2026-10-31.csv | stock per warehouse |
| 14-Suppliers.csv | suppliers, lead times, minimum orders |
| 15-Sales-Commission-Plan-2026.md | commission rules |
| 16-Sales-Targets-Q3-2026.csv | Q3 targets per sales person |
| 17-Board-Memo-Q3-2026.md | management summary for the board |
| 18-Inventory-and-Procurement-Procedure.md | reorder rules |

## Approval limits (company-wide)
- Up to 50,000 EGP: the requester's manager.
- Above 50,000 EGP: department head.
- Above 250,000 EGP: department head and Finance Manager.
""")

q3_inv = [i for i in invoices if D(2026, 7, 1) <= i["invoice_date"] <= D(2026, 9, 30)]
q3_net = sum(i["net_egp"] for i in q3_inv)
total_open_ar = sum(i["total_egp"] - i["paid_egp"] for i in invoices)
top_cust = max(customers, key=lambda c: sum(i["net_egp"] for i in q3_inv if i["cust_id"] == c["cust_id"]))
top_cust_rev = sum(i["net_egp"] for i in q3_inv if i["cust_id"] == top_cust["cust_id"])
memo_rev = round(q3_net * 1.11, -3)               # deliberately overstated
memo_ar = round(total_open_ar, -3)                # correct (rounded)
memo_viol = len(claim_violations) - 3             # deliberately understated
write_md("17-Board-Memo-Q3-2026.md", f"""
# Board Memo - Q3 2026 Results (DRAFT, prepared by Sales & Finance)

FICTIONAL DEMO DOCUMENT.

1. Net invoiced revenue (excl. VAT) for invoices dated July-September 2026 was approximately **{memo_rev:,.0f} EGP**.
2. Open accounts receivable on 31 October 2026 (incl. VAT) stood at approximately **{memo_ar:,.0f} EGP**.
3. Our largest customer by Q3 net invoiced revenue was **{top_cust['name']}**.
4. Expense compliance remains strong: only **{memo_viol}** Q3 expense claim lines broke the Travel & Expense Policy.
5. All customers are within their credit limits.
6. No stock-outs are expected: every warehouse line is above its reorder level.

Prepared for the November board meeting. Figures to be verified against the ledgers before circulation.
""")

# ---------------------------------------------------------------- answer key
lines = ["# Demo dataset answer key", "",
         "Generated by `demo-data/generate.py` (fictional data). **Do not upload this file to Drive.**",
         f"Calculation date: {AS_OF}. Use these to check the assistant's answers.", ""]

lines += ["## A. Leave balances (2026)", "",
          "| emp_id | name | entitlement | valid carry-over | carry-over used | entitlement used | remaining |",
          "|---|---|---|---|---|---|---|"]
for e, ent, co, co_used, used, rem in sorted(leave_answers, key=lambda x: x[0]["emp_id"]):
    lines.append(f"| {e['emp_id']} | {e['name']} | {ent} | {co} | {co_used} | {used} | {rem} |")
lines += ["", "Edge cases: "
          f"{employees[3]['emp_id']} hired 2021-01-01 -> 30 days; {employees[4]['emp_id']} hired 2021-01-02 -> 21 days.", "",
          "### Requests where days_requested is wrong (counted weekends/holidays)", "",
          "| request | emp_id | dates | written | correct working days |", "|---|---|---|---|---|"]
for r in miscounted:
    lines.append(f"| {r['request_id']} | {r['emp_id']} | {r['start']} to {r['end']} | {r['days_requested']} | {r['_wd']} |")

lines += ["", "## B. Expense claim lines that break policy", "", "| claim | emp_id | category | amount | reason |",
          "|---|---|---|---|---|"]
for r, why in claim_violations:
    lines.append(f"| {r['claim_id']} | {r['emp_id']} | {r['category']} | {egp(r['amount_egp'])} | {why} |")
lines += ["", f"Total breaching lines: **{len(claim_violations)}**. Lines needing Finance Manager approval (>10,000): "
          f"{', '.join(r['claim_id'] for r in finance_needed)}."]

lines += ["", "## C. Discount breaches (above allowed, no Sales Director approval)", "",
          "| order | line | customer | qty | given | allowed |", "|---|---|---|---|---|---|"]
for o in discount_breaches:
    lines.append(f"| {o['so_id']} | {o['line']} | {o['cust_id']} | {o['qty']} | {o['discount_pct']}% | {o['_allowed']}% |")

lines += ["", "## D. Credit exposure on 2026-10-31", "", "| customer | limit | exposure | over by |", "|---|---|---|---|"]
for c in sorted(customers, key=lambda c: -exposure[c["cust_id"]]):
    x = exposure[c["cust_id"]]
    lines.append(f"| {c['cust_id']} {c['name']} | {egp(c['credit_limit_egp'])} | {egp(x)} | "
                 f"{egp(x - c['credit_limit_egp']) if x > c['credit_limit_egp'] else '-'} |")
lines += ["", f"Customers over limit: **{', '.join(c['cust_id'] for c, _ in over_limit) or 'none'}**."]

lines += ["", "### Aging of unpaid invoice balances (incl. VAT)", "", "| customer | not due | 1-30 | 31-60 | 61-90 | 90+ |",
          "|---|---|---|---|---|---|"]
for cid_, b in sorted(aging.items()):
    lines.append(f"| {cid_} | " + " | ".join(f"{b.get(k, 0):,.2f}" for k in ["not due", "1-30", "31-60", "61-90", "90+"]) + " |")

lines += ["", "## E. Q3 commission per sales person", "",
          "| emp_id | name | invoices | revenue (net) | target | attainment | clawback (net) | commission |",
          "|---|---|---|---|---|---|---|---|"]
for r, n, rev, t, att, claw, com in commission:
    lines.append(f"| {r['emp_id']} | {r['name']} | {n} | {egp(rev)} | {egp(t)} | {att:.1%} | {egp(claw)} | {egp(com)} |")
lines += ["", "Clawback is removed at the 3.5% rate for reps above target (tier not recalculated)."]

lines += ["", "## F. Reorder plan (order date 2026-11-01)", "",
          "| supplier | sku | warehouse | available | reorder level | qty | cost |", "|---|---|---|---|---|---|---|"]
for sup, ls in sorted(po_by_sup.items()):
    for r, avail, p, cost in ls:
        lines.append(f"| {sup} | {r['sku']} | {r['warehouse']} | {avail} | {r['reorder_level']} | {r['reorder_qty']} | {egp(cost)} |")
lines += ["", "| supplier | PO value | minimum | status | needs Finance approval (>250k) | expected arrival |",
          "|---|---|---|---|---|---|"]
for sup, ls in sorted(po_by_sup.items()):
    total = sum(x[3] for x in ls)
    s = sup_by_id[sup]
    placed = total >= s[5]
    lines.append(f"| {sup} {s[1]} | {egp(total)} | {egp(s[5])} | {'place' if placed else 'below minimum: not placed'} | "
                 f"{('yes' if total > 250000 else 'no') if placed else '-'} | "
                 f"{D(2026, 11, 1) + dt.timedelta(days=s[3]) if placed else '-'} |")

lines += ["", "## G. Board memo fact check", "",
          f"1. Revenue: memo says {memo_rev:,.0f}; actual Q3 net invoiced = **{q3_net:,.2f} EGP** -> memo is overstated.",
          f"2. Open AR: memo says {memo_ar:,.0f}; actual = **{total_open_ar:,.2f} EGP** -> correct (rounded).",
          f"3. Largest customer: **{top_cust['name']}** with {egp(top_cust_rev)} -> correct.",
          f"4. Expense breaches: memo says {memo_viol}; actual **{len(claim_violations)}** -> understated.",
          f"5. Credit limits: memo says all within; actually over limit: **{', '.join(c['cust_id'] for c, _ in over_limit) or 'none'}**.",
          f"6. Stock: memo says none below reorder; actually **{len(reorder_lines)}** warehouse lines below reorder level.",
          "", "## Suggested test questions", "",
          "1. What is the remaining 2026 annual leave balance of each Sales employee?",
          "2. Which leave requests have the wrong number of days, and what should they be?",
          "3. List every Q3 expense claim that breaks the travel policy, with the reason.",
          "4. Which order lines got a discount above policy without the Sales Director's approval?",
          "5. Which customers are over their credit limit on 31 October 2026, and by how much?",
          "6. Calculate Q3 commission for every sales person, showing attainment and clawback.",
          "7. Build the reorder plan per supplier with costs and arrival dates.",
          "8. Fact-check the Q3 board memo against the data."]
KEY.write_text("\n".join(lines) + "\n", encoding="utf-8")

print(f"wrote {len(list(OUT.iterdir()))} files to {OUT}")
print(f"answer key: {KEY}")
print(f"employees={len(employees)} leave_requests={len(leave_rows)} claims={len(claims)} "
      f"order_lines={len(orders)} invoices={len(invoices)} breaches: claims={len(claim_violations)} "
      f"discount={len(discount_breaches)} over_limit={len(over_limit)} reorder_lines={len(reorder_lines)}")

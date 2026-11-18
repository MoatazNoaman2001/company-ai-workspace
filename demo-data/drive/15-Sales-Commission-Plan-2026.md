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

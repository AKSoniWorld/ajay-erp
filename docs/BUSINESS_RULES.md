# Business rules — what the system does and why

These are the decisions you gave while specifying the system, as the code applies them. If a rule here is wrong for the shop, tell the developer **before** go-live: several (rounding, GST type, old-metal rate, dairy, cash limit) are enforced on the server and in the printed papers.

## 1. Money, weight, rounding
- Currency is ₹ (INR) only. Amounts are stored as whole **paise**; weights as whole **milligrams**. Nothing is stored as a decimal, so there are no rounding drifts.
- A bill's **net payable is a whole rupee**: rounded to the nearest rupee (50 paise goes up). The difference is shown as its own **Round Off** line. Payments must add up to exactly the net payable.
- Numbers use the Indian format (₹ 1,23,456.00); times are IST.

## 2. Rates (set by the Admin only, every change is recorded with a reason)
- **SALE**: Gold 24K, 22K and 18K each have their own rate; Silver has one rate (no purity %).
- **EXCHANGE**: what you pay for old metal — Gold (22K basis) and Silver.
- **MARKET**: 24K gold and silver, used only to settle suppliers between cash and fine metal.
- Rate history is never overwritten. A change of more than 10% from the last rate needs an extra confirmation (typing mistakes). A bill made offline is priced with the rate that was in force when it was made.

## 3. Pricing a sale
- Metal value = **net weight × the rate of the piece's grade**. Gold uses its karat's rate (24K 100%, 22K 91.6%, 18K 75%); silver uses the silver rate.
- Making charge on net weight: **₹ per gram**, a **flat ₹ amount per piece**, or a **% of the metal value**.
- Stone / diamond value is added as entered.
- Jewellery + making (+ GST if the branch is registered) − old metal − dairy savings used = net payable (then rounded). Advance held for the customer is applied as a *payment*, not a price change.

## 4. GST and the two kinds of bill
- The **branch** decides: a **GST-registered** branch issues a **GST tax invoice** (3% as CGST + SGST); an **unregistered** branch issues a **bill of supply** (no GST, its own numbering, titled BILL OF SUPPLY).
- There is no per-bill choice. Only the Admin can change a branch's registration (audited). Reports keep the two kinds separate. *(A request to choose "no GST" per customer bill was declined: that would be tax evasion.)*
- **Paper**: bills and credit notes print on **A4** by default, receipts (advance, dues, dairy) on **A5** (half of A4). Each branch sets its defaults (Branches → *Paper for printouts*) and the cashier can pick A4 or A5 for any single print. The content is identical on both sizes; customer papers never show old-metal weights, purity or rate on either.
- Bill numbers: `PREFIX-FY-000001` for GST invoices and `PREFIX-BS-…` for bills of supply, in sequence per branch.
- A finished bill is **sealed** (hash) and never edited. Mistakes are corrected by a **credit note** (Owner/Admin, with a reason), which brings the stock back and records the refund. Bills that used old metal, dairy savings, advance, or left a due cannot be reversed automatically — handle those by hand.

## 5. Old gold and silver (exchange)
- Fine weight = **net weight × purity %**. Value = fine weight × the **EXCHANGE** rate (gold: 22K gold exchange rate; silver: silver exchange rate). The rate is the Admin's, never typed by the cashier.
- Customer papers (bill, dairy receipt, advance receipt) show **only the amount** and, if the branch allows it, the **total fine weight (jama)**. They never show gross, less, net weight, purity or rate. Owners and the Admin can see the full detail on the bill page.
- Old metal taken goes into the branch's raw-metal stock and can later be given to a supplier.

## 6. Dairy savings
- Tenures: **6, 11 or 12 months**. Whole-rupee monthly amount; instalments are whole multiples of it (paying ahead is allowed). Scheme types: **normal**, or **bonus** (1–3 extra instalments added when every instalment is paid).
- The balance can be used on a bill **at any time** during the tenure, at any branch, by the same customer. **Using a bonus scheme's savings before it is complete cancels the bonus**; the cashier must confirm it.
- Missed months are counted; a scheme past its end date but not fully paid shows as "past end date".
- Only the Admin can correct a dairy balance by hand.

## 7. Customer accounts (kept separately)
**Advance** (money we hold), **Due** (money they owe), **Dairy**, **Purchases** (net of returns) and **Old metal** (internal). A due arises only when an Owner or the Admin allows a bill to be part-paid; sales staff cannot leave a due. Each receipt is numbered. Only the Admin can correct or write off a balance.

## 8. NO Cash limit
Cash received from one customer in one day — bill payments, dairy instalments, advances and dues **together** — HAS NO Cash limit

## 9. Suppliers
- Three separate balances: **cash**, **fine gold**, **fine silver**. Positive = we owe them; negative = they owe us (paid ahead).
- A purchase of gold/silver can be **settled in fine weight** (we owe fine metal, plus making in cash) or in cash.
- We pay in **cash**, or in **metal** (fine weight, or net × purity; optionally taken out of the branch's old-metal stock).
- **Rate cut**: cash owed can be turned into fine weight owed, or back, at the **MARKET** rate on that day.
- A purchase adds stock to a branch. It can be cancelled by the Admin only while that stock is still there.
- *Wastage on supplier work was asked about and is not implemented — see Open questions.*

## 10. Stock and transfers
- Stock changes only through recorded movements (opening, purchase, sale, transfer, return, count correction). Counts are corrected by typing the real count with a reason.
- A **transfer** goes: waiting for approval → approved → sent → received. Stock leaves the sending branch when it is **sent** and reaches the other branch only when it is **received**. The whole quantity must be received; shortages are fixed by a count correction.
- A bill made offline may take stock below zero; it is allowed and flagged so someone counts it.

## 11. QR tags
QR only (no barcode). The QR holds `AJ:<SKU>`. Tag sizes 40×25 mm and 50×25 mm. Tags show short name, SKU, karat/purity, gross and net weight, and the branch.

## 12. Who can do what
Admin: everything, all branches. Owner (own branches): bills, products, stock, transfers (create **and** approve), purchases, suppliers, dairy (create and collect), credit notes, reports for the branch. Sales staff: make bills, collect dairy instalments, see products and their own bills and sales. Admin only: rates, branches, staff, audit trail, head-office overview, all-branch reports, dairy/customer/supplier balance corrections, purchase cancellation. Exact table: `packages/shared/src/index.ts`.

## 13. Public catalog
NO METAL prices, making charges, costs or exact quantities ever leave the server for the public pages. Customers see the piece, its karat and weight AND TOTAL PRICE, which shop has it, and a WhatsApp button.

## Open questions (not decided yet)
1. **Wastage** on supplier work: should it be tracked (a % added to what we owe in fine metal)? Not built.: LETS BUILD
2. **Hindi labels** for the counter screens: not built; fonts and layout are ready. : REQUIRED
3. **Dairy instalments offline**: the server can accept them later, the screen currently needs the internet.: LETS BUILD
5. **Thermal bill printing**: bills and receipts are A4/A5 PDFs; no 80 mm receipt printer route.: LETS BUILD

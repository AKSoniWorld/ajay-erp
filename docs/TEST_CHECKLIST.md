# Test checklist — run this by hand before the first real bill

About an hour on the real server, with demo data (`SEED_DEMO=true`) or a few real products. Tick each line. Anything that does not behave as written is a bug — write down the screen, what you did, and the red message.

Use three accounts: **Admin**, an **Owner** of branch A, and **Sales staff** of branch A. Have two branches (A registered for GST, B unregistered) and a label printer.

## A. Setup (Admin)
1. [ ] Sign in; change the Admin password.
2. [ ] **Branches**: A = GST registered with a valid GSTIN; B = not registered. A wrong GSTIN is refused.
3. [ ] **Rates**: set SALE (24K, 22K, 18K, Silver), EXCHANGE (gold, silver), MARKET (24K gold, silver). Changing a rate by more than 10% asks for confirmation.
4. [ ] **Staff**: create the Owner and the Sales staff for branch A. Staff cannot see Rates edit, Branches, Staff or Audit in the menu.
5. [ ] **Products**: add a 22K gold chain (gross 10.000 g, net 10.000 g, making ₹ per gram), a silver anklet, and a piece with a stone value. Each gets a SKU and a QR.
6. [ ] Opening stock: 5 of the chain at A.
7. [ ] **Print tag**: test tag, then the chain's tag. Size is right; the QR scans with a phone and reads `AJ:<SKU>`.

## B. Selling at branch A (Sales staff)
8. [ ] Scan the chain's QR → it is added. Add the silver anklet by search.
9. [ ] Hand-check one line: net weight × rate + making. The screen matches your calculator.
10. [ ] GST appears (3%); net payable is a **whole rupee** with a *Round off* line.
11. [ ] Pay by split Cash + UPI that does **not** add up → Finish is disabled. Make it add up → bill finishes; PDF shows GST invoice, correct number (`PREFIX-FY-000001`), amount in words.
12. [ ] Stock of the chain dropped by 1.
13. [ ] **Old gold**: add 10 g gross, 1 g less, 91.6% → fine weight 8.244 g shown; amount = fine × exchange rate; it is subtracted from the total. The PDF shows only the amount (no weights, purity or rate).
14. [ ] Staff cannot leave a due; Owner can ("Leave … as customer due").
15. [ ] Cash over the limit: take cash that would take one customer's day to ₹2,00,000 → refused with a clear message.

## C. Customer accounts and dairy
16. [ ] Receive an **advance** ₹5,000 → receipt prints. Use ₹2,000 of it on a bill → advance tile drops to ₹3,000.
17. [ ] **Dairy**: Owner creates a bonus scheme (11 months, ₹1,000). Collect 2 instalments in one go → receipt; paid 2 of 11.
18. [ ] Use ₹500 of the dairy balance on a bill → the system asks to confirm the **bonus will be cancelled**; confirm → scheme shows bonus cancelled.
19. [ ] Customer page: statements for advance, due, dairy and purchases agree with what you did.

## D. Bill types, returns, integrity
20. [ ] Switch to branch B and make a bill: it is a **bill of supply** (no GST, `…-BS-…` number).
21. [ ] Owner: **Credit note** on a plain bill (no old metal / dairy / advance) → stock returns, credit note number issued. On a bill that used old metal → refused with a reason.
22. [ ] **Check integrity** on a bill → "Intact".
22a. [ ] **Paper size**: print the same bill on A4 and on A5 (selector next to *Print*) → both show the same content; A5 is half the page. Print an advance receipt on A5 (default) and on A4. Change the branch default under Branches → *Paper for printouts* and print again → the selector starts on the new default.

## E. Offline
23. [ ] Open the app once online on the till. Turn the internet **off**.
24. [ ] New bill: yellow *Working offline* bar; search, scan, price, finish → "Saved on this device"; print the provisional receipt (no weights/rates of old metal).
25. [ ] Turn the internet **on**: the Sync pill empties; the bill now has an official number under Bills; stock is right.
26. [ ] Change a rate (Admin) while a till is offline with a saved bill made *before* the change → on sync the bill is accepted at the old rate (the one in force when it was made).

## F. Stock, transfers, suppliers
27. [ ] **Transfer** 2 chains A → B: Owner creates, approves; A sends (A's stock drops); B receives (B's stock rises). Staff cannot create or approve.
28. [ ] **Correct count** on a piece with a reason → shows in Movements.
29. [ ] **Supplier**: new purchase of the chain with *fine weight* ticked, plus a ₹ making → cash and fine gold owed shown; stock rises. **Pay cash** to settle part of the gold at the market rate → fine owed drops by amount ÷ rate. **Rate cut** converts cash owed to fine. **Give metal** from old-metal stock works only if enough is on hand.

## G. Reports, audit, public
30. [ ] **Reports → Sales** for today: totals equal the sum of the bills; GST and bill-of-supply rows are separate. Download CSV (opens in Excel) and PDF.
31. [ ] Admin **Business overview** shows the figures above (sales, stock, dairy, old metal, dues).
32. [ ] **Audit trail** lists today's changes with the right person; passwords never appear.
33. [ ] `https://<site>/catalog` in a phone browser with **no sign-in**: pieces show with no prices and no counts; the WhatsApp button opens a chat with the piece named.

## H. Safety
34. [ ] A Sales staff cannot open `/branches`, `/users`, `/audit`, `/rates` edit (they get nothing or a refusal).
35. [ ] Sign out and sign in again; an expired session sends you to the sign-in page, not an error screen.
36. [ ] Restore a backup onto a spare database once (`DEPLOYMENT.md` §4) and open it.

**Go-live only when every line passes.**

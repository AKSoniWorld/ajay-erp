# User guide — Ajay Jewellers system

Written for the people at the counter and in the office. Technical setup is in `DEPLOYMENT.md`; the reasons behind the rules are in `BUSINESS_RULES.md`.

## Every morning (Admin)
1. Sign in and open **Rates**. Update the SALE rates (Gold 24K / 22K / 18K, Silver), the EXCHANGE rates (old gold and old silver) and, if you deal with suppliers that day, the MARKET rates. Give a reason; a change of more than 10% asks you to confirm.
2. The rate strip at the top of every screen shows today's rates to everyone.
3. Make sure every till has been opened **once with internet** today, so it has the latest copy for offline use.

## Making a bill (New bill)
1. **Find the piece**: scan the QR on the tag (handheld scanner, or the camera button on a phone/tablet), or type its name or SKU (`F2`). Items out of stock cannot be added.
2. **Customer** (`F3`): search by name or mobile, or add a new one. A bill needs a customer.
3. Change the quantity with − and +. The amount on each line and the totals update by themselves.
4. **Old gold or silver** (`F4`): choose the metal, type gross and less weight (net is worked out), the purity, and you see the fine weight and the amount. The rate is the shop's; you cannot change it.
5. **Dairy savings** (`F5`): if the customer has a scheme with a balance, enter how much to use. If it is a bonus scheme that is not complete, the system asks you to confirm that the bonus will be cancelled — ask the customer first.
6. **Advance**: if the customer has advance money with us, enter how much to use.
7. **Payment** (`F8`): pick Cash / UPI / Card; add another line to split. The amounts must add up to the net payable. Owners and the Admin can leave the balance as a *customer due*.
8. **Finish** (`F9`). Print or open the PDF. `Enter` starts the next bill.

**Paper size:** next to every *Print* button there is a small A4 / A5 selector (A5 is half of A4). It starts on the branch's setting; change it for one print if you wish. The Admin sets the defaults on the Branches screen (*Paper for printouts*).

Good to know: the net payable is always a whole rupee, with the small difference shown as *Round off*. A GST branch makes a GST invoice; an unregistered branch makes a *bill of supply* with no GST. You do not choose; it follows the branch.
**Cash limit:** if a customer's cash for the day would reach ₹2,00,000 (bills, dairy, advance and dues together) the system refuses that payment — take the rest by UPI, card or bank.

## When the internet is down
New bill keeps working. A yellow bar says *Working offline*. Prices are worked out on the device with the last saved rates, and the bill is saved on the device ("Saved on this device") with a **provisional receipt** (OFF-… number) — give that to the customer; it is not a tax invoice. Advance balances are not available offline, and dairy instalments need the internet.
When the connection returns the bills are sent by themselves (see the **Sync** pill at the top). The official bill number is issued then. If a bill cannot be accepted — for example the rate changed in between and the amount no longer matches — it appears under **Sync → Needs review**; an Owner or the Admin opens it, and either finishes it (re-pricing if needed) or cancels it.

## Returns and mistakes
Open **Bills**, find the bill, and (Owner/Admin) press **Credit note**: give the reason and how the money was refunded. The pieces go back into stock and a numbered credit note is made. A bill that used old metal, dairy savings, advance, or left a due cannot be reversed this way — ask the Admin. **Check integrity** confirms a bill has not been altered.

## Customers and their accounts
Open **Customers**. Each customer shows four tiles — advance, due, dairy, purchases — each with its own statement. **Receive advance** and **Collect dues** give a numbered receipt (Print receipt). The Admin can refund an advance (Owner too) or correct and write off a balance, with a reason.

## Dairy savings
**Dairy** lists all schemes. Owner/Admin: **New scheme** — customer, start date, monthly amount, 6 / 11 / 12 months, normal or bonus. On a scheme page press **Collect instalment**, choose how many months (paying ahead is fine), take cash/UPI/card and print the receipt. The page shows paid, usable balance, missed months, and whether the bonus is pending, added or cancelled.

## Products and tags
**Products**: add a piece (category, type, metal and karat, gross and net weight, making charge, stone value, photos, opening stock). It gets a SKU and a QR automatically. Press **Print tag** (or tick several pieces and press **Print tags**). Use *Browser print* with any label printer that has a driver; *Direct USB* on Chrome/Edge for printers that take their own language. Always print a **test tag** first on a new printer.

## Stock and transfers
**Stock** shows what each branch holds. Items shown in red with a minus are oversold — count them and use **Correct count** (give a reason). **Add stock** records first stock; for goods bought from a supplier use **Purchases** instead.
**Transfers**: **New transfer** (from, to, pieces). Someone with approval rights approves it; the sending branch presses **Handed over — send** (stock leaves them); the receiving branch presses **Goods received** (stock reaches them).

## Suppliers and purchases
**Suppliers** shows what you owe or are owed in **cash**, **fine gold** and **fine silver**, separately. **New purchase**: supplier, branch, items (tick *Pay for the metal in fine weight* when the metal is to be paid in gold/silver, so only the making is cash), GST, and any payment made now. On a supplier page: **Pay cash**, **Give metal**, **Rate cut** (turn cash owed into fine weight, or back, at the MARKET rate), and statements for each account.

## Reports
**Reports**: pick a report, a date range (Today / Last 7 days / This month / Last month) and a branch; download **CSV** (opens in Excel) or **PDF**. GST invoices and bills of supply are kept apart. The Admin's **Business overview** shows sales by branch, stock, dairy, old metal on hand, and what is owed.

## Admin tasks
- **Branches**: GST registered (with GSTIN) or not, state, address, WhatsApp number, how old gold appears on customer papers, tag printer settings, close a branch.
- **Staff**: add people, set the role (Admin / Owner / Sales staff) and branches, reset a password, stop someone signing in.
- **Audit trail**: who changed what and when — it cannot be edited.

## Customers browsing (public catalog)
Share `https://<your site>/catalog`. Customers see pieces, karat, weight and which shop has them, and can message the shop on WhatsApp. No prices are shown.

## If something looks wrong
- *"No rate set"*: the Admin has not set that rate today (Rates page).
- *A bill will not finish*: read the red message — it names the problem (payment does not match the total, stock, cash limit).
- *The app looks old after an update*: close it and reopen once with internet.
- *A tag prints blank or the wrong size*: check the label size on the Branches screen and print a test tag.
- Anything else: note the bill number and the time, and tell the Admin — the audit trail will show what happened.

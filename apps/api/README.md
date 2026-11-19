# Ajay Jewellers ERP — API (Phase 1)

```bash
cp ../../.env.example .env        # then edit secrets
docker compose -f ../../docker-compose.dev.yml up -d
npm install                       # from repo root
npm run dev:api                   # http://localhost:3000/api/v1  (health: /health)
npm test                          # unit + Phase 1 e2e (in-memory Mongo)
```
Seeds the first ADMIN from ADMIN_MOBILE / ADMIN_PASSWORD when no users exist.

## Phase 11 notes (public catalog)
- No login, read-only, rate-limited (60/min): `GET /public/products` (`q`, `categoryId`, `subcategoryId`, `metal`, `branchId`, `inStock=true`, `page`, `limit≤50`), `GET /public/products/:sku`, `GET /public/categories`, `GET /public/branches`.
- Shows only what a customer may see: name, SKU, metal/karat, weights, photos, category — **no prices, making charges, costs or exact quantities**. Each piece lists the branches that have it (in stock = yes/no) with a **WhatsApp enquiry link with the product filled in** (`wa.me/91<branch number>?text=…`; branches without a number use `PUBLIC_WHATSAPP_DEFAULT`). Inactive pieces are hidden.

## Phase 12 notes (deployment)
- `docker-compose.prod.yml`: MongoDB replica set, API (non-root, Noto Sans fonts for ₹), Caddy (automatic HTTPS), daily backups of database + photos, optional `web` profile. `GET /health` checks the database. CI in `.github/workflows/ci.yml`. Starter data: `npm run seed` (`SEED_DEMO=true` adds sample products/rates — never in production). Full guide: `docs/DEPLOYMENT.md`.

## Phase 10 notes (offline sync — server side; full protocol in docs/SYNC_PROTOCOL.md)
- `POST /sync/push` (≤100 ops, in order, **idempotent by `clientUuid`**): `SALE` and `DAIRY_PAYMENT`. A sale is re-priced with the **rates in force when it was made** (`offlineAt`); if that differs from what the customer was charged, or finalizing fails, the draft is kept and the op is **NEEDS_REVIEW** (owner/admin queue: `GET /sync/ops`, `POST /sync/ops/:id/resolve`). Invalid operations are **FAILED** and can be corrected and re-sent with the same uuid. Official invoice numbers are issued at sync; the device's provisional number is stored; invoices are back-dated to `offlineAt`.
- Overselling is allowed and flagged (`negativeStock`, visible in the head-office dashboard). Customers made offline are matched by mobile (existing record wins). `offlineAt` must be ≤5 min ahead and ≤30 days old.
- `GET /sync/pull/{products|categories|customers|stock|dairy|rates}` — incremental, paged, upsert-safe. Masters are last-write-wins on the server; devices never push master edits.

## Phase 8 notes (reports + head-office dashboard)
- All reports take `?from=YYYY-MM-DD&to=YYYY-MM-DD` (IST, default = this month, max 366 days), optional `branchId`, and `format=json|csv|pdf`. JSON has money in paise and weights in mg; CSV/PDF show rupees and grams (CSV opens cleanly in Excel; text cells are protected against formula injection). A report over 5,000 rows asks you to narrow the dates.
- `GET /reports/sales` (`granularity=day|month`, `taxMode=GST|NON_GST`): bills, sales, returns (credit notes), net, GST, old metal, dairy, advance and due — **GST invoices and bills of supply are separate rows**. Staff see only their own sales; owners their branches.
- Owner/admin: `old-gold`, `old-silver` (every item: gross/less/net, purity, fine, rate, value + raw stock now), `dairy-collection`, `stock-movement` (`type`, `productId`), `customer-ledger?customerId=` (purchases, returns, advance, due, dairy, old metal — each kept distinct), `supplier-ledger?supplierId=` (cash and fine accounts, `account=` filter). Admin only: `branch-comparison`.
- `GET /dashboard/head-office` (admin): sales (period + today, by branch and by GST / no-GST), stock (pieces per branch, in transit, raw metal), dairy (schemes by status, balance, missed instalments, collections), old-metal exchange, and what customers/suppliers owe.

## Phase 7 notes (suppliers, purchases, transfers)
- **Suppliers** (owner/admin): profile (name, mobile, address, GSTIN), what we owe (`balancePaise`, + = we owe, − = advance paid), purchase totals, payments with voucher numbers `PREFIX-SP-FY-…`, an append-only statement (`/suppliers/:id/ledger`) that always adds up to the balance. Admin-only manual correction.
- **Purchases**: `POST /purchases` records the supplier bill (number `PREFIX-PU-FY-…`, supplier bill no. unique per supplier, optional input GST, optional first payment), adds stock for stock lines and increases what we owe — one transaction. Admin can cancel: stock and amount reverse (refused if the stock was already sold/moved); payments already made stay as supplier advance.
- **Transfers** `PREFIX(source)-TR-FY-…`: `PENDING → APPROVED → IN_TRANSIT → RECEIVED` (or REJECTED / CANCELLED before dispatch). Either branch's owner (or admin) can request; the **source** owner/admin approves (not their own request unless admin) and dispatches — stock leaves the source then; the **destination** owner/admin receives — stock enters then. Every step is in `history`. Receipt must be complete; a shortage is handled with a manual stock adjustment (with a reason).
- **Suppliers are settled in cash *and* fine metal.** Each supplier has three separate balances: cash (`balancePaise`), fine gold (`goldFineMg`) and fine silver (`silverFineMg`) — each with its own statement (`/suppliers/:id/ledger?account=CASH|GOLD|SILVER`). **Fine weight = net weight × purity %** (24K = 100%, 22K = 91.6%, 18K = 75%; silver per its purity).
  - **Purchases**: mark a gold/silver stock item `settleInFine: true` → we owe its fine weight in metal, and `unitCostPaise` is just the making/labour in cash (GST also cash).
  - **Cash converted to fine**: a payment with `settles: "GOLD" | "SILVER"` converts the cash at the current **24K gold / silver MARKET rate** (admin sets it: `POST /rates {metal, karat: 24 (gold), kind: "MARKET"}`) and reduces the metal owed; the ledger line keeps the cash value and the rate. `POST /suppliers/:id/convert` does a "rate cut" between cash and fine (needs enough balance).
  - **Metal payments**: `POST /suppliers/:id/metal-payments` gives fine metal (fine directly, or net + purity), optionally taken from the branch's raw inventory.
  - The profile shows all three balances plus everything valued at today's market rates (`valuedAtMarket`: total in cash, total in fine gold). Cancelling a purchase reverses cash and metal.
- Customers keep their ledger under *Customer accounts* below.

## Two invoice types (set by the branch, not per bill)
- Each branch has `gstRegistered` (default **true**). A **registered** branch issues **GST tax invoices** only (CGST + SGST, number `PREFIX-FY-000001`). An **unregistered** branch (`gstRegistered: false`, no GSTIN) issues **bills of supply** only: no GST, titled "BILL OF SUPPLY", own series `PREFIX-BS-FY-000001` (credit notes `PREFIX-BS-CN-…`). Nothing about GST can be chosen on a bill — the request has no such field.
- Only the admin changes registration (audited). An unregistered branch cannot hold a GSTIN; marking a branch registered needs a GSTIN. If registration changes while a draft is open, finalizing returns `TAX_MODE_CHANGED` and the draft must be re-saved (re-priced). Old bills keep the type they were issued under; credit notes follow their bill.
- Exchange, dairy, advance, due, stock, round-off, PDF and the hash lock work the same for both. List with `?taxMode=GST|NON_GST`; Phase 8 reports keep the two separate.

## Phase 6 notes (printing)
- **A4 invoice / credit note PDF**: `GET /pos/invoices/:id/pdf[?download=1]` — built from the customer-safe view only (old-metal weights/rates and dairy details cannot appear). Drafts get a DRAFT watermark; FINAL invoices are checked against their stored hash first (409 if altered). Layout: branch + GSTIN + state code, invoice no/date, place of supply, items (HSN, karat, gross/net g), taxable value, CGST/SGST, old gold/silver amount, optional total fine weight (jama), dairy amount, round-off, net payable, amount in words, advance/received/due, QR of the invoice number.
- **Receipts (PDF)**: `GET /dairy/receipts/:no/pdf`, `GET /customers/:id/receipts/:no/pdf` (advance `…-AR-…`, due payment `…-PR-…`).
- **Fonts**: install Noto Sans on the server (`apt install fonts-noto-core`, or set `PDF_FONT_DIR`) to print the ₹ sign; without it PDFs still work but show "Rs.".
- **Tags**: `POST /print/tags {branchId, items:[{productId, copies}], language?, tagSize?}` → base64 printer bytes + label data; `POST /print/tags/test` prints a calibration label. Branch `printer` = `{tagSize: 40x25|50x25, connection, deviceName, language: ESCPOS|TSPL}`. The browser sends the bytes via WebUSB / Web Bluetooth / a local print agent (frontend phase). Most gap-sensor label printers speak **TSPL**; ESC/POS layout is sequential and must be calibrated per printer.
- Set each branch's **GSTIN, address and state** (Branches → edit) — they print on the invoice.

## Customer accounts (kept separate)
- `GET /customers/:id/account` — one screen, each account separate: **advance** (money we hold), **due** (money they owe), **dairy** (balance across schemes), **total purchase** (net of credit notes), and — owner/admin only — **old-metal** fine weight/value. `GET /customers/:id/statement?account=ADVANCE|DUE|DAIRY|PURCHASES|EXCHANGES` gives each statement.
- **Advance**: `POST /customers/:id/advance` (receipt `PREFIX-AR-FY-000001`), apply on a bill with `advancePaise`, refund (owner/admin). **Due**: a sale where payments + advance < net payable and the owner/admin sets `allowDue`; collected with `POST /customers/:id/dues/payments` (receipt `PREFIX-PR-…`). Admin can adjust/write off. Cash advances/due payments count toward the same-day ₹2 lakh limit.
- Customer invoice shows: advance adjusted, amount received, balance due — amounts only.

## Phase 5 notes (dairy savings)
- **Update**: dairy can be used **any time** during the tenure. On a BONUS scheme, using it before the scheme is complete cancels the bonus for good — the POS must send `confirmForfeitBonus: true` (otherwise `BONUS_FORFEIT`). NORMAL schemes need no confirmation.
- **Scheme**: customer + branch + start date + monthly amount (whole ₹) + 6/11/12 months + NORMAL/BONUS (bonus = extra instalment(s) credited when every instalment is paid). Numbers: `PREFIX-DY-FY-000001`; receipts `PREFIX-DR-FY-000001`.
- **Collection**: amount must be a whole number of instalments (advance / multi-month OK), never above the scheme total. Missed months = instalments due (IST calendar months, start month counts) − paid. Status is derived: ACTIVE → COMPLETED (all paid) or MATURED_SHORTFALL (end date passed) → REDEEMED (balance used up).
- **On a bill** (`dairy: [{schemeId, amountPaise}]` on quote/draft): only COMPLETED / MATURED schemes of that same customer, never above the balance. Order: … − old metal = subtotal − dairy = final payable (then rupee round-off). Finalize debits atomically and links the ledger row to the invoice; two bills racing for one balance → one wins. Customer copy = amount only.
- **Ledger** is append-only (`balance = Σ credits − Σ debits`; `balancePaise` is its atomic cache). Admin-only manual adjustments, audited.
- Cash on dairy deposits counts toward the same-day ₹2 lakh cash limit as bills.

## Phase 4 notes (old-metal exchange)
- fine weight = net × purity%; value = fine × **22K gold EXCHANGE rate** (silver: silver EXCHANGE rate). Rate is server-side; purity/weights are entered at the POS (`/exchange/preview`, or `exchanges[]` on quote/draft).
- Finalize (same transaction): Exchange record + raw-inventory `EXCHANGE_IN` (net & fine mg). Draft edits keep a before-trail (`exchangeEdits`). Exchange value > bill is rejected. Invoices with exchange can't be auto-credited yet.
- Customer copy: amount only; branch `exchangeDisplay: AMOUNT_AND_FINE_WEIGHT` also shows total fine weight (jama). Showing both lets someone derive the rate, so default is AMOUNT.
- Raw inventory: `GET /raw-inventory`, `POST /raw-inventory/adjust` (MELT_OUT/ADJUST, Owner/Admin).

## Phase 3 notes (rates + POS)
- **Pricing** (server-side only): metal = net g × sale rate of the item's grade (**GOLD 22K / GOLD 18K / SILVER** — each has its own rate; no purity % is applied); making = per-gram on net weight / flat / % (basis points) of metal; `stoneValuePaise` added as-is; GST 3% (CGST+SGST); net payable rounded to whole rupees with a `roundOff` line.
- **Rates**: per grade (gold needs `karat` 22|18, silver has a single rate); `SALE` and `EXCHANGE` kinds (EXCHANGE is used from Phase 4). Gold products must carry `karat`. Immutable history; >10% jump needs `confirmLargeChange`.
- **Finalize** (one transaction): re-price → `PRICE_CHANGED` 409 if anything moved → payments must equal net payable → ₹2 lakh cash rule (Sec 269ST, per customer per day) → number `PREFIX-FY-000001` → stock SALE movements → lock + SHA-256 `contentHash`.
- **Locked invoices**: updates never match, deletes are blocked, `/verify` recomputes the hash. Corrections = full credit note (`PREFIX-CN-FY-000001`).
- STAFF see only bills they created. Customer copy = `GET /pos/invoices/:id/customer-view` (whitelist DTO; amounts only for exchange/dairy).

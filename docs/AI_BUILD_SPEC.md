# Ajay Jewellers ERP + POS — Full Architecture & AI Build Spec

> **Status:** every phase below has been written. The code has **not yet been compiled or run**. Where this spec and the code differ, the code and `docs/BUSINESS_RULES.md` are authoritative (§13 and §19 were updated to match what was built).

> **For the AI agent:** Build exactly in the phase order in §18. Do not skip acceptance criteria. Do not ask questions; use the assumptions in §19. Reuse `src/engines/pricing.engine.ts` and `dairy.engine.ts` (already written and tested) — never re-implement their math elsewhere.

---

## 1. Non-negotiable invariants
1. **Money = integer paise. Weight = integer milligrams.** No floats persisted. Display formatting only in the UI.
2. **Finalized invoices are immutable.** Corrections = credit note / reversal invoice. Enforce in service layer AND a Mongoose pre-hook that rejects updates when `locked: true`.
3. **Customer-facing output is built only from `toCustomerInvoice()`.** PDF, WhatsApp share, public API and print all use this whitelist DTO. Old metal weight, rate, purity and dairy breakdown must never reach it.
4. **Every mutation of rates, exchange, dairy, stock, invoices, users writes an audit log** (before/after, actor, IP).
5. **Branch scoping is server-enforced** from the JWT, never from client-supplied branch IDs (except Admin).
6. **Stock changes only via the `StockMovement` ledger**; product stock is a derived/cached figure.
7. **Invoice numbers are server-issued, atomic, per branch.**
8. All multi-document writes use **Mongo transactions** (replica set).
9. **Round-off:** the final Net Payable is always a whole-rupee amount (nearest rupee; 50 paise and above rounds up). Paise are never collected: the difference is stored in `totals.roundOff` (signed paise) and printed on the invoice as a separate "Round Off" line (e.g. −₹ 0.41 / +₹ 0.50) just above Net Payable. Payments (cash/UPI/card/split) must sum to the rounded Net Payable. Calculation lives only in `pricing.engine.ts`.
10. **Currency is Indian Rupees (INR, ₹) only.** Stored as paise (1 ₹ = 100 paise). Every screen, PDF, receipt, report and CSV shows `₹` with Indian digit grouping (₹ 1,23,456.00). Amount in words always reads "Rupees … and … Paise Only". No `$` or other currency anywhere; no currency field/selector. Use `src/common/utils/money.ts` (`formatINR`, `amountInWords`) for all formatting.

## 2. Stack
| Layer | Choice |
|---|---|
| Backend | Node 20, NestJS 10, TypeScript strict, Mongoose 8 |
| DB | MongoDB 7 (replica set `rs0`). Redis is not used. |
| Queue | BullMQ (sync processing, PDF jobs) |
| Auth | JWT access (15 min) + refresh (7 d, rotating, stored hashed), argon2 |
| Validation | class-validator / zod DTOs; global ValidationPipe whitelist |
| PDF | Puppeteer (HTML→A4) or pdfmake; QR: `qrcode` |
| Thermal | ESC/POS bytes via `escpos-buffer` generated server-side; sent by WebUSB/WebBluetooth/local print agent |
| Frontend | React 18 + Vite + TypeScript, Tailwind, TanStack Query, Zustand, React Router, `idb` (IndexedDB), vite-plugin-pwa |
| Test | Vitest/Jest (unit), Supertest + mongodb-memory-server (API), Playwright (POS e2e) |
| Infra | Docker Compose, nginx, GitHub Actions CI |

## 3. System diagram
```
┌────────────────────────── Browser (PWA) ──────────────────────────┐
│ POS │ Inventory │ Dairy │ Admin/HO │ Reports │ Public Catalog     │
│ Zustand + TanStack Query ── API client ── IndexedDB (cache+outbox)│
│ Service Worker (offline shell) ── Print adapter (PDF / ESC-POS)   │
└──────────────┬──────────────────────────────┬─────────────────────┘
               │ HTTPS REST /api/v1           │ POST /sync/push, GET /sync/pull
┌──────────────▼──────────────────────────────▼─────────────────────┐
│ NestJS: Guards(JWT→Roles→BranchScope) → Controllers → Services   │
│ Interceptors: Audit, Idempotency, Logging                         │
│ Modules: auth users branches catalog inventory pos exchange dairy │
│  customers suppliers transfers reports print sync rates audit     │
│ Engines (pure TS): pricing, dairy, gst, numbering                 │
└───────┬───────────────────────────┬──────────────────────────────┘
        │ Mongoose (transactions)
   ┌────▼─────┐
   │ MongoDB  │
   └──────────┘
```

## 4. Repository layout (monorepo, npm workspaces)
```
ajay-erp/
├─ apps/
│  ├─ api/src/
│  │  ├─ main.ts, app.module.ts
│  │  ├─ common/ (guards, decorators, interceptors, filters, pipes, utils/money.ts)
│  │  ├─ engines/ (pricing.engine.ts, dairy.engine.ts, gst.ts, numbering.ts)
│  │  └─ modules/<name>/ {name.module, name.controller, name.service, name.schema, dto/}
│  └─ web/src/
│     ├─ app/ (router, providers, theme)
│     ├─ features/<name>/ (pages, components, api, hooks)
│     ├─ offline/ (db.ts, outbox.ts, syncEngine.ts)
│     ├─ print/ (escpos.ts, pdf.ts, adapters/)
│     └─ components/ui/ (Button, Input, Table, Modal, Money, Weight)
├─ packages/shared/ (types, zod schemas, constants, money/weight helpers)
├─ docker/ (api.Dockerfile, web.Dockerfile, nginx.conf, mongo-init.js)
├─ docker-compose.yml, docker-compose.prod.yml
├─ .env.example, .github/workflows/ci.yml
└─ docs/ (this spec, DEPLOYMENT.md, API.md)
```

## 5. Roles & permissions
| Capability | ADMIN | OWNER (branch) | STAFF (POS) |
|---|---|---|---|
| All branches / HO dashboard | ✔ | ✘ (own branch dashboard) | ✘ |
| Set metal rates | ✔ | ✘ | ✘ |
| Create/finalize invoice | ✔ | ✔ | ✔ |
| Edit draft exchange | ✔ | ✔ | own drafts only |
| Void/credit-note invoice | ✔ | ✔ (reason required) | ✘ |
| Product CRUD | ✔ | ✔ | read |
| Stock transfer create | ✔ | ✔ | ✘ |
| Transfer approve | ✔ | ✔ (source branch) | ✘ |
| Dairy create/collect | ✔ | ✔ | collect only |
| Dairy adjustment edit | ✔ | ✘ | ✘ |
| Suppliers/purchases | ✔ | ✔ | ✘ |
| Reports | all | own branch | daily own sales |
| Users, branches, audit log | ✔ | ✘ | ✘ |

Implement as `@Roles()` + `@RequirePermission('invoice.finalize')` with a permission map in `packages/shared`.

## 6. Data model
(All docs: `_id`, `createdAt`, `updatedAt`, `createdBy`; paise/mg ints.)

- **Branch**: `code`(unique), `name`, `address`, `gstin`, `state`, `invoicePrefix`, `invoiceSeq`(int), `printer{tagSize:'40x25'|'50x25', connection:'usb'|'bluetooth'|'agent', deviceName}`, `active`.
- **User**: `name`, `mobile`(unique), `passwordHash`, `role`, `branchIds[]`, `active`, `lastLoginAt`.
- **Category / Subcategory**: `name`, `parentId?`, `order`. Index unique name per parent.
- **Product**: `name`, `shortName`, `sku`(unique), `categoryId`, `subcategoryId`, `metal:'GOLD'|'SILVER'|'DIAMOND'`, `karat` (GOLD only: 22|18 — picks the rate), `purityPct` (informational), `stoneValuePaise`, `grossMg`, `netMg`, `makingType:'PER_GRAM'|'FLAT'|'PERCENT'`, `makingValue`, `images[]`, `qrPayload`, `hsn`('7113'), `active`. Index: text on name/sku.
- **BranchStock**: `productId`, `branchId`, `qty`, unique(productId,branchId). Updated only by StockMovement service.
- **StockMovement**: `productId`, `branchId`, `type:'PURCHASE'|'SALE'|'TRANSFER_OUT'|'TRANSFER_IN'|'ADJUST'|'RETURN'`, `qty`(+/-), `refType`, `refId`, `at`.
- **Rate**: `metal`, `karat` (GOLD: 22|18; SILVER: none), `kind` SALE|EXCHANGE, `ratePerGramPaise` (per gram of that grade), `reason`, `setBy`. Current = latest per grade.
- **Customer**: `name`, `mobile`(unique), `address`, `remarks`, `gstin?`, `dueBalancePaise`.
- **Invoice**: `branchId`, `number`("RNC1-2526-000123"), `status:'DRAFT'|'FINAL'|'CANCELLED'`, `locked`, `customerId`, `lines[{productId,name,sku,hsn,grossMg,purityPct,metalValuePaise,makingPaise}]`, `totals`(output of `calculate`), `payments[{mode:'CASH'|'UPI'|'CARD',amountPaise,ref}]`, `exchangeIds[]`, `dairyLedgerId?`, `remarks`, `finalizedAt`, `contentHash`, `clientUuid`(unique, offline idempotency), `creditNoteOf?`.
- **Exchange** (internal only): `invoiceId`, `branchId`, `items[{metal,grossMg,lessMg,netMg,purityPct,fineMg,ratePerGramPaise,valuePaise,remarks}]`, `totals{gold/silver NetMg,FineMg,ValuePaise}`, `editHistory[]` (draft edits); immutable, `editHistory[]`.
- **RawInventory**: `branchId`, `metal`, `netMg`, `fineMg`; movements via `RawMovement{type:'EXCHANGE_IN'|'MELT_OUT'|'ADJUST', ...}`.
- **DairyScheme**: `customerId`, `branchId`, `start`, `monthlyPaise`, `durationMonths:6|11|12`, `type:'NORMAL'|'BONUS'`, `bonusInstallments`, `status:'ACTIVE'|'COMPLETED'|'MATURED_SHORTFALL'|'REDEEMED'|'CLOSED'`, `schemeNo`.
- **DairyPayment**: `schemeId`, `amountPaise`, `mode`, `monthsCovered`, `receiptNo`, `at`, `collectedBy`.
- **DairyLedger**: `schemeId`, `type:'CREDIT'|'DEBIT'`, `amountPaise`, `invoiceId?`, `balanceAfter`, `at`.
- **Supplier**: `name`, `mobile`, `gstin`, `address`, `balancePaise`.
- **Purchase**: `supplierId`, `branchId`, `billNo`, `items[]`, `totalPaise`, `paidPaise`. **SupplierPayment**: `supplierId`, `amountPaise`, `mode`, `at`.
- **Transfer**: `fromBranchId`, `toBranchId`, `items[{productId,qty}]`, `status:'PENDING'|'APPROVED'|'IN_TRANSIT'|'RECEIVED'|'REJECTED'`, `requestedBy`, `approvedBy`, `receivedBy`, timestamps.
- **AuditLog** (append-only, no update/delete routes): `actorId`, `role`, `branchId`, `action`, `entity`, `entityId`, `before`, `after`, `ip`, `at`.
- **SyncOp**: `clientUuid`(unique), `deviceId`, `type`, `payload`, `status`, `error`, `at`.

## 7. API (prefix `/api/v1`, all JSON, paginated lists `?page&limit&q`)
- **auth**: `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`
- **users/branches** (ADMIN): CRUD
- **catalog**: `/categories`, `/subcategories`, `/products` CRUD; `/qr.png`; `POST /products/:id/images`
- **inventory**: `GET /inventory?branchId`, `POST /inventory/adjust`, `GET /inventory/movements`
- **rates**: `GET /rates/current`, `POST /rates` (ADMIN)
- **pos**: `GET /pos/search?q|code`, `POST /pos/quote` (runs `calculate`, no save), `POST /pos/invoices` (draft), `PATCH /pos/invoices/:id` (draft only), `POST /pos/invoices/:id/finalize`, `POST /pos/invoices/:id/credit-note`, `GET /pos/invoices/:id/pdf` (customer DTO only)
- **exchange** (internal): `POST /exchange/preview`, edits only on drafts; `GET /exchange?branchId` (OWNER/ADMIN)
- **dairy**: `POST /dairy/schemes`, `GET /dairy/schemes/:id` (status via engine), `POST /dairy/schemes/:id/payments`, `GET /dairy/customer/:id/balance`, `POST /dairy/adjustments` (ADMIN), `GET /dairy/receipts/:no/pdf`
- **customers / suppliers / purchases**: CRUD + `/ledger`
- **transfers**: `POST`, `POST /:id/approve|reject|dispatch|receive`
- **reports**: `/reports/{sales,branch-comparison,old-gold,old-silver,dairy-collection,stock-movement,customer-ledger,supplier-ledger}?from&to&branchId&format=json|csv|pdf`
- **dashboard**: `GET /dashboard/head-office` (ADMIN)
- **print**: `POST /print/tag` → ESC/POS bytes (base64) for given product(s), qty, branch printer config
- **sync**: `POST /sync/push`, `GET /sync/pull?since=`
- **public** (no auth, rate-limited): `GET /public/products`, `/public/products/:sku` (no cost/making breakdown, only branch availability), WhatsApp link built client-side.
- **audit** (ADMIN): `GET /audit`

Error format: `{statusCode, code, message, details}`.

## 8. State machines
- **Invoice**: `DRAFT → FINAL (locked) → (credit note creates new FINAL linked)`; `DRAFT → CANCELLED`. FINAL transaction: re-run `calculate` server-side → verify rate snapshot → deduct stock → add RawInventory → debit DairyLedger → allocate number → compute `contentHash` → set `locked`.
- **Transfer**: `PENDING → APPROVED → IN_TRANSIT → RECEIVED`; or `PENDING → REJECTED`. Stock leaves source at DISPATCH, enters destination at RECEIVE.
- **Dairy**: derived by `dairyStatus()`; `REDEEMED` set when ledger fully consumed/closed.

## 9. Engines
Use `pricing.engine.ts` (`calculate`, `toCustomerInvoice`) and `dairy.engine.ts` as-is. Add `numbering.ts`: `${branch.invoicePrefix}-${FY}-${seq padded 6}` using `findOneAndUpdate($inc)` inside the finalize transaction; FY = Apr–Mar. Server **always recomputes** totals; client totals are advisory only.

## 10. Printing
- **A4 invoice**: HTML template → PDF. Header (branch, GSTIN), customer, items table (name, HSN, amount), CGST/SGST, then `Old Gold Exchange`, `Old Silver Exchange`, `Dairy Adjustment` as single amount rows, Round Off, Net Payable (whole rupees), amount in words (Indian), remarks, signature, QR of invoice number. Source data: customer DTO only.
- **Tag (40×25 / 50×25)**: fields: short name, SKU, weight+purity, branch name, QR (the only code on the tag; large, centred right). Layout at 203 dpi (8 dots/mm): 40×25 = 320×200 dots. Generate ESC/POS (or TSPL if printer needs; make driver pluggable `TagPrinterDriver`). Buttons in Product create, Inventory row, POS line.
- Thermal printing is **tags only**; per-branch printer config.

## 11. Offline-first sync
- IndexedDB stores: `products`, `customers`, `rates`, `branchStock`, `outbox`, `meta`.
- Pull on login + every 60 s online: `GET /sync/pull?since=<serverTime>` → upsert.
- Offline POS creates **draft sale with `clientUuid`**, prints provisional receipt (no official number). Outbox op `{uuid, type, payload, createdAt}`.
- `POST /sync/push` processes ops **in order, idempotent by uuid**. On success server issues the official invoice number; client replaces provisional. Exchange rate used = rate cached at sale time; server validates rate existed in `Rate` history, else flags `needsReview`.
- Conflicts: masters = last-write-wins (by `updatedAt`) with AuditLog entry of the overwritten value. Stock oversell → allowed, flagged negative-stock alert. Invoices/dairy payments are append-only (no conflict).
- UI: status pill (Online / Offline / Syncing n / Failed n) with retry.

## 12. Security
argon2 hashing; rate limiting (Nest throttler, in memory per instance; stricter on login and the public catalog); helmet; CORS allow-list; refresh-token rotation; field-level DTO whitelist; mongo-sanitize; secrets via env; audit interceptor on all non-GET; invoice `contentHash` (SHA-256 of canonical JSON) verified on PDF generation; Admin-only rate change with reason; exchange edit allowed only while DRAFT, each edit appended to `editHistory`; HTTPS only in prod; daily Mongo backup cron.

## 13. Frontend (as built)
**Look**: dark "counter" mode for `/pos` only; bright back-office elsewhere; gold is the only accent. Noto Sans Variable for text (Hindi-ready), Playfair Display for the wordmark and headings. Money and weights right-aligned, tabular figures. Tokens in `apps/web/src/index.css` and `tailwind.config.ts`.

**Routes** — signed in: `/` home · `/pos` New bill · `/invoices`, `/invoices/:id` bills · `/products`, `/products/new`, `/products/:id` · `/inventory` stock · `/transfers` · `/customers`, `/customers/:id` · `/dairy`, `/dairy/:id` · `/suppliers`, `/suppliers/:id` · `/reports` (tabs; head-office overview for Admin) · `/rates` · `/sync` · `/users` staff · `/branches` · `/audit`. Public (no sign-in): `/login`, `/catalog`, `/catalog/:sku`. The menu is built from the role (`lib/nav.ts`).

**New bill** (three panes): find (QR scan by handheld scanner or phone camera, or search) · the bill (customer, lines, old metal, dairy, advance) · totals and split payment. Keyboard: `F2` find, `F3` customer, `F4` old metal, `F5` dairy, `F8` payment, `F9` finish, `Enter` for the next bill. Pricing comes from the server when online and from the same shared rules on the device when offline.

**Offline**: IndexedDB copy of products, customers, rates, stock and dairy balances; a queue of bills waiting to be sent (Sync screen shows waiting / needs review / not accepted); provisional receipts with temporary numbers; a service worker (vite-plugin-pwa) caches the app and product photos. Not queued offline yet: dairy instalments, advance balances, customer-account receipts. See `docs/SYNC_PROTOCOL.md`.

**Tags**: browser print (any label printer with a driver; QR drawn on the device, 40×25 or 50×25 mm) or direct USB with the printer's own language (ESC/POS or TSPL from the server, via WebUSB; Chrome/Edge). Bluetooth and a local print agent are configurable per branch but not wired in the web app.

**Public catalog**: grid and per-piece page, filters (metal, type, shop, available now), shop locations, WhatsApp buttons (`https://wa.me/<branch-number>?text=` with the piece named). No prices, no quantities.

## 14. Reports
Each report = aggregation pipeline + CSV/PDF export. Old gold/silver reports show weights/rates (internal, OWNER/ADMIN only). Dairy collection report by date/branch/scheme. Stock movement from `StockMovement`. Ledgers from invoices+payments / purchases+payments.

## 15. Config (`.env.example`)
`NODE_ENV, PORT, MONGO_URI=mongodb://mongo:27017/ajay?replicaSet=rs0, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, CORS_ORIGINS, UPLOAD_DIR, PUBLIC_WHATSAPP_DEFAULT, TZ=Asia/Kolkata`

## 16. Docker / deployment
Compose services: `mongo` (replica-set init script), `api` (multi-stage build, non-root), `web` (nginx serving Vite build, proxies `/api`), `backup` (mongodump cron). Prod: reverse proxy with Let's Encrypt, volumes for mongo/uploads, healthchecks (`/health`), `docker compose -f docker-compose.prod.yml up -d`. Write `docs/DEPLOYMENT.md` covering VPS setup, DNS, SSL, backups/restore, upgrade, rollback.

## 17. Testing requirements
- Unit: engines, numbering, permissions map.
- API: invoice finalize (stock, numbering, lock, immutability), customer DTO leak test, branch-scope isolation, transfer flow, dairy adjust ≤ balance, idempotent sync push.
- E2E (Playwright): login → scan → exchange → dairy → finalize → PDF.
- CI gate: lint + typecheck + tests must pass.

## 18. Build phases (each ends with passing tests + short README note)
*Status: phases 1–12 written; web screens for every route in §13 written. Untested by a real build — run `npm install && npm run build && npm test` first.*
1. **Foundation**: monorepo, shared pkg, Nest bootstrap, config, Mongo, auth, RBAC, branch scope, audit interceptor, users, branches. *AC: login works; STAFF cannot hit admin routes; audit row written.*
2. **Catalog & inventory**: categories, products, QR endpoint, StockMovement, BranchStock. *AC: SKU unique; QR PNG renders; stock only changes via movements.*
3. **Rates + POS core**: rates, search, quote, draft, finalize with numbering, lock, payments. *AC: Net Payable is whole rupees with roundOff stored; payments must equal it; finalize is atomic; second edit rejected; numbers sequential per branch under concurrency.*
4. **Exchange + raw inventory**: preview, persist with invoice, raw movements, edit history. *AC: customer DTO test passes.*
5. **Dairy**: schemes, collections, receipts, ledger, POS adjustment. *AC: cannot overspend balance; status correct.*
6. **Printing**: A4 PDF, tag ESC/POS, UI buttons in 3 places.
7. **Customers, suppliers, purchases, transfers**.
8. **Reports + HO dashboard**.
9. **Frontend** (can start after phase 3 in parallel): design system → POS → rest, following §13.
10. **Offline/PWA sync** (§11).
11. **Public catalog**.
12. **Docker, CI, deployment guide, seed script** (1 admin, 2 branches, sample products).

## 19. Assumptions
1. GST 3% on metal + making (CGST/SGST intra-state, IGST if customer state differs — add to `gst.ts`).
2. Sale pricing = net weight × the rate of the item's grade (gold 22K / 18K; silver one rate; no purity %). Old-metal exchange = **fine weight (net × purity %) × the 22K gold EXCHANGE rate** (silver: the silver EXCHANGE rate); the rate is admin-set, never client-supplied. Customer documents (invoice, dairy receipt, advance) show only the old-metal **amount** and, if the branch's `exchangeDisplay` allows, the total **fine weight (jama)** — never gross/less/net weight, purity or rate.
3. Bonus scheme gifts `bonusInstallments` (default 1) on full completion.
4. Ranchi head office = ADMIN; branches have own GSTIN optional (fallback to company GSTIN).
5. Currency: Rupees (₹, INR) only. Language: English UI, Indian number format (₹ 1,23,456.00), amount in words in Indian system (Lakh/Crore). Hindi labels can be added via i18n later.
7. Dairy: instalments are whole multiples of the monthly amount; the balance can be used on a bill at any time during the tenure by the same customer at any branch, but using it before the scheme is complete cancels the bonus (cashier must confirm); bonus is credited only when all instalments are paid and no early use happened; invoices that used dairy or old metal cannot be auto-credited (manual process). Dairy cash deposits count toward the same-day ₹2 lakh cash limit.
8. Customer accounts are separate ledgers: ADVANCE, DUE, DAIRY, PURCHASES (derived), EXCHANGES (internal). Due arises only from an owner/admin credit sale; advance is applied as a payment source (not a price change).
9. PDFs are generated server-side from the whitelisted customer view only. ₹ needs Noto Sans installed (Docker: fonts-noto-core), else PDFs show "Rs.". Tag printing returns printer-ready bytes (ESC/POS or TSPL per branch); transport (WebUSB/Bluetooth/agent) is a frontend concern.
10. Two invoice types are decided by the BRANCH: GST-registered branch → GST tax invoice only; unregistered branch (no GSTIN) → bill of supply only (no GST, own BS series, titled "BILL OF SUPPLY"). No per-bill GST choice exists in the API; only the admin changes registration (audited); reports keep the two separate.
11. Suppliers are settled in CASH and FINE gold/silver (three separate balances); fine weight = net × purity % (24K 100%, 22K 91.6%, 18K 75%); cash ↔ fine conversions use the admin-set 24K gold / silver MARKET rate (kind MARKET); balances can go negative (= advance). Transfers: stock leaves the source at dispatch and enters the destination at receipt; full-quantity receipt only (shortages via manual adjustment).
12. Offline sync: provisional receipts on the device, official numbers at sync; sales re-priced with the rates of the sale time and sent to review on mismatch; oversell allowed and flagged; masters last-write-wins on the server (devices never push master edits). See docs/SYNC_PROTOCOL.md.
6. Thermal tags use a local print agent or WebUSB; browser Bluetooth is best-effort.
13. Cash limit (Income Tax Sec 269ST): cash received from one customer on one day — bill payments, dairy instalments, advances and dues together — may not reach ₹2,00,000 (the law says “₹2,00,000 or more”); the server refuses the payment that would take the day's total to that figure. Confirm the rule with your CA.
14. Rounding: every bill's net payable is rounded to the nearest whole rupee (50 paise rounds up) and the difference is its own Round Off line; all stored money is integer paise, weights integer milligrams.
15a. Paper: bills/invoices/credit notes default to A4 and receipts to A5, per branch (`invoicePaper`, `receiptPaper`); any PDF endpoint takes `?size=A4|A5` to override for one print. Same content on both sizes.
15. QR only (no barcode): a tag's QR holds `AJ:<SKU>`; the search parameter is `code`. Tags show the short name, SKU, karat/purity, gross and net weight and the branch.
16. Bills are sealed: a SHA-256 hash of the finished bill is checked every time a PDF is made and by *Check integrity* on the bill page. A finished bill is never edited; mistakes are fixed with a credit note.
17. Public catalog data comes from a fixed list of fields (no prices, making, costs or exact quantities) and is rate-limited.
18. Open questions, unanswered: (a) wastage percentage on supplier work — not implemented; (b) Hindi labels — the UI is English only, fonts and layout are ready for it.

# Ajay Jewellers — web app (React + Vite + Tailwind PWA)

```bash
npm install                 # from the repo root
npm run dev:api             # API on :3000
npm run dev:web             # app on http://localhost:5173 (proxies /api to the API)
npm run build -w @ajay/web && npm run preview -w @ajay/web     # production build, to try offline mode
```

## Screens
| Area | What is there |
|---|---|
| Sign-in, shell | Mobile + password, silent token refresh, role-based menu, rate strip, branch switcher, online/offline pill |
| Home, Rates | Today's sales (head-office overview for Admin) · admin rate edit with reason and a 10% jump guard (SALE, EXCHANGE, MARKET) |
| **New bill** (`/pos`) | QR scan / search, customer, cart, old gold & silver with fine-weight preview, dairy, advance, split payments, round-off, GST invoice or bill of supply, PDF. **Works offline.** |
| Bills | Search and filters, bill view, PDF, credit note with refund, integrity check, finish/cancel a draft (also bills held back by sync) |
| Products | List with stock, add/edit, photos, opening stock, QR, **tag printing** |
| Stock, Transfers | Stock by branch, count corrections, add stock, movement history · start / approve / dispatch / receive / cancel |
| Customers, Dairy | Four separate accounts with statements and receipts · schemes, instalments, balance history |
| Suppliers | Cash + fine gold + fine silver balances, purchases (also settled in fine weight), cash/metal payments, rate cut, statements |
| Reports | Eight reports + Admin business overview; CSV and PDF download |
| Admin | Branches (GST status, printer, WhatsApp), Staff, Audit trail |
| Public | `/catalog` and `/catalog/<SKU>` — no sign-in, no prices, WhatsApp buttons |

## Code map (`src/`)
`app/` router and shell · `features/<area>/` one folder per area above · `components/ui/` Button, Field, Modal, Money, Status · `lib/` api (fetch + refresh), auth store, formatting (INR, grams, IST dates), hooks, nav, files (PDF/CSV download) · `offline/` IndexedDB (`db.ts`), kv/store, sync (pull/push/queue), local search & pricing helpers, provisional receipt.
Pricing is **not** re-written in the browser: `packages/shared/src/pricing.ts` is the same code the server uses (`tests/pricing-parity.test.ts` proves it).

## Offline in one minute
The first time a device opens the app online it downloads products, customers, rates, stock and dairy balances into IndexedDB. With no internet, New bill searches that copy, prices with the saved rates, and saves the bill to a queue with a provisional receipt number. When the connection returns the queue is sent; the server re-prices each bill with the rates of the sale time and issues the official number. Differences go to **Sync → Needs review**. Not available offline: advance balances, dairy instalments, account receipts, reports.
Installable: browsers offer "Add to Home screen"; the service worker caches the app and product photos. Add 192/512 px PNG icons for the best install prompt everywhere.

## Tags
Browser print works with any label printer that has a driver (size is set from the branch). Direct USB sends ESC/POS or TSPL bytes from the server using WebUSB (Chrome/Edge, HTTPS). Always print a test tag on each printer.

## Not done yet
Hindi labels · dairy instalments offline · automated web tests (only the shared-pricing parity test and the server suites exist) · a Bluetooth / print-agent route for tags.

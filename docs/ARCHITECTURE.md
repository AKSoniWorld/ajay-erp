# Ajay Jewellers ERP + POS — Architecture

```
 React+Vite PWA (Tailwind, gold/black/white)
 ├─ POS (keyboard-first, scan)   ├─ Admin/HO dashboard   ├─ Public catalog + WhatsApp
 └─ IndexedDB outbox ──(sync queue, idempotency keys)──┐
                                                       ▼
 NestJS API ── JWT + RBAC guard ── Audit interceptor ── Branch-scope guard
 ├─ pricing.engine   ├─ dairy.engine   ├─ inventory/transfer   ├─ print (PDF, ESC/POS)
 └─ MongoDB (Mongoose, replica set for transactions)
 Docker: api, web (nginx), mongo, caddy (HTTPS), backup. No Redis or queue is needed at this size.
```

## Collections (key fields)
- **branches**: name, code, invoicePrefix, invoiceSeq, printerConfig{tagSize 40x25|50x25, conn}
- **users**: name, role ADMIN|OWNER|STAFF, branchIds[], passwordHash
- **categories / subcategories / products**: sku(unique), metal, purity, grossMg, makingPaise, images, branchStock[{branchId, qty}]
- **invoices**: branchId, number, customerId, lines[], totals (pricing.engine output), `exchangeDetail` (internal), `locked:true`, hash — never updated after finalize; corrections = credit note
- **exchanges**: invoiceId, items[], rate snapshot → feeds **rawInventory** (metal, purity, netMg)
- **rates**: metal, ratePerGramPaise, setBy, at (admin only, every change audited)
- **dairySchemes / dairyPayments / dairyLedger**: per dairy.engine; ledger debits link invoiceId
- **customers, suppliers, purchases, supplierPayments, transfers** (PENDING→APPROVED→RECEIVED)
- **auditLogs**: actor, action, entity, before, after, ip, at (append-only)

## Key rules
- Money = integer paise; weight = integer mg.
- Customer invoice DTO is built by `toCustomerInvoice` whitelist only; PDF renders solely from it.
- Invoice number via atomic `$inc` on branch counter inside a transaction with stock deduction.
- Offline: client queues sales with UUID; server dedupes by UUID; last-write-wins on masters with audit; invoice numbers are server-issued on sync (offline uses a provisional receipt no.).

## Assumptions (change if wrong)
1. GST 3% on metal + making, CGST/SGST split (Jharkhand).
2. Sale = net weight × grade rate (gold 22K/18K; silver single). Old metal = fine weight (net × purity%) × 22K gold exchange rate; customer copy shows amount (+ optional total fine weight) only.
3. Bonus scheme gifts 1 installment on full completion.

## Status
All twelve build phases are written (see `docs/AI_BUILD_SPEC.md` §18). **Nothing has been compiled or run yet** — the first `npm install && npm run build && npm test` is expected to turn up a handful of type errors and failing tests to fix.

## Where things live
| Backend module (`apps/api/src/modules`) | Web feature (`apps/web/src/features`) |
|---|---|
| auth, users, audit, branches | auth, staff, audit, branches |
| catalog, inventory, transfers | products (+ tags), stock, transfers |
| rates | rates |
| pos, exchange, numbering, print | pos, bills |
| customers, accounts, dairy | customers, dairy |
| suppliers (+ purchases) | suppliers |
| reports (+ head-office dashboard) | reports, home |
| sync | sync (+ `offline/` IndexedDB layer) |
| public | catalog |

Pure rules shared by server and browser live in `packages/shared` (pricing, permissions); a parity test keeps the two identical. See `docs/BUSINESS_RULES.md` for every decision the rules encode.

# Offline sync protocol (for the PWA / POS client)

**Goal:** the POS keeps selling with no internet; everything is sent to the server when the connection returns.

## What lives on the device (IndexedDB)
`products`, `categories`, `customers`, `rates`, `stock` (this branch), `dairy` (scheme balances), `outbox`, `meta` (per-collection `nextSince`).

## Pull (online, on login and every ~60 s)
`GET /api/v1/sync/pull/{products|categories|customers|stock|dairy|rates}?branchId=…&since=<nextSince>&limit=500`
→ `{ items, hasMore, nextSince, serverTime }`. Upsert every item by `_id`; store `nextSince`; if `hasMore`, call again immediately. Rows equal to `since` are re-sent on purpose (safe to upsert). `rates` returns one object `{ GOLD_24K|GOLD_22K|GOLD_18K|SILVER: { SALE|EXCHANGE|MARKET: { id, ratePerGramPaise, at } } }`. `stock` needs `branchId`.

## Selling offline
Price on the device from cached `products` + `rates` using the same rules as the server (net g × grade rate + making, 3% GST for a registered branch / none for an unregistered one, old metal = fine weight × 22K exchange rate, rupee round-off). Print a **provisional receipt** `OFF-<deviceId>-<n>` — it is not a tax invoice. Queue an operation:

```json
{ "clientUuid": "<uuid v4>", "type": "SALE",
  "payload": { "branchId": "…", "customerId": "…" | omitted, "customer": { "name": "…", "mobile": "…" } (new customer),
    "lines": [{ "productId": "…", "qty": 1 }], "exchanges": [...], "dairy": [{ "schemeId": "…", "amountPaise": 0, "confirmForfeitBonus": false }],
    "advancePaise": 0, "payments": [{ "mode": "UPI", "amountPaise": 0 }], "allowDue": false,
    "clientTotals": { "finalPayable": 7725000 }, "offlineAt": "<ISO time of the sale>", "provisionalNo": "OFF-D1-12", "remarks": "…" } }
```
Do **not** send `taxMode` (rejected): GST vs bill of supply follows the branch. Also queued: `{ "type": "DAIRY_PAYMENT", "payload": { "schemeId", "amountPaise", "mode", "ref" } }`.

## Push (online)
`POST /api/v1/sync/push { deviceId, ops: [ … up to 100 … ] }` → `{ results: [ { clientUuid, status, … } ], serverTime }`, in the same order. Send the outbox in creation order; replay is always safe (same `clientUuid` → same result, never a second sale).

| status | meaning | device action |
|---|---|---|
| `APPLIED` | done; `invoiceNumber` (official) / `receiptNo` returned, stock updated | replace the provisional number with `invoiceNumber`; remove from outbox |
| `NEEDS_REVIEW` | the server priced it differently (`error` says how) or could not finalize; a draft was kept | remove from outbox; show "sent for review"; owner/admin handles it in **Sync review** |
| `FAILED` | rejected (bad date, no permission, invalid payload, dairy not usable…) | keep in outbox, show `error`; fix and re-send with the **same** `clientUuid`, or give up |
| `PROCESSING` | another request is applying it | retry shortly |

Rules the server applies: priced with the rates **in force at `offlineAt`**; `offlineAt` must not be >5 min in the future or >30 days old; stock may go **negative** (invoice flagged `negativeStock`); customers are matched by mobile (an existing record is never overwritten).

## Conflicts
Masters (products, customers, rates…) are changed only on the server — **last write wins**, every change is in the audit log; devices never push master edits. Invoices, dairy payments and ledgers are append-only, so they never conflict.

## Review queue (owner/admin)
`GET /api/v1/sync/ops` (default: `NEEDS_REVIEW` + `FAILED`, scoped to the user's branches), `POST /api/v1/sync/ops/:id/resolve { note }` after fixing it (for a kept draft: edit/finalize it with the normal POS endpoints first).

## UI
Status pill: Online · Offline · Syncing n · Review n · Failed n (retry button). Show offline receipts clearly as provisional.

## What the web app queues today
Only `SALE` operations are queued from the screens (new customers are sent inline with the sale). The server also accepts `DAIRY_PAYMENT` and other operation types, but the web app does not create them yet, so dairy instalments, advances and account receipts need a connection. A device must have opened the app online at least once so its local copy (products, customers, rates, stock, dairy balances) exists. Provisional receipt numbers look like `OFF-<device>-<n>` and are never tax invoices; the official number is issued when the sale is accepted.


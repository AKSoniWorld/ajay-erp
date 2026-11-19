# Ajay Jewellers — Multi-branch Jewellery ERP + POS

Billing, stock, old-metal exchange, dairy savings, customer and supplier accounts, branch transfers, reports and a public catalog for Ajay Jewellers (Ranchi) — one system for every branch, working offline at the counter.

> **Status.** The backend (NestJS + MongoDB, 12 phases) and the web app (React + Vite + Tailwind PWA) are fully written. **None of it has been compiled or run yet** — it was written without network access. Start with the first-run steps below and fix what the compiler and tests report.

## Documentation
| Read this | For |
|---|---|
| `docs/USER_GUIDE.md` | Day-to-day use, in plain language, by role |
| `docs/BUSINESS_RULES.md` | Every business decision the system encodes (pricing, GST, old metal, dairy, accounts, cash limit…) |
| `docs/TEST_CHECKLIST.md` | A hand-run test of the whole shop after install (about an hour) |
| `docs/DEPLOYMENT.md` | Putting it on a server, backups, upgrades, hardware |
| `docs/ARCHITECTURE.md`, `docs/AI_BUILD_SPEC.md` | How it is built, data model, API, phases |
| `docs/SYNC_PROTOCOL.md` | How offline bills reach the server |
| `apps/api/README.md`, `apps/web/README.md` | Per-app notes |

## First run (development)
```bash
cp .env.example apps/api/.env              # then edit the secrets
docker compose -f docker-compose.dev.yml up -d     # MongoDB replica set
npm install
npm run build                              # first compile: expect some type errors to fix
npm test                                   # unit + end-to-end tests (in-memory MongoDB)
SEED_DEMO=true npm run seed                # demo branches, products, rates (never in production)
npm run dev:api                            # http://localhost:3000/api/v1   ·   /health
npm run dev:web                            # http://localhost:5173
```
Then walk through `docs/TEST_CHECKLIST.md`. A lockfile is not included; `npm install` creates it — commit it before building Docker images.

## What it does
- **Billing**: GST tax invoice or bill of supply (decided by the branch), QR-tag scanning, making charge per gram / flat / %, round-off, split payments, credit notes, sealed bills, A4 PDF.
- **Old gold and silver**: fine-weight exchange at the admin-set rate; customer papers show only the amount (and optionally total fine weight).
- **Dairy savings**: 6/11/12-month schemes, instalments with receipts, bonus rules, use on bills.
- **Customers**: separate advance, due, dairy, purchase and exchange accounts with statements.
- **Stock**: ledger-based stock by branch, counts, QR tags (40×25 / 50×25 mm), transfers with approval, dispatch and receipt.
- **Suppliers**: cash and fine gold/silver balances, purchases settled in metal, rate-cut conversions.
- **Reports**: sales, branch comparison, old metal, dairy, stock movement, ledgers — screen, CSV, PDF — and a head-office overview.
- **Offline**: keeps selling with no internet; bills sync later with official numbers and a review queue for mismatches.
- **Public catalog**: `/catalog` — no prices, WhatsApp enquiry buttons.
- **Safety**: roles and branch scoping, append-only audit trail, argon2, refresh-token rotation, the ₹2 lakh daily cash limit check.

## Layout
`apps/api` (server) · `apps/web` (app) · `packages/shared` (pricing and permissions used by both) · `docker/` and `docker-compose.*.yml` · `docs/`

# Deployment guide — Ajay Jewellers ERP

Runs on one small Linux server with Docker: **MongoDB (replica set) + API + (web app) + Caddy (automatic HTTPS) + daily backups**.

> The Docker files in this repo were written without being built on a machine with Docker/internet. Do the first deployment on a test server (or a staging domain) and fix any small build issue before going live.

## 1. What you need
- A VPS: 2 vCPU, 4 GB RAM, 40 GB disk, Ubuntu 22.04/24.04 (any Indian region, e.g. Mumbai).
- A domain/subdomain (e.g. `erp.yourshop.in`) with an **A record** pointing to the server's IP.
- Ports **80 and 443** open. Nothing else needs to be public.

## 2. One-time setup
```bash
# on the server
curl -fsSL https://get.docker.com | sh
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
git clone <your repo> ajay-erp && cd ajay-erp      # or upload the folder
npm install --package-lock-only                    # once, on any machine, to create package-lock.json; commit it
cp .env.prod.example .env && nano .env             # fill DOMAIN, ACME_EMAIL, JWT_ACCESS_SECRET, ADMIN_MOBILE, ADMIN_PASSWORD
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps       # mongo, api, caddy, backup should be "running/healthy"
curl https://erp.yourshop.in/health                # {"status":"ok","db":"up",…}
```
Generate the secret with `openssl rand -base64 48`. The first admin is created from `ADMIN_MOBILE` / `ADMIN_PASSWORD` when the users collection is empty.
When the web app exists: `docker compose -f docker-compose.prod.yml --profile web up -d --build`.

## 3. First-day checklist (in the app / API)
1. Log in as the admin and **change the admin password** (`PATCH /users/:id`).
2. **Branches**: set name, address, **state** and **GSTIN**; mark an unregistered branch `gstRegistered: false` (it then issues bills of supply, no GST). Set printer tag size / language and the branch WhatsApp number.
3. **Rates** (admin): SALE rates for GOLD 24K/22K/18K and SILVER; EXCHANGE rate for GOLD 22K and SILVER (old metal); **MARKET** rate for GOLD 24K and SILVER (supplier settlements). Update them daily.
4. **Users**: owners (assigned to branches) and sales staff.
5. **Catalog**: categories (already seeded), products, opening stock per branch. Print tags and test-print on each branch's printer (`POST /print/tags/test`).
6. Customer WhatsApp number for the public catalog: `PUBLIC_WHATSAPP_DEFAULT` in `.env`.
Demo data (never in production): `SEED_DEMO=true docker compose -f docker-compose.prod.yml exec api node dist/seed.js`.

## 4. Backups and restore
- The `backup` service writes `backups/ajay-<date>.gz` (database) and `backups/uploads-<date>.tgz` (product photos) **every 24 h** and keeps `BACKUP_KEEP_DAYS` (14) days.
- **Copy them off the server** every day (a backup on the same disk is not a backup): `rclone`/`rsync` to Google Drive, S3 or another machine.
- Restore the database:
  ```bash
  docker compose -f docker-compose.prod.yml exec -T mongo mongorestore --archive --gzip --drop < backups/ajay-2026-10-30-0300.gz
  tar xzf backups/uploads-2026-10-30-0300.tgz -C /var/lib/docker/volumes/ajay-erp_uploads/_data   # photos
  docker compose -f docker-compose.prod.yml restart api
  ```
- **Test a restore on a spare machine every month.**

## 5. Upgrading and rolling back
```bash
git pull
docker compose -f docker-compose.prod.yml exec backup sh -c 'mongodump --uri="mongodb://mongo:27017/ajay?replicaSet=rs0" --archive=/backups/pre-upgrade.gz --gzip'
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f api      # watch for errors
```
Rollback: `git checkout <previous tag>` and run the `up -d --build` again; if data was damaged, restore the pre-upgrade dump. Schema changes so far are additive, so no migration step is needed.

## 6. Security checklist
- Only 22/80/443 open; MongoDB is **not** published. SSH with keys only; disable password login.
- **MongoDB authentication** is not enabled in this compose file (the database is reachable only inside the Docker network). To add it: create a keyfile (`openssl rand -base64 756 > mongo-keyfile; chmod 400`), mount it, add `--keyFile` and `MONGO_INITDB_ROOT_USERNAME/PASSWORD`, and put the credentials in `MONGO_URI`. Recommended before storing real customer data.
- Rotate `JWT_ACCESS_SECRET` if it ever leaks (everyone is logged out). Use strong, unique passwords; owners and admins are the keys to the shop.
- Keep the server updated (`unattended-upgrades`) and rebuild images monthly (`docker compose pull && up -d --build`).
- Customer mobile numbers and purchase history are personal data: restrict who gets an account, and keep backups private/encrypted.

## 7. Monitoring
- Add `https://erp.yourshop.in/health` to an uptime monitor (UptimeRobot etc.).
- `docker compose -f docker-compose.prod.yml logs -f api` ; `docker stats` ; `df -h` (watch the disk — photos and backups grow).

## 8. Troubleshooting
| Symptom | Likely cause / fix |
|---|---|
| API restarts, "not master / transactions" errors | MongoDB replica set not initiated — `docker compose … logs mongo`; wait for the healthcheck or run `rs.initiate` in `mongosh`. |
| PDFs show "Rs." instead of ₹ | Noto Sans missing — the Docker image installs it; outside Docker set `PDF_FONT_DIR`. |
| HTTPS certificate not issued | DNS A record wrong, or ports 80/443 blocked; check `docker compose … logs caddy`. |
| Dates/numbers off around midnight | The server runs in IST (`TZ=Asia/Kolkata`); financial-year numbering also uses IST. |
| Camera QR scan does not start | The page must be opened over HTTPS (Caddy does this) or localhost, and the browser's camera permission must be allowed. A handheld QR scanner works without the camera — it types the code like a keyboard. |
| Tag printing misaligned | Run `POST /print/tags/test`, switch the branch printer language (ESC/POS ↔ TSPL) and tag size. |

## 9. The app, the catalog and HTTPS
- The installable/offline app (service worker), the camera QR scanner and direct USB tag printing **only work over HTTPS** (or on `localhost`). The Caddy setup in `docker-compose.prod.yml` provides this; do not serve the app over plain HTTP.
- The public catalog is at `https://<your-domain>/catalog` (and `/catalog/<SKU>` for one piece). It needs no sign-in, shows no prices or quantities, and is rate-limited. Put the link on the shop's WhatsApp profile and social pages.
- After each upgrade, staff devices pick up the new app automatically the next time they open it online (the service worker updates quietly). If a device seems stuck on an old screen, close and reopen the app once while online.
- Every till device must open the app **once online** before it can be used offline (that is when it downloads the catalog and rates).

## 10. Hardware
- **QR scanning**: a USB/Bluetooth handheld scanner that types the code and presses Enter works as is (the New bill search box accepts `AJ:<SKU>`); phones and tablets can use the camera scanner in the app.
- **Tag printers**: 40×25 or 50×25 mm gap-sensor label printers. Set the size, language (ESC/POS or TSPL) and connection on the Branches screen. Try **Browser print** first; use **Direct USB** only on Chrome/Edge. Calibrate the label gap on the printer, then print a test tag.
- **Receipts and bills**: PDFs print from the browser on **A4 or A5** (A5 = half of A4; defaults set per branch, switchable per print). In the print dialog choose the matching paper and set scale to 100% ("actual size"), not "fit to page". Thermal bill printing is not set up.
- **Clock**: keep server and tills on the correct time (IST); bills, rate history and the daily cash limit use it.

## 11. First week
Run `docs/TEST_CHECKLIST.md` on the real server before the first customer bill. Keep the old billing method alongside for the first days. Check **Sync → Needs review** and the Admin overview every evening. Test a backup restore once (§4) before relying on backups.


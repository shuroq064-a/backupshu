# ShuroqX — GCP Deployment Runbook (for AI agents)

Use this guide to take ShuroqX changes from a local working tree all the way to the production
GCP VM. It covers the full flow: **commit & push to GitHub** (Section 3), then **deploy/redeploy**
the running Docker Compose stack on the VM (Section 4).

---

## 1. Architecture (read this first)

- **GCP project:** `shuroqrdx`  •  **Auth:** `shuroqx1@gmail.com` (active)
- **Compute VM:** `shuroqx-vm`, zone `asia-south1-b`, e2-medium, external IP `34.93.44.173`
- **Not Cloud Run / not a git clone.** The app runs as a **Docker Compose** stack on the VM.
- **Compose dir:** `/home/Akshay/shuroqx/`  (contains `docker-compose.yml`, `.env`, `Caddyfile`,
  and the `backend/` + `frontend/` source build contexts).
- **Services:** `postgres`, `redis`, `backend`, `worker`, `frontend`, `caddy`.
- **Caddy reverse proxy:**
  - `34-93-44-173.sslip.io`         → `frontend:3000`
  - `api.34-93-44-173.sslip.io`     → `backend:8000`
- `worker` uses the **same image** as `backend` (`build: ./backend`), run as a Celery worker.
- The VM **cannot** `git clone` the private GitHub repo (no creds), so we ship code via
  **tarball + `gcloud compute scp`**, not git pull.

### Public URLs
- App:        https://34-93-44-173.sslip.io/
- API:        https://api.34-93-44-173.sslip.io/

---

## 2. Prerequisites (local machine)

- `gcloud` CLI installed and authenticated: `gcloud config get-value account` → `shuroqx1@gmail.com`
- Working dir is the repo root (`shuroqx-Redesign/`).
- **Do NOT commit:** `.opencode/`, `backend/uvicorn_restart.err`, `node_modules`, `.next`, `venv`,
  `__pycache__`, `*.pyc`, and any `.env*` (they hold secrets / local dev config).
- The commit → push → deploy order is: **Section 3 (commit & push) → Section 4 (deploy).**

---

## 3. Commit & push to GitHub

Get your changes into the `redesign` branch on GitHub **before** deploying.

### 3.1 Stage the source changes (exclude secrets & local artifacts)
Only commit source. Never commit `.opencode/`, `backend/uvicorn_restart.err`, `node_modules`,
`.next`, `venv`, `__pycache__`, `*.pyc`, or any `.env*`.

**Stage the files you actually changed** (use `git status` to see them). Example — the original
ETA + streaming + start.sh work touched these:

```powershell
git status --short
git add backend/agents/prompts.py backend/agents/supervisor.py backend/agents/tools.py `
  backend/models.py backend/routers/assistant.py backend/routers/bookings.py `
  backend/routers/marketplace.py backend/services/eta_service.py backend/start.sh `
  frontend/app/dashboard/client/chat/page.tsx frontend/app/dashboard/client/page.tsx `
  frontend/lib/api.ts frontend/lib/config.ts frontend/types/index.ts
git status --short   # confirm only intended files are staged; .opencode/ etc. must stay untracked
```

### 3.2 Commit
```powershell
git commit -q -m "Describe the change here"
```
> Use a clear, imperative subject line.

### 3.3 Push
If the branch already tracks `origin/redesign`:
```powershell
git push origin redesign
```
If this is the **first push** of the branch (no remote tracking yet):
```powershell
git push -u origin redesign
```

> PowerShell note: `git add … && git commit` fails (no `&&` in PS 5.1). Run as separate commands
> or chain with `;`.

### 3.4 Confirm
```powershell
git log --oneline -3
```

Then continue to **Section 4** to deploy.

---

## 4. Redeploy procedure

### Step A — Build tarballs locally (exclude heavy/secret dirs)

```powershell
$tdir = "C:\Users\Akshay\AppData\Local\Temp\opencode"
tar czf "$tdir\backend.tgz"  --exclude=venv --exclude=.git --exclude=.env `
    --exclude=__pycache__ --exclude=*.pyc --exclude=*.log --exclude=.opencode -C backend .
tar czf "$tdir\frontend.tgz" --exclude=node_modules --exclude=.next --exclude=.git `
    --exclude='.env*' --exclude=__pycache__ --exclude=.opencode -C frontend .
```
> `frontend.tgz` is ~16 MB (source only). `backend.tgz` is ~0.5 MB.

### Step B — Copy tarballs to the VM

```powershell
gcloud compute scp "$tdir\backend.tgz" "$tdir\frontend.tgz" shuroqx-vm:/tmp --zone asia-south1-b
```

### Step C — Back up current source, then extract (overwrites only repo files)

```powershell
gcloud compute ssh shuroqx-vm --zone asia-south1-b --command `
  "rm -rf /home/Akshay/shuroqx/backend.bak2 /home/Akshay/shuroqx/frontend.bak2 ; `
   cp -r /home/Akshay/shuroqx/backend /home/Akshay/shuroqx/backend.bak2 ; `
   cp -r /home/Akshay/shuroqx/frontend /home/Akshay/shuroqx/frontend.bak2 ; `
   tar xzf /tmp/backend.tgz -C /home/Akshay/shuroqx/backend ; `
   tar xzf /tmp/frontend.tgz -C /home/Akshay/shuroqx/frontend ; `
   rm -f /tmp/backend.tgz /tmp/frontend.tgz"
```
> We do **not** use `rsync --delete`; existing `.env`, generated files, and stray files are kept.
> The extract only adds/overwrites repo-tracked files. `backend/.env` / `frontend/.env*` are
> excluded from the tarball, so the VM's config is preserved.

### Step D — Rebuild images

```powershell
gcloud compute ssh shuroqx-vm --zone asia-south1-b --command `
  "cd /home/Akshay/shuroqx && docker compose build backend frontend 2>&1 | tail -25"
```
> Frontend build (Next.js) is the slow/memory-heavy step on e2-medium — allow several minutes.
> The frontend Dockerfile pulls `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` from the top-level
> `.env` as build args; those are already set on the VM, so no action needed.

### Step E — Recreate containers

```powershell
gcloud compute ssh shuroqx-vm --zone asia-south1-b --command `
  "cd /home/Akshay/shuroqx && docker compose up -d backend frontend ; `
   docker compose up -d --force-recreate worker"
```
> `worker` shares the backend image, so it needs `--force-recreate` to pick up the new image.

---

## 5. Verify

From the **local** machine (domains are public):

```powershell
curl.exe -s https://api.34-93-44-173.sslip.io/        # -> {"message":"ShuroqX backend running successfully"}
curl.exe -s -o $null -w '%{http_code}' https://34-93-44-173.sslip.io/   # -> 200
```

From the **VM** (confirm container health + clean startup):

```powershell
gcloud compute ssh shuroqx-vm --zone asia-south1-b --command `
  "docker ps --format 'table({{.Names}}\t{{.Status}})' ; `
   docker logs --tail 15 shuroqx-backend-1"
```
> Look for `INFO:     Application startup complete.` in the backend logs.

Functional check (needs a logged-in browser session): open the deployed app, ask the AI assistant
for a nearby specialist and confirm (a) per-specialist ETAs are shown and (b) the reply streams
token-by-token.

---

## 6. Gotchas (learned the hard way)

### 6.1 Alembic / `start.sh` — backend won't boot without this fix
- The prod Postgres `alembic_version` table is stuck at revision **`add_booking_otps_table`**,
  which the `redesign` branch no longer ships (file is now `add_booking_otp.py`).
- `alembic upgrade head` therefore **fails** (`Can't locate revision ... add_booking_otps_table`).
- `backend/start.sh` runs `alembic upgrade head` then `exec uvicorn ...`. If start.sh has
  `set -e`, the alembic failure **aborts before uvicorn starts** → backend down (HTTP 000 on :8000).
- **Fix (already in repo):** `start.sh` uses `set -u` (not `set -e`) and runs
  `alembic upgrade head || echo "..."` so uvicorn always starts. The schema is already migrated
  and our changes add no DB columns, so skipping the failed upgrade is safe.
- **If you ever revert `start.sh` to `set -e`, the backend will not start.** Keep it tolerant.
- **Future migrations:** because `alembic upgrade head` can't resolve the DB's stuck
  `add_booking_otps_table` version, the tolerant `start.sh` will **not** auto-apply new migrations.
  If your change adds/alters DB tables, reconcile `alembic_version` first (or run the needed
  `alembic upgrade` step manually against the DB) — don't assume `start.sh` will migrate for you.

### 6.2 Don't overwrite `.env`
The top-level `/home/Akshay/shuroqx/.env` holds all secrets and the prod
`NEXT_PUBLIC_API_URL=https://api.34-93-44-173.sslip.io` / `NEXT_PUBLIC_WS_URL=wss://...`.
The tarball excludes `.env*`, so extraction never touches it. The frontend's local `.env.local`
(`NEXT_PUBLIC_API_URL=/api/backend`) is **dev-only** and must never reach the prod build.

### 6.3 PowerShell quirks (local shell is Windows PowerShell 5.1)
- **No `&&`** — use `;` to chain commands, or run them as separate tool calls.
- **`curl` is an alias for `Invoke-WebRequest`** — use `curl.exe` for real curl.
- **`gcloud compute ssh` positional remote commands break** when they contain `&&` or piped stdin;
  always pass the remote command as a single quoted string after `--command "..."` and separate
  steps with `;`.
- **Don't pipe `tar` into `gcloud compute ssh`** — the gcloud.ps1 wrapper mishandles piped stdin +
  remote command. Use `gcloud compute scp` of a tarball instead.
- `git add a && git commit` fails for the same `&&` reason — use separate commands.

### 6.4 Streaming in prod
The frontend sets `STREAM_BASE_URL`: if `NEXT_PUBLIC_API_URL` contains `/api/backend` it points to
`http://localhost:8001` (dev bypass of the Next proxy); in prod it equals the real backend domain,
so the SSE stream hits `api.34-93-44-173.sslip.io` directly. CORS on the backend already allows the
frontend origin, so streaming works cross-origin in prod.

---

## 7. Rollback
The compose stack doesn't auto-keep old images. To roll back:
```powershell
gcloud compute ssh shuroqx-vm --zone asia-south1-b --command `
  "cd /home/Akshay/shuroqx && `
   cp -r backend.bak2 backend && cp -r frontend.bak2 frontend && `
   docker compose build backend frontend && `
   docker compose up -d backend frontend && docker compose up -d --force-recreate worker"
```

---

## 8. Quick reference

| What | Command |
|------|---------|
| Stage + commit | `git add <files> ; git commit -q -m "..."` |
| Push (tracking exists) | `git push origin redesign` |
| First push (no tracking) | `git push -u origin redesign` |
| List VM services | `gcloud compute ssh shuroqx-vm --zone asia-south1-b --command "docker ps"` |
| Backend logs | `gcloud compute ssh shuroqx-vm --zone asia-south1-b --command "docker logs --tail 30 shuroqx-backend-1"` |
| Rebuild only backend | `... --command "cd /home/Akshay/shuroqx && docker compose build backend"` |
| Recreate only worker | `... --command "cd /home/Akshay/shuroqx && docker compose up -d --force-recreate worker"` |
| App health | `curl.exe -s https://api.34-93-44-173.sslip.io/` |

# ShuroqX — GCP Database Connection Guide

## Overview

We use **Google Cloud SQL** as our database. The app does **not** connect to it directly. Instead, we go through a **Cloud SQL Auth Proxy**. This is more secure and avoids exposing the database to the public internet.

---

## Database Details

- **GCP Project:** `shuroq-erp`
- **Cloud SQL Instance:** `shuroqx-db`
- **Database Name:** `shuroqx_rdxdb`
- **Database User:** `shuroqx`
- **Database Password:** `5kE2BpocLGqsbmF1lxSg`
- **Cloud SQL IP:** `8.234.104.47`

---

## What is the Cloud SQL Auth Proxy?

The **Cloud SQL Auth Proxy** is a small tool made by Google. It sits between your app and the database. Instead of connecting directly to the database IP, your app connects to `127.0.0.1:5433` on your own computer, and the proxy securely forwards traffic to Cloud SQL.

### Why use a proxy?

- **Security:** The database never needs to be exposed to the internet.
- **IAM-based auth:** Google handles authentication through your account, not a raw password over the network.
- **No IP whitelist for local dev:** Because the proxy uses IAM tokens, your local IP doesn’t need to be whitelisted in Cloud SQL.

---

## Local Development Connection

### 1. Prerequisites

- **Google Cloud SDK** installed (`gcloud`)
- Logged in with: `gcloud auth application-default login`

### 2. Start the Proxy

In the project root, run:

```powershell
.\start-dev.ps1
```

This script does the following:
1. Checks if `cloud-sql-proxy.exe` exists in the project root; downloads it if missing.
2. Verifies `gcloud` authentication.
3. Starts the proxy on **port 5433** pointing to `shuroq-erp:asia-south1:shuroqx-db`.
4. Updates `backend/.env` to connect via `127.0.0.1:5433`.
5. Starts the **backend** server on port `8001`.
6. Starts the **frontend** server on port `3000`.

### 3. What happens under the hood

Your local backend connects like this:

```
postgresql://shuroqx:<password>@127.0.0.1:5433/shuroqx_rdxdb?sslmode=disable
```

- `127.0.0.1:5433` = the proxy running on your machine
- `shuroqx_rdxdb` = the actual database on Cloud SQL
- `sslmode=disable` = SSL is off because the proxy already encrypts the connection

The proxy uses your Google credentials to authenticate with Cloud SQL. No database password is sent over the network.

---

## Production Connection (GCP VM)

### VM Details

- **VM Name:** `shuroqx-vm`
- **Zone:** `asia-south1-b`
- **External IP:** `34.93.44.173`
- **SSH:** `gcloud compute ssh shuroqx-vm --zone asia-south1-b`

### How production connects

The production backend runs inside **Docker** on the VM. It connects **directly** to Cloud SQL over the public IP:

```
postgresql://shuroqx:<password>@8.234.104.47/shuroqx_rdxdb?sslmode=require
```

Because this is a direct connection:
- The VM IP (`34.93.44.173/32`) **must be whitelisted** in Cloud SQL authorized networks.
- SSL is **required** (`sslmode=require`) for direct public connections.

### Authorized Networks on Cloud SQL

```
34.93.44.173/32   ← GCP VM (production)
103.160.27.234/32 ← Your local IP (direct fallback if needed)
```

Only these IPs can directly reach the database on port 5432.

---

## Two Paths, One Database

| Environment | Connection Method | Address | SSL | IP Whitelist Required |
|-------------|-------------------|---------|-----|----------------------|
| **Local dev** | Cloud SQL Auth Proxy | `127.0.0.1:5433` | No (proxy handles it) | No |
| **Production VM** | Direct TCP | `8.234.104.47:5432` | Yes (`require`) | Yes |

Both environments read and write to the **same database**: `shuroqx_rdxdb`.

---

## Common Issues

### "Database unreachable" from local machine

- Make sure `cloud-sql-proxy.exe` is running.
- Make sure you ran `gcloud auth application-default login`.
- Check that `backend/.env` points to `127.0.0.1:5433`, not some other port.

### "Database unreachable" from production

- Make sure the VM IP is in Cloud SQL authorized networks.
- Make sure the VM’s `docker-compose.yml` has the correct `DATABASE_URL`.

### Password mismatch / "Invalid email or password"

- This is usually **not** a connection issue. It means the user exists in the database but the password is wrong.
- The app uses **bcrypt** password hashing. You cannot "see" passwords — only reset them.

---

## Summary

- **Proxy** = secure tunnel from your laptop to GCP, no IP whitelist needed.
- **Direct** = VM connects straight to Cloud SQL, VM IP must be whitelisted.
- **Database** = `shuroqx_rdxdb` on Cloud SQL instance `shuroqx-db`.
- **Local start command:** `.\start-dev.ps1`
- **Local frontend:** http://localhost:3000
- **Local backend:** http://localhost:8001
- **Production app:** https://34-93-44-173.sslip.io/
- **Production API:** https://api.34-93-44-173.sslip.io/

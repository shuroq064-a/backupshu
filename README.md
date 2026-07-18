# ShuroqX — AI-Powered Service Marketplace

> An end-to-end marketplace platform that uses natural-language intent to match customers with verified home-service specialists, predicts job duration, tracks live worker location, and handles the full booking lifecycle.

---

## What is ShuroqX?

ShuroqX is a two-sided service marketplace. A customer describes what they need in plain English ("my kitchen sink is leaking"), the platform classifies the intent, suggests the right specialist category, ranks nearby workers by skill match + rating + predicted ETA, and lets the customer book, track, and review the job — all in one flow.

Workers (called *Specialists*) register, list their skills/services, get admin-approved, and receive job requests. They can update availability, view their earnings, and accept/reject incoming bookings. Admins review specialist applications, approve new service categories, and monitor platform stats.

### Key features

- **Natural-language query processing** — POST `/user-query` accepts free text, classifies the service intent using a trained classifier (TF-IDF + scikit-learn), and returns matched specialists.
- **Marketplace search** — POST `/search` returns ranked specialists based on query intent + worker services + reviews.
- **ETA prediction** — trained regression model (`backend/models/eta_model.pkl`) estimates job duration based on service type and context features.
- **Booking lifecycle** — create → status updates (pending / accepted / in_progress / completed / cancelled) → review. Full WebSocket channel for live updates (`/ws/bookings/{id}`).
- **Real-time tracking** — workers share location during active bookings; route monitor service tracks them on a map.
- **Dual-role accounts** — any user can switch between *customer* and *specialist* via `/switch-to-specialist` without re-registering.
- **Admin dashboard** — specialist approval queue, skill submission approvals, platform stats, user list.
- **JWT auth** — register/login returns access tokens; `/users/me` for profile, password change, account deletion.

---

## Tech stack

**Backend** — Python 3.13, FastAPI, SQLAlchemy, PostgreSQL, Alembic, Celery + Redis, scikit-learn, PyJWT, bcrypt.

**Frontend** — Next.js 15.3.8 (App Router), React 19, TypeScript, Redux Toolkit, NextAuth, Tailwind CSS 4.

**ML** — Service intent classifier + ETA regressor (joblib pickles in `backend/models/`). Training data and scripts in `backend/datasets/` and `backend/train_*.py`.

---

## Project layout

```
AI-Powered-Service-Marketplace/
├── backend/
│   ├── main.py                  # FastAPI entry point, mounts all routers
│   ├── dbmodels.py              # SQLAlchemy models (User, Worker, Booking, ...)
│   ├── auth_utils.py            # JWT + bcrypt helpers
│   ├── routers/
│   │   ├── unified_auth.py      # /users/register, /login, /oauth-login, /switch-to-specialist
│   │   ├── users.py             # /users/me, change-password, delete
│   │   ├── workers.py           # /workers/*  (CRUD, services, availability, bookings, earnings)
│   │   ├── bookings.py          # /bookings/* + WebSocket live channel
│   │   ├── marketplace.py       # /search  (NL → ranked specialists)
│   │   ├── userinput.py         # /user-query  (NL → intent classification)
│   │   ├── intent.py            # /intent (intent-based specialist lookup)
│   │   ├── services.py          # /services  (service catalog)
│   │   └── admin.py             # /admin/* (approvals, stats, users)
│   ├── services/                # Domain logic — NLP, worker matching, ETA, route monitor
│   ├── tasks/                   # Celery background tasks
│   ├── models/                  # Trained .pkl artifacts + metadata
│   ├── datasets/                # Training data (per-service .txt + eta_training_data.csv)
│   ├── alembic/                 # DB migrations
│   ├── testing/                 # Endpoint smoke tests
│   └── requirements.txt
│
├── frontend/
│   ├── app/                     # Next.js App Router pages
│   ├── components/              # UI components
│   ├── hooks/                   # useAuth, useMode, useAdmin, useProfileGuard
│   ├── store/                   # Redux store
│   ├── lib/                     # api client, auth helpers
│   ├── types/                   # Shared TS types
│   ├── public/                  # Static assets
│   ├── next.config.ts           # /api/backend rewrite → localhost:8001
│   └── package.json
│
└── README.md                    # ← you are here
```

---

## Quick start

### Prerequisites

- Python 3.13+
- Node.js 20+
- PostgreSQL (or use the included `.env` to point at your instance)
- Redis (for Celery)

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# configure environment
cp .env.example .env   # then edit DB/Redis URLs, JWT secret

# run migrations
alembic upgrade head

# (optional) seed sample services
python seed_services.py

# start API
uvicorn main:app --host 0.0.0.0 --port 8001
```

API is now at `http://localhost:8001` — Swagger docs at `/docs`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend is now at `http://localhost:3000`.

The Next.js rewrite in `frontend/next.config.ts` proxies `/api/backend/*` → `http://localhost:8001/*`, so the browser can call `/api/backend/users/register` and the request hits the FastAPI server transparently.

---

## Important ports

| Service  | Port | Notes |
|----------|------|-------|
| Frontend | 3000 | Next.js dev server |
| Backend  | 8001 | FastAPI / uvicorn |

> **Note:** Port 8000 on the dev VM is occupied by a separate, unrelated `AIReadySchool` uvicorn. Do **not** kill it. If you change the backend port, update both `frontend/next.config.ts` (rewrite destination) and any absolute URLs in your code.

---

## Auth model

| Endpoint | Auth required |
|----------|--------------|
| `POST /users/register` | no |
| `POST /users/login` | no |
| `POST /users/oauth-login` | no |
| `GET  /users/me` | yes (Bearer) |
| `POST /bookings` | yes (Bearer) |
| `/admin/*` | yes (Bearer, admin role) |

Both `/users/register` and `/users/login` return `{ access_token, token_type: "bearer", user }`. Send the token as `Authorization: Bearer <token>` on subsequent requests.

---

## ML pipeline

Two trained artifacts in `backend/models/`:

1. **Service intent classifier** — TF-IDF vectorizer + classifier. Trained on per-service `.txt` corpora in `backend/datasets/`. Used by `/user-query` and `/search` to figure out *what* the customer wants.
2. **ETA regressor** — predicts job duration. Features engineered by `backend/services/feature_engineering.py`. Used during booking flow.

To retrain:

```bash
cd backend
python train_model.py        # intent classifier
python train_eta_model.py    # ETA regressor
```

---

## Development tips

- **Hot reload** — both servers support it. uvicorn watches the backend tree, Next.js watches `frontend/`.
- **Logs** — start the backend with `uvicorn main:app --port 8001 2>&1 | tee /tmp/shuroqx-backend.log` and the frontend with `npm run dev 2>&1 | tee /tmp/shuroqx-frontend.log` so logs survive process disconnects.
- **Next.js dev hangs** — after long uptime Next dev can balloon to ~1.3 GB RSS and stall. SIGKILL all `next-server` / `next dev` / `npm exec next` and restart with `tee /tmp/log`. This is a known Next.js 15 dev-server issue, not a ShuroqX bug.
- **Hydration warnings on `bis_skin_checked`** — these come from the browser extension on the user's machine mutating the DOM before React hydrates. Test in an incognito window to confirm it's not an app issue.

---

## API surface (quick reference)

```
POST   /users/register
POST   /users/login
POST   /users/oauth-login
POST   /users/switch-to-specialist
GET    /users/me
PUT    /users/me
POST   /users/change-password
DELETE /users/me

POST   /workers
GET    /workers
GET    /workers/{id}
GET    /workers/by-user/{user_id}
POST   /workers/{id}/services
PATCH  /workers/{id}/availability
GET    /workers/{id}/bookings
GET    /workers/{id}/reviews
GET    /workers/{id}/active-booking
GET    /workers/{id}/earnings

POST   /bookings
PATCH  /bookings/{id}/status
POST   /bookings/{id}/review
WS     /ws/bookings/{id}
GET    /bookings/{id}
GET    /users/{user_id}/bookings
GET    /workers/{worker_id}/requests

POST   /user-query                    # NL → intent + matched workers
POST   /search                        # NL → ranked marketplace specialists
GET    /intent                        # intent-based lookup
GET    /services                      # service catalog

GET    /admin/specialists
GET    /admin/specialists/{id}
PATCH  /admin/specialists/{id}/approve
PATCH  /admin/specialists/{id}/reject
GET    /admin/pending-skills
PATCH  /admin/skills/{worker_id}/{service_id}/approve
PATCH  /admin/skills/{worker_id}/{service_id}/reject
GET    /admin/stats
GET    /admin/users
```

Full OpenAPI schema at `http://localhost:8001/docs` when the backend is running.

---

## License

Internal project — see owner for licensing terms.
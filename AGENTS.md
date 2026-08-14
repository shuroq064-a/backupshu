# AGENTS.md

ShuroqX — AI-powered home-service marketplace. Two apps: `backend/` (FastAPI) and `frontend/` (Next.js 15). Full end-to-end reference: read `PROJECT CONTEXT FILE.md` before touching shared flows.

## Commands

Backend (run from `backend/`, venv already at `backend/venv`):
- API: `venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8001`
- Migrations: `venv\Scripts\python.exe -m alembic upgrade head` (new schema change = new file in `alembic/versions/`, down_revision = current head)
- Seed catalog: `venv\Scripts\python.exe seed_services.py`
- Smoke tests: `venv\Scripts\python.exe testing\run_test.py`

Frontend (run from `frontend/`):
- Dev: `npm run dev` (port 3000, proxies `/api/backend/*` → `localhost:8001` via `next.config.ts`)
- Verify: `npm run type-check` then `npm run lint` (scripts are `tsc --noEmit` / `next lint`)

## Gotchas

- Backend MUST run on port **8001**. Port 8000 is taken by an unrelated app on the dev machine — never use it.
- API docs (`/docs`) only exist when `ENVIRONMENT=development` in `backend/.env`.
- `main.py` runs `Base.metadata.create_all()` + an ad-hoc `ALTER TABLE users ... token_version` at startup. New columns on existing tables still need an Alembic migration.
- Booking acceptance is race-safe via atomic conditional UPDATE (`worker_id IS NULL AND status='upcoming'`); 409 on double-assign. Don't "simplify" it.
- Specialist availability is gated on admin verification; skills are approved per-skill (max 5, one pending at a time).
- Backend routers MUST stay 1:1 with frontend clients in `frontend/lib/api.ts` — route changes require editing both.
- Session lives in `localStorage("shuroqx_session")` + a `shuroqx_session` cookie; `middleware.ts` reads only the cookie (`{token, user:{role}}`). API client clears session + redirects on 401.
- Rows are UUID strings; deletes cascade from `User` (DB + SQLAlchemy).
- `frontend/package.json` has an `agentation` devDependency — flagged as a possible typosquat in project docs; do not add dependencies without checking.
- Style: Material-3 token classes (`bg-surface`, `text-on-surface`, `text-primary`, `border-outline-variant`), framer-motion animations, Lucide icons.

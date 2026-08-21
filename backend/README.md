# Sieger SIP — Backend (FastAPI)

REST API over `salesforce_db_v2`. Serves the report pages with JWT auth and
Salesforce-hierarchy security. React frontend consumes this.

## Run

```bash
# from the backend/ directory  (:8001 — :8000 belongs to Sieger Design Operations)
.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir . --host 127.0.0.1 --port 8001 --reload
```

- API base: `http://127.0.0.1:8001/api`
- Interactive docs: `http://127.0.0.1:8001/docs`

## First-time setup

```bash
py -3.14 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe seed.py          # app schema + regions + starter accounts
```

DB credentials are read from the **project-root `.env`** (shared with the ETL).
Backend-only settings live in `backend/.env` (copy from `.env.example`) — set a real
`SECRET_KEY` before any non-local use.

## Accounts

`seed.py` creates an admin (`admin@sieger.in`) and a demo manager account. Passwords
come from `SEED_ADMIN_PASSWORD` / `SEED_MANAGER_PASSWORD` env vars, or are randomly
generated and printed once. **No credentials live in this repository** — any password
that ever appeared here has been rotated and no longer works.

## Security model

- **Tokens** are HS256 JWTs carrying a fingerprint of the user's password hash
  (`pv` claim) — changing/resetting a password immediately invalidates every
  token issued before it. On Render, a missing `SECRET_KEY` no longer falls back
  to the repo's known default: a random per-boot key is generated instead (all
  sessions reset on each restart until the env var is set). A key under 32 bytes
  still works but logs a startup warning — rotate it to a 32+ char random value.
- **Login throttling**: 5 failures / 15 min per email *and* per client IP → 429.
  Behind Render's proxy the client IP is taken from the proxy-appended (rightmost)
  `X-Forwarded-For` entry, so one attacker can't lock out the whole userbase and
  can't spoof their way past the limit.
- **Passwords**: scrypt-hashed; admin-set passwords must be 10–128 chars.
- **DB least privilege** (opt-in): `sql/04_app_role.sql` creates a `sieger_app`
  role that can only read the replicated data and write the `app` schema. Set its
  password out-of-band, point `PG_USERNAME`/`PG_PASSWORD` at it on Render, and
  tighten `pg_hba.conf` to that role for the tailnet — the API then never
  connects as a superuser. The local ETL keeps running as `postgres`.

## How it fits together

- **`app/`** — FastAPI app
  - `config.py` settings · `db.py` engine/session · `models.py` app-schema ORM
  - `security.py` — password hashing (scrypt), JWT, and **`get_visibility`** (the one
    place data-access scope is decided: `can_view_all` → all, else self + descendants
    via `fn_subordinate_user_ids`)
  - `reporting.py` — `build_filters` injects the owner/region/date/FY WHERE clause
  - `routers/` — `auth`, `meta` (slicer data), `reports` (one per page), `admin`
- **Data** — `public` SQL views (`sql/01_reporting_views.sql`) are pure facts;
  region is joined from `app.user_region`; security is applied per-request.

## Endpoints (v0.1)

- `POST /api/auth/login` · `GET /api/auth/me`
- `GET /api/meta/filters` — users / regions / financial years (visibility-scoped)
- `GET /api/reports/{sales-tracker,closed-won,closed-lost,dropped,open-funnel,no-visits,top-enquiries,new-quotes,leads}`
- `GET|POST|PUT|DELETE /api/admin/{regions,user-regions,users,targets}` (admin only)

Every `/reports/*` and `/meta/*` response is automatically restricted to the
caller's visible owners.

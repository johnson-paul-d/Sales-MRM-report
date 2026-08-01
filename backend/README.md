# Sieger SIP — Backend (FastAPI)

REST API over `salesforce_db_v2`. Serves the report pages with JWT auth and
Salesforce-hierarchy security. React frontend consumes this.

## Run

```bash
# from the backend/ directory
.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir . --host 127.0.0.1 --port 8000 --reload
```

- API base: `http://127.0.0.1:8000/api`
- Interactive docs: `http://127.0.0.1:8000/docs`

## First-time setup

```bash
py -3.14 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe seed.py          # app schema + regions + starter accounts
```

DB credentials are read from the **project-root `.env`** (shared with the ETL).
Backend-only settings live in `backend/.env` (copy from `.env.example`) — set a real
`SECRET_KEY` before any non-local use.

## Dev accounts (created by seed.py — CHANGE THESE)

| Role | Email | Password | Scope |
|---|---|---|---|
| CEO / Admin | `admin@sieger.in` | `Sieger@Admin1` | Everything + admin panel |
| Manager | `gr@siegerglobal.net` | `Sieger@Manager1` | Self + reports (hierarchy) |

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

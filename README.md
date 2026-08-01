# Sieger Sales Intelligence Platform

Web replication of the **"MRM CPS – N2"** Power BI report as a secure, multi-user
web application, served from a PostgreSQL replica of Salesforce data — with
Salesforce-hierarchy row-level security and room to extend with AI/ML later.

**Pipeline:** Salesforce → PostgreSQL (ETL) → SQL semantic views → FastAPI (auth + hierarchy security) → React SPA.

## Stack

| Layer | Tech |
|---|---|
| Data | PostgreSQL (`salesforce_db_v2`), incremental Salesforce ETL |
| Semantic layer | SQL views that rebuild the Power BI datasets & measures (`sql/`) |
| Backend | FastAPI + SQLAlchemy — JWT auth, central hierarchy/region security (`backend/`) |
| Frontend | React + TypeScript + Vite + MUI + AG Grid + ECharts (`frontend/`) |

## Repository layout

| Path | What |
|---|---|
| `salesforce_to_postgres.py` | Salesforce → Postgres ETL (incremental upsert, staging + merge) |
| `sql/` | Reporting views (`01_reporting_views.sql`), indexes, forecasts, and appliers |
| `backend/` | FastAPI app — see `app/security.py` (visibility) and `app/reporting.py` (filters) |
| `frontend/` | Vite React SPA (`src/`) — one page per report + admin panel |
| `docs/` | Reporting-layer notes, Power BI spec, validated DAX→SQL measure mappings |
| `powerbi/` | pbi-cli reference scripts (DAX) |

## Getting started

### 1. Configure environment

Copy the templates and fill in real values (the real `.env` files are git-ignored):

```bash
cp .env.example .env                     # Salesforce + Postgres credentials
cp backend/.env.example backend/.env     # JWT SECRET_KEY, CORS (optional overrides)
cp frontend/.env.example frontend/.env   # VITE_API_BASE
```

### 2. Build the reporting views

```bash
python sql/apply_reporting_views.py
```

### 3. Backend — FastAPI on :8000

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows (use source .venv/bin/activate on *nix)
pip install -r requirements.txt
python seed.py                    # creates the app schema, regions, seed accounts (idempotent)
uvicorn app.main:app --reload --port 8000
```

Interactive API docs: http://localhost:8000/docs

### 4. Frontend — Vite on :5173

```bash
cd frontend
npm install
npm run dev
```

The dev server proxies `/api` to the backend at `http://127.0.0.1:8000`.

## Security model

Report SQL views deliberately carry **no** user security. The API resolves each
logged-in user's visible owner IDs once, in one place
(`backend/app/security.py::get_visibility`) — full-access users see everything;
everyone else sees themselves plus their org-chart descendants
(`fn_subordinate_user_ids`) — and every report query is filtered through
`backend/app/reporting.py::build_filters`.

## Notes

- **Secrets** live only in `.env` files, which are git-ignored. If a credential was
  ever committed anywhere, rotate it.
- **Region** is maintained in the app's admin panel (per Salesforce user), not derived
  from Salesforce, because the source fields were unreliable.
- See `docs/` for the full report spec and the validated DAX-to-SQL measure definitions.

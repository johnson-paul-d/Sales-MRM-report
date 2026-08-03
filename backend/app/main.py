"""FastAPI application entrypoint.

Run (from the backend/ directory):
    uvicorn app.main:app --reload --port 8000
Docs at http://localhost:8000/docs
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .routers import auth, meta, reports, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Best-effort: create the app schema/tables if missing. Never block or crash
    # startup on a transient DB/tunnel hiccup -- the schema already exists in
    # normal operation, and the app must still come up so its HTTP port opens
    # (otherwise Render's health check kills the deploy).
    try:
        init_db()
    except Exception as exc:  # noqa: BLE001
        logging.getLogger("uvicorn.error").warning("init_db skipped at startup: %s", exc)
    yield


app = FastAPI(
    title="Sieger Sales Intelligence Platform API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(meta.router)
app.include_router(reports.router)
app.include_router(admin.router)


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "service": "sieger-sip-api"}

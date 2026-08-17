"""FastAPI application entrypoint.

Run (from the backend/ directory):
    uvicorn app.main:app --reload --port 8000
Docs at http://localhost:8000/docs (disabled in production)
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .db import init_db
from .routers import auth, meta, reports, admin

# Render sets RENDER=true in every service container.
IS_PROD = bool(os.getenv("RENDER"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Best-effort: create the app schema/tables if missing. Never block or crash
    # startup on a transient DB/tunnel hiccup -- the schema already exists in
    # normal operation, and the app must still come up so its HTTP port opens
    # (otherwise Render's health check kills the deploy).
    log = logging.getLogger("uvicorn.error")
    if IS_PROD and settings.secret_key_is_ephemeral:
        log.critical(
            "SECRET_KEY env var is not set -- running with a random per-boot key, "
            "so every restart logs all users out. Set a 32+ char random "
            "SECRET_KEY on Render!")
    elif IS_PROD and settings.secret_key_is_weak:
        log.warning(
            "SECRET_KEY is under 32 bytes (below the HS256 minimum, RFC 7518). "
            "Rotate it to a 32+ char random value; all users re-login once.")
    try:
        init_db()
    except Exception as exc:  # noqa: BLE001
        logging.getLogger("uvicorn.error").warning("init_db skipped at startup: %s", exc)
    yield


app = FastAPI(
    title="Sieger Sales Intelligence Platform API",
    version="0.1.0",
    lifespan=lifespan,
    # No API explorer in production -- it maps the whole attack surface for free.
    docs_url=None if IS_PROD else "/docs",
    redoc_url=None if IS_PROD else "/redoc",
    openapi_url=None if IS_PROD else "/openapi.json",
)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError):
    """422 with a human-readable string `detail` (FastAPI's default is a list of
    error dicts, which the SPA renders straight into a Snackbar)."""
    parts = []
    for e in exc.errors():
        loc = [str(p) for p in e.get("loc", ()) if p not in ("body", "query", "path")]
        parts.append(f"{'.'.join(loc) or 'request'}: {e.get('msg', 'invalid')}")
    return JSONResponse(status_code=422, content={"detail": "; ".join(parts) or "Invalid request"})


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    # API responses carry scoped business data -- never let a shared cache keep them.
    resp.headers.setdefault("Cache-Control", "no-store")
    return resp

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    # Exactly what the SPA uses -- no blanket grants.
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(meta.router)
app.include_router(reports.router)
app.include_router(admin.router)


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "service": "sieger-sip-api"}

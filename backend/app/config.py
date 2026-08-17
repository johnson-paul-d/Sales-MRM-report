"""Application settings.

DB credentials come from the project-root .env (shared with the ETL).
Backend-only settings (JWT secret, CORS) come from backend/.env if present.
"""
import os
import secrets
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_SECRET = "dev-insecure-change-me"

# backend/app/config.py -> parents[2] == project root "D:\SF to SQL to BI"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Root .env first (PG_*), then backend/.env (may override / add SECRET_KEY etc.)
        env_file=(str(PROJECT_ROOT / ".env"), str(BACKEND_DIR / ".env")),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- PostgreSQL (from root .env, shared with the ETL) ---
    pg_username: str
    pg_password: str
    pg_host: str = "localhost"
    pg_port: int = 5432
    pg_database: str

    # --- Auth / app ---
    secret_key: str = _DEFAULT_SECRET
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 720
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # True when prod had no SECRET_KEY and a random one was generated (below).
    secret_key_is_ephemeral: bool = False

    def model_post_init(self, __context) -> None:
        # The default key is public (it's in the repo), so in production a
        # missing SECRET_KEY would let anyone forge admin JWTs. A random
        # per-boot key keeps tokens unforgeable; sessions reset on restart.
        # (A short-but-secret key is only *warned* about in main.py -- forcing
        # it ephemeral would log every user out on each Render spin-up.)
        if os.getenv("RENDER") and self.secret_key.strip() in ("", _DEFAULT_SECRET):
            self.secret_key = secrets.token_urlsafe(64)
            self.secret_key_is_ephemeral = True

    @property
    def secret_key_is_weak(self) -> bool:
        """Below the HS256 minimum key length (RFC 7518 §3.2: 256 bits)."""
        return len(self.secret_key.encode("utf-8")) < 32

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()

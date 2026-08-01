"""Application settings.

DB credentials come from the project-root .env (shared with the ETL).
Backend-only settings (JWT secret, CORS) come from backend/.env if present.
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

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
    secret_key: str = "dev-insecure-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 720
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()

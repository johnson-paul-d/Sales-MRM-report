"""Database engine, session, and small query helpers."""
from typing import Any
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker, declarative_base, Session

from .config import settings

DB_URL = URL.create(
    "postgresql+psycopg2",
    username=settings.pg_username,
    password=settings.pg_password,
    host=settings.pg_host,
    port=int(settings.pg_port),
    database=settings.pg_database,
)

engine = create_engine(DB_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db():
    """FastAPI dependency: yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create the `app` schema and its tables if missing (idempotent)."""
    from . import models  # noqa: F401  (register models on Base)
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS app"))
    Base.metadata.create_all(bind=engine)


def rows_as_dicts(db: Session, sql: str, params: dict[str, Any] | None = None) -> list[dict]:
    """Run a SELECT and return a list of plain dicts (handy for report views)."""
    result = db.execute(text(sql), params or {})
    return [dict(m) for m in result.mappings().all()]

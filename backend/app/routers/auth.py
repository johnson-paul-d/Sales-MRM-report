"""Authentication endpoints."""
import os
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AppUser
from ..schemas import Token, MeOut
from ..security import (
    verify_password, create_access_token, get_visibility, Visibility,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# --- login throttle (in-memory; effective with the single-worker deploy) ---
# 5 failures per key in a 15-minute sliding window -> 429. Keyed independently
# by account email and by client IP so neither can be brute-forced.
_FAIL_WINDOW_SECS = 15 * 60
_MAX_FAILS = 5
_failures: dict[str, deque] = defaultdict(deque)
# `login` is a sync endpoint, so requests run concurrently on the threadpool
# and share this dict -- every read/modify path below holds the lock.
_lock = threading.Lock()


def _prune(q: deque, now: float) -> None:
    while q and now - q[0] > _FAIL_WINDOW_SECS:
        q.popleft()


def _check_throttle(*keys: str) -> None:
    now = time.monotonic()
    with _lock:
        for key in keys:
            q = _failures[key]
            _prune(q, now)
            if len(q) >= _MAX_FAILS:
                raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                                    "Too many failed attempts. Try again later.")


def _record_failure(*keys: str) -> None:
    now = time.monotonic()
    with _lock:
        for key in keys:
            _failures[key].append(now)
        # Bound memory: an attacker cycling emails/IPs must not grow the dict
        # forever. Sweep buckets whose whole window has already expired.
        if len(_failures) > 5000:
            expired = [k for k, q in list(_failures.items())
                       if not q or now - q[-1] > _FAIL_WINDOW_SECS]
            for key in expired:
                _failures.pop(key, None)


def _clear_failures(key: str) -> None:
    with _lock:
        _failures.pop(key, None)


def _client_ip(request: Request) -> str:
    """Client IP for throttling. On Render the socket peer is the proxy, so
    every user would share one bucket (5 stray failures = everyone locked out).
    The proxy APPENDS the true client IP to X-Forwarded-For, so the rightmost
    entry is trustworthy there; the leftmost entries are client-supplied and
    spoofable, which is why uvicorn's --proxy-headers (first-entry) isn't used."""
    if os.getenv("RENDER"):
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            return xff.split(",")[-1].strip()
    return request.client.host if request.client else "?"


@router.post("/login", response_model=Token)
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(),
          db: Session = Depends(get_db)):
    email = form.username.strip().lower()
    keys = (f"email:{email}", f"ip:{_client_ip(request)}")
    _check_throttle(*keys)

    user = db.query(AppUser).filter(AppUser.email == email).first()
    if not user or not user.is_active or not verify_password(form.password, user.hashed_password):
        _record_failure(*keys)
        time.sleep(0.5)  # flat cost per failure; also masks user-exists timing
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")

    _clear_failures(f"email:{email}")
    user.last_login = datetime.now(tz=timezone.utc)
    db.commit()
    return Token(access_token=create_access_token(user))


@router.get("/me", response_model=MeOut)
def me(vis: Visibility = Depends(get_visibility)):
    u = vis.user
    return MeOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        role=u.role,
        is_admin=u.is_admin,
        can_view_all=u.can_view_all,
        salesforce_user_id=u.salesforce_user_id,
        visible_user_count=-1 if vis.can_view_all else len(vis.owner_ids or []),
    )

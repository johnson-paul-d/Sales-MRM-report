"""Authentication, password hashing, and the central visibility (security) rule.

Password hashing uses hashlib.scrypt (Python stdlib) -- no native crypto deps.
JWT uses PyJWT (HS256).
"""
import base64
import hashlib
import hmac
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import AppUser

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# --- scrypt parameters ---
_N, _R, _P, _DKLEN = 2 ** 14, 8, 1, 32


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P, dklen=_DKLEN)
    return f"scrypt${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, salt_b64, hash_b64 = stored.split("$")
        if algo != "scrypt":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P, dklen=len(expected))
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False


def _password_fingerprint(hashed_password: str) -> str:
    """Non-reversible tag of the current password hash, embedded in tokens so
    that a password change/reset invalidates every previously issued token."""
    return hashlib.sha256(hashed_password.encode("utf-8")).hexdigest()[:16]


def create_access_token(user: AppUser) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": str(user.id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
        "pv": _password_fingerprint(user.hashed_password),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> AppUser:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm],
            options={"require": ["exp", "sub", "pv"]},
        )
        user_id = int(payload.get("sub"))
    except Exception:
        raise cred_exc
    user = db.get(AppUser, user_id)
    if user is None or not user.is_active:
        raise cred_exc
    if not hmac.compare_digest(payload.get("pv", ""), _password_fingerprint(user.hashed_password)):
        raise cred_exc  # password changed since this token was issued
    return user


@dataclass
class Visibility:
    """Resolved data-access scope for the current request."""
    user: AppUser
    can_view_all: bool
    owner_ids: list[str] | None  # None == no restriction (see everything)

    @property
    def sees_nothing(self) -> bool:
        return not self.can_view_all and not self.owner_ids


def get_visibility(
    user: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Visibility:
    """Central security rule: which owner_ids may this user see?

    - can_view_all (CEO/admin) -> None (everything)
    - otherwise -> self + all descendants via the ManagerId hierarchy
      (fn_subordinate_user_ids). Swappable to the UserRole hierarchy later.
    """
    if user.can_view_all:
        return Visibility(user, True, None)
    if not user.salesforce_user_id:
        return Visibility(user, False, [])  # no SF mapping -> no rows
    rows = db.execute(
        text("SELECT user_id FROM fn_subordinate_user_ids(:me)"),
        {"me": user.salesforce_user_id},
    ).all()
    return Visibility(user, False, [r[0] for r in rows])


def require_admin(user: AppUser = Depends(get_current_user)) -> AppUser:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin privileges required")
    return user


def require_manager(
    vis: "Visibility" = Depends(get_visibility),
    db: Session = Depends(get_db),
) -> "Visibility":
    """Manager-only gate: at least one active direct report (or can_view_all).

    Used by the post-order visits report. Deliberately based on the live
    ManagerId hierarchy rather than the informational `role` label, so it stays
    correct as the org changes without anyone maintaining a second list.
    """
    if vis.can_view_all:
        return vis
    if vis.user.salesforce_user_id:
        reports = db.execute(
            text('SELECT count(*) FROM "user" WHERE "ManagerId" = :me AND "IsActive" IS TRUE'),
            {"me": vis.user.salesforce_user_id},
        ).scalar()
        if reports:
            return vis
    raise HTTPException(status.HTTP_403_FORBIDDEN,
                        "This report is available to managers only")

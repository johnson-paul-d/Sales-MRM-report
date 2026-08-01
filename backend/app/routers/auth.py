"""Authentication endpoints."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AppUser
from ..schemas import Token, MeOut
from ..security import (
    verify_password, create_access_token, get_visibility, Visibility,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    email = form.username.strip().lower()
    user = db.query(AppUser).filter(AppUser.email == email).first()
    if not user or not user.is_active or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    user.last_login = datetime.now(tz=timezone.utc)
    db.commit()
    return Token(access_token=create_access_token(user.id))


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

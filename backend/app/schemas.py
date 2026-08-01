"""Pydantic request/response schemas."""
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, EmailStr, ConfigDict


# ---- Auth ----
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeOut(BaseModel):
    id: int
    email: str
    full_name: str | None = None
    role: str
    is_admin: bool
    can_view_all: bool
    salesforce_user_id: str | None = None
    visible_user_count: int


# ---- Regions ----
class RegionIn(BaseModel):
    name: str
    code: str | None = None
    is_active: bool = True


class RegionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    code: str | None = None
    is_active: bool


# ---- User <-> region assignment ----
class UserRegionRow(BaseModel):
    salesforce_user_id: str
    user_name: str | None = None
    is_active: bool | None = None
    region_id: int | None = None
    region_name: str | None = None


class UserRegionAssign(BaseModel):
    region_id: int | None = None


# ---- App users (admin) ----
class AppUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    full_name: str | None = None
    salesforce_user_id: str | None = None
    role: str
    can_view_all: bool
    is_active: bool
    is_admin: bool
    last_login: datetime | None = None


class AppUserCreate(BaseModel):
    email: EmailStr
    full_name: str | None = None
    salesforce_user_id: str | None = None
    password: str
    role: str = "SALESPERSON"
    can_view_all: bool = False
    is_admin: bool = False


class AppUserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    can_view_all: bool | None = None
    is_active: bool | None = None
    is_admin: bool | None = None
    salesforce_user_id: str | None = None


class PasswordReset(BaseModel):
    new_password: str


# ---- Targets ----
class SalesTargetIn(BaseModel):
    salesforce_user_id: str | None = None
    region_id: int | None = None
    period_type: str = "MONTH"
    period_start: date
    target_amount: Decimal


class SalesTargetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    salesforce_user_id: str | None = None
    region_id: int | None = None
    period_type: str
    period_start: date
    target_amount: Decimal

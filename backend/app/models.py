"""ORM models for the `app` schema (application-owned tables).

The replicated Salesforce tables live in `public` and are read via SQL views;
these are the app's own tables for auth, region assignment, and targets.
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, Numeric, Date, DateTime, ForeignKey, func, text,
    UniqueConstraint,
)
from .db import Base

APP = {"schema": "app"}


class Region(Base):
    """Sales region master list -- maintained in the admin panel."""
    __tablename__ = "region"
    __table_args__ = APP
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    code = Column(String, unique=True)
    is_active = Column(Boolean, nullable=False, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserRegion(Base):
    """Assigns a region to a Salesforce user (any owner, not just login users)."""
    __tablename__ = "user_region"
    __table_args__ = APP
    salesforce_user_id = Column(String, primary_key=True)  # -> public."user"."Id"
    region_id = Column(Integer, ForeignKey("app.region.id", ondelete="SET NULL"))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AppUser(Base):
    """Login account. A subset of Salesforce users who can sign in."""
    __tablename__ = "app_user"
    __table_args__ = APP
    id = Column(Integer, primary_key=True)
    salesforce_user_id = Column(String, unique=True)  # -> public."user"."Id"
    email = Column(String, nullable=False, unique=True)
    full_name = Column(String)
    hashed_password = Column(String, nullable=False)
    # SALESPERSON | MANAGER | HIGH_MANAGER | CEO | ADMIN  (informational; visibility
    # is driven by the hierarchy + can_view_all, not this label)
    role = Column(String, nullable=False, server_default=text("'SALESPERSON'"))
    can_view_all = Column(Boolean, nullable=False, server_default=text("false"))
    is_active = Column(Boolean, nullable=False, server_default=text("true"))
    is_admin = Column(Boolean, nullable=False, server_default=text("false"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True))


class SalesTarget(Base):
    """Sales targets, maintained in the admin panel (This Month Target / Open Funnel)."""
    __tablename__ = "sales_target"
    __table_args__ = (
        UniqueConstraint("salesforce_user_id", "period_start", "period_type",
                         name="uq_sales_target_owner_period"),
        APP,
    )
    id = Column(Integer, primary_key=True)
    salesforce_user_id = Column(String)   # owner; NULL = region/global target
    region_id = Column(Integer, ForeignKey("app.region.id", ondelete="SET NULL"))
    period_type = Column(String, nullable=False, server_default=text("'MONTH'"))  # MONTH|QUARTER|FY
    period_start = Column(Date, nullable=False)
    target_amount = Column(Numeric, nullable=False, server_default=text("0"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

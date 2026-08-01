"""Admin panel endpoints: regions, region assignment, login accounts, targets.

All routes require an admin user (require_admin).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db, rows_as_dicts
from ..models import Region, UserRegion, AppUser, SalesTarget
from ..schemas import (
    RegionIn, RegionOut, UserRegionRow, UserRegionAssign,
    AppUserOut, AppUserCreate, AppUserUpdate, PasswordReset,
    SalesTargetIn, SalesTargetOut,
)
from ..security import require_admin, hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


# ============================ REGIONS ============================
@router.get("/regions", response_model=list[RegionOut])
def list_regions(db: Session = Depends(get_db)):
    return db.query(Region).order_by(Region.name).all()


@router.post("/regions", response_model=RegionOut, status_code=201)
def create_region(body: RegionIn, db: Session = Depends(get_db)):
    if db.query(Region).filter(Region.name == body.name).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Region name already exists")
    region = Region(name=body.name, code=body.code, is_active=body.is_active)
    db.add(region)
    db.commit()
    db.refresh(region)
    return region


@router.put("/regions/{region_id}", response_model=RegionOut)
def update_region(region_id: int, body: RegionIn, db: Session = Depends(get_db)):
    region = db.get(Region, region_id)
    if not region:
        raise HTTPException(404, "Region not found")
    region.name, region.code, region.is_active = body.name, body.code, body.is_active
    db.commit()
    db.refresh(region)
    return region


@router.delete("/regions/{region_id}", status_code=204)
def delete_region(region_id: int, db: Session = Depends(get_db)):
    region = db.get(Region, region_id)
    if not region:
        raise HTTPException(404, "Region not found")
    db.delete(region)   # user_region / sales_target FKs are ON DELETE SET NULL
    db.commit()


# ==================== USER <-> REGION ASSIGNMENT ====================
@router.get("/user-regions", response_model=list[UserRegionRow])
def list_user_regions(active_only: bool = True, db: Session = Depends(get_db)):
    where = 'WHERE u."IsActive" IS TRUE' if active_only else ""
    return rows_as_dicts(db, f'''
        SELECT u."Id"       AS salesforce_user_id,
               u."Name"     AS user_name,
               u."IsActive" AS is_active,
               ur.region_id,
               r.name       AS region_name
        FROM "user" u
        LEFT JOIN app.user_region ur ON ur.salesforce_user_id = u."Id"
        LEFT JOIN app.region r       ON r.id = ur.region_id
        {where}
        ORDER BY u."Name"
    ''')


@router.put("/user-regions/{sf_user_id}", response_model=UserRegionRow)
def assign_user_region(sf_user_id: str, body: UserRegionAssign, db: Session = Depends(get_db)):
    if body.region_id is not None and not db.get(Region, body.region_id):
        raise HTTPException(404, "Region not found")
    ur = db.get(UserRegion, sf_user_id)
    if ur is None:
        ur = UserRegion(salesforce_user_id=sf_user_id, region_id=body.region_id)
        db.add(ur)
    else:
        ur.region_id = body.region_id
    db.commit()
    rows = rows_as_dicts(db, '''
        SELECT u."Id" AS salesforce_user_id, u."Name" AS user_name, u."IsActive" AS is_active,
               ur.region_id, r.name AS region_name
        FROM "user" u
        LEFT JOIN app.user_region ur ON ur.salesforce_user_id = u."Id"
        LEFT JOIN app.region r ON r.id = ur.region_id
        WHERE u."Id" = :id
    ''', {"id": sf_user_id})
    if not rows:
        raise HTTPException(404, "Salesforce user not found")
    return rows[0]


# ======================== LOGIN ACCOUNTS ========================
@router.get("/users", response_model=list[AppUserOut])
def list_app_users(db: Session = Depends(get_db)):
    return db.query(AppUser).order_by(AppUser.email).all()


@router.post("/users", response_model=AppUserOut, status_code=201)
def create_app_user(body: AppUserCreate, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.query(AppUser).filter(AppUser.email == email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already exists")
    user = AppUser(
        email=email,
        full_name=body.full_name,
        salesforce_user_id=body.salesforce_user_id,
        hashed_password=hash_password(body.password),
        role=body.role,
        can_view_all=body.can_view_all,
        is_admin=body.is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=AppUserOut)
def update_app_user(user_id: int, body: AppUserUpdate, db: Session = Depends(get_db)):
    user = db.get(AppUser, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/reset-password", status_code=204)
def reset_password(user_id: int, body: PasswordReset, db: Session = Depends(get_db)):
    user = db.get(AppUser, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.hashed_password = hash_password(body.new_password)
    db.commit()


# ============================ TARGETS ============================
@router.get("/targets", response_model=list[SalesTargetOut])
def list_targets(db: Session = Depends(get_db)):
    return db.query(SalesTarget).order_by(SalesTarget.period_start.desc()).all()


@router.post("/targets", response_model=SalesTargetOut, status_code=201)
def create_target(body: SalesTargetIn, db: Session = Depends(get_db)):
    target = SalesTarget(**body.model_dump())
    db.add(target)
    db.commit()
    db.refresh(target)
    return target


@router.delete("/targets/{target_id}", status_code=204)
def delete_target(target_id: int, db: Session = Depends(get_db)):
    target = db.get(SalesTarget, target_id)
    if not target:
        raise HTTPException(404, "Target not found")
    db.delete(target)
    db.commit()

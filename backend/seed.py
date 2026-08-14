"""Bootstrap the app: schema, default regions, and starter login accounts.

Run from the backend/ directory:
    python seed.py

Creates (idempotent):
  * default sales regions (editable later in the admin panel)
  * an ADMIN / CEO account (sees everything, can open the admin panel)
  * a demo MANAGER account mapped to the Salesforce user with the most reports
    (so you can test hierarchy-scoped visibility)

Passwords come from env vars SEED_ADMIN_PASSWORD / SEED_MANAGER_PASSWORD; when
unset, a strong random password is generated and printed ONCE to the console.
There are deliberately no hardcoded defaults -- this repo is public.
"""
import os
import secrets
from sqlalchemy import text

from app.db import SessionLocal, init_db
from app.models import Region, AppUser
from app.security import hash_password

DEFAULT_REGIONS = ["Tamil Nadu", "West", "North", "East", "Karnataka", "Kerala", "Andhra Pradesh"]
ADMIN_EMAIL = "admin@sieger.in"
ADMIN_PASSWORD = os.getenv("SEED_ADMIN_PASSWORD") or secrets.token_urlsafe(12)
MANAGER_PASSWORD = os.getenv("SEED_MANAGER_PASSWORD") or secrets.token_urlsafe(12)


def seed():
    init_db()
    db = SessionLocal()
    summary = []
    try:
        # --- regions ---
        added = 0
        for name in DEFAULT_REGIONS:
            if not db.query(Region).filter(Region.name == name).first():
                db.add(Region(name=name))
                added += 1
        db.commit()
        summary.append(f"regions: {added} added ({db.query(Region).count()} total)")

        # --- admin / CEO ---
        admin = db.query(AppUser).filter(AppUser.email == ADMIN_EMAIL).first()
        if not admin:
            db.add(AppUser(
                email=ADMIN_EMAIL,
                full_name="Platform Admin",
                hashed_password=hash_password(ADMIN_PASSWORD),
                role="CEO",
                can_view_all=True,
                is_admin=True,
            ))
            db.commit()
            summary.append(f"ADMIN created -> {ADMIN_EMAIL} / {ADMIN_PASSWORD}  (CEO, sees all, admin)")
        else:
            summary.append(f"ADMIN already exists -> {ADMIN_EMAIL}")

        # --- demo manager (most direct+indirect reports) ---
        row = db.execute(text('''
            SELECT m."Id" AS sf_id, m."Name" AS name, m."Email" AS email,
                   (SELECT COUNT(*) FROM fn_subordinate_user_ids(m."Id")) AS visible
            FROM "user" m
            WHERE m."ManagerId" IS NULL OR m."Id" IN (SELECT DISTINCT "ManagerId" FROM "user" WHERE "ManagerId" IS NOT NULL)
            ORDER BY visible DESC
            LIMIT 1
        ''')).mappings().first()

        if row:
            mgr_email = (row["email"] or f'manager+{row["sf_id"]}@sieger.local').lower()
            existing = db.query(AppUser).filter(AppUser.email == mgr_email).first()
            if not existing:
                db.add(AppUser(
                    email=mgr_email,
                    full_name=row["name"],
                    salesforce_user_id=row["sf_id"],
                    hashed_password=hash_password(MANAGER_PASSWORD),
                    role="MANAGER",
                    can_view_all=False,
                    is_admin=False,
                ))
                db.commit()
                summary.append(
                    f"MANAGER created -> {mgr_email} / {MANAGER_PASSWORD}  "
                    f"(SF: {row['name']}, sees {row['visible']} users)"
                )
            else:
                summary.append(f"MANAGER already exists -> {mgr_email}")
    finally:
        db.close()

    print("\n=== SEED COMPLETE ===")
    for line in summary:
        print("  -", line)
    print("\n  Change these passwords after first login (admin panel).")


if __name__ == "__main__":
    seed()

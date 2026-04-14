"""
Seed default users into auth.users for all three CPG tenants.
Run once after running migrations:
  python database/seed/seed_users.py
"""
import os, sys, bcrypt, psycopg2

POSTGRES_DSN = os.getenv(
    "POSTGRES_DSN",
    "postgresql://cpg_user:cpg_password@localhost:5432/cpg_analytics",
)

USERS = [
    # Nestlé
    {"username": "nestle_admin",   "password": "admin123",   "full_name": "Nestlé Admin",          "client_id": "nestle",   "role": "admin",    "email": "admin@nestle.example"},
    {"username": "nestle_nsm",     "password": "nsm123",     "full_name": "Nestlé NSM",             "client_id": "nestle",   "role": "NSM",      "email": "nsm@nestle.example",   "sales_hierarchy_level": "NSM",  "nsm_code": "NSM001"},
    {"username": "nestle_zsm",     "password": "zsm123",     "full_name": "Nestlé ZSM West",        "client_id": "nestle",   "role": "ZSM",      "email": "zsm@nestle.example",   "sales_hierarchy_level": "ZSM",  "zsm_code": "ZSM001"},
    {"username": "nestle_asm",     "password": "asm123",     "full_name": "Nestlé ASM Mumbai",      "client_id": "nestle",   "role": "ASM",      "email": "asm@nestle.example",   "sales_hierarchy_level": "ASM",  "asm_code": "ASM001"},
    {"username": "nestle_so",      "password": "so123",      "full_name": "Nestlé SO Mumbai South", "client_id": "nestle",   "role": "SO",       "email": "so@nestle.example",    "sales_hierarchy_level": "SO",   "so_code":  "SO001"},
    {"username": "nestle_analyst", "password": "analyst123", "full_name": "Nestlé Analyst",         "client_id": "nestle",   "role": "analyst",  "email": "analyst@nestle.example"},
    # HUL
    {"username": "hul_admin",      "password": "admin123",   "full_name": "HUL Admin",             "client_id": "unilever", "role": "admin",    "email": "admin@hul.example"},
    {"username": "hul_analyst",    "password": "analyst123", "full_name": "HUL Analyst",           "client_id": "unilever", "role": "analyst",  "email": "analyst@hul.example"},
    {"username": "hul_nsm",        "password": "nsm123",     "full_name": "HUL NSM",               "client_id": "unilever", "role": "NSM",      "email": "nsm@hul.example",       "sales_hierarchy_level": "NSM",  "nsm_code": "NSM001"},
    # ITC
    {"username": "itc_admin",      "password": "admin123",   "full_name": "ITC Admin",             "client_id": "itc",      "role": "admin",    "email": "admin@itc.example"},
    {"username": "itc_analyst",    "password": "analyst123", "full_name": "ITC Analyst",           "client_id": "itc",      "role": "analyst",  "email": "analyst@itc.example"},
]

def hash_pw(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def main():
    conn = psycopg2.connect(POSTGRES_DSN)
    cur = conn.cursor()
    inserted = 0
    for u in USERS:
        cur.execute(
            """
            INSERT INTO auth.users
              (username, email, full_name, password_hash, client_id, role,
               sales_hierarchy_level, so_code, asm_code, zsm_code, nsm_code)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (username) DO NOTHING
            """,
            (
                u["username"], u.get("email"), u.get("full_name"),
                hash_pw(u["password"]),
                u["client_id"], u["role"],
                u.get("sales_hierarchy_level"),
                u.get("so_code"), u.get("asm_code"),
                u.get("zsm_code"), u.get("nsm_code"),
            ),
        )
        if cur.rowcount:
            inserted += 1
            print(f"  Created: {u['username']} ({u['role']} @ {u['client_id']})")
        else:
            print(f"  Skipped (exists): {u['username']}")
    conn.commit()
    cur.close()
    conn.close()
    print(f"\nDone — {inserted} users created.")

if __name__ == "__main__":
    main()

"""
AuthManager — user authentication against PostgreSQL users table.
Issues JWT access + refresh tokens (replaces Flask-Login sessions).
"""
import logging
from dataclasses import dataclass
from typing import Optional
import bcrypt

from app.core.config import get_settings
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.database.postgresql import execute_query, execute_write

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class UserRecord:
    user_id: str
    username: str
    email: str
    full_name: str
    client_id: str          # nestle | unilever | itc
    role: str               # SO | ASM | ZSM | NSM | analyst | admin
    is_active: bool
    sales_hierarchy_level: Optional[str]   # SO | ASM | ZSM | NSM
    so_code: Optional[str]
    asm_code: Optional[str]
    zsm_code: Optional[str]
    nsm_code: Optional[str]
    territory_codes: list[str]
    domain: str = "cpg"     # cpg | cold_chain  (default: cpg)

    @property
    def hierarchy_code(self) -> Optional[str]:
        for code in (self.so_code, self.asm_code, self.zsm_code, self.nsm_code):
            if code:
                return code
        return None

    def to_token_payload(self) -> dict:
        return {
            "sub": self.user_id,
            "username": self.username,
            "client_id": self.client_id,
            "role": self.role,
            "sales_hierarchy_level": self.sales_hierarchy_level,
            "so_code": self.so_code,
            "asm_code": self.asm_code,
            "zsm_code": self.zsm_code,
            "nsm_code": self.nsm_code,
            "territory_codes": self.territory_codes,
            "domain": self.domain,
        }


class AuthManager:
    """Stateless — all state lives in PostgreSQL and JWT tokens."""

    _instance = None

    @classmethod
    def get(cls) -> "AuthManager":
        if cls._instance is None:
            cls._instance = AuthManager()
        return cls._instance

    # ── Authentication ────────────────────────────────────────────────────

    def authenticate(self, username: str, password: str) -> Optional[UserRecord]:
        rows = execute_query(
            """
            SELECT u.user_id, u.username, u.email, u.full_name, u.password_hash,
                   u.client_id, u.role, u.is_active,
                   u.sales_hierarchy_level,
                   u.so_code, u.asm_code, u.zsm_code, u.nsm_code,
                   u.territory_codes
            FROM auth.users u
            WHERE u.username = %s AND u.is_active = TRUE
            """,
            (username,),
        )
        if not rows:
            return None

        row = rows[0]
        stored_hash = row["password_hash"]
        if not bcrypt.checkpw(password.encode(), stored_hash.encode()):
            return None

        # Update last_login
        execute_write(
            "UPDATE auth.users SET last_login = NOW() WHERE user_id = %s",
            (row["user_id"],),
        )

        return self._row_to_user(row)

    def get_user_by_id(self, user_id: str) -> Optional[UserRecord]:
        rows = execute_query(
            """
            SELECT user_id, username, email, full_name, client_id, role, is_active,
                   sales_hierarchy_level, so_code, asm_code, zsm_code, nsm_code,
                   territory_codes
            FROM auth.users WHERE user_id = %s AND is_active = TRUE
            """,
            (user_id,),
        )
        if not rows:
            return None
        return self._row_to_user(rows[0])

    # ── Token issuance ────────────────────────────────────────────────────

    def issue_tokens(self, user: UserRecord) -> dict:
        payload = user.to_token_payload()
        return {
            "access_token": create_access_token(payload),
            "refresh_token": create_refresh_token(payload),
            "token_type": "bearer",
            "user": {
                "username": user.username,
                "full_name": user.full_name,
                "client_id": user.client_id,
                "role": user.role,
                "sales_hierarchy_level": user.sales_hierarchy_level,
                "domain": user.domain,
            },
        }

    def refresh_access_token(self, refresh_token: str) -> dict:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        # Re-issue access token with same payload (minus exp/type)
        new_payload = {k: v for k, v in payload.items() if k not in ("exp", "iat", "type")}
        return {
            "access_token": create_access_token(new_payload),
            "token_type": "bearer",
        }

    # ── Client config ─────────────────────────────────────────────────────

    def get_client_config(self, client_id: str) -> Optional[dict]:
        rows = execute_query(
            "SELECT * FROM auth.clients WHERE client_id = %s AND is_active = TRUE",
            (client_id,),
        )
        return dict(rows[0]) if rows else None

    # ── Helpers ───────────────────────────────────────────────────────────

    def _row_to_user(self, row: dict) -> UserRecord:
        territory_codes = row.get("territory_codes") or []
        if isinstance(territory_codes, str):
            import json
            try:
                territory_codes = json.loads(territory_codes)
            except Exception:
                territory_codes = []
        return UserRecord(
            user_id=str(row["user_id"]),
            username=row["username"],
            email=row.get("email", ""),
            full_name=row.get("full_name", ""),
            client_id=row["client_id"],
            role=row["role"],
            is_active=row.get("is_active", True),
            sales_hierarchy_level=row.get("sales_hierarchy_level"),
            so_code=row.get("so_code"),
            asm_code=row.get("asm_code"),
            zsm_code=row.get("zsm_code"),
            nsm_code=row.get("nsm_code"),
            territory_codes=territory_codes,
            domain=row.get("domain", "cpg"),
        )

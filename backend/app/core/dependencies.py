"""
FastAPI dependency injection — RBAC, tenant resolution, catalog loading.
All protected routes declare these as dependencies; FastAPI injects them automatically.
"""
from typing import Annotated, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings
from app.core.security import decode_token, CREDENTIALS_EXCEPTION

settings = get_settings()
bearer_scheme = HTTPBearer(auto_error=False)


# ── User model (resolved from JWT, used everywhere) ─────────────────────────
class CurrentUser:
    def __init__(self, payload: dict):
        self.user_id: str = payload["sub"]
        self.username: str = payload["username"]
        self.client_id: str = payload["client_id"]
        self.role: str = payload["role"]
        self.sales_hierarchy_level: Optional[str] = payload.get("sales_hierarchy_level")
        self.so_code: Optional[str] = payload.get("so_code")
        self.asm_code: Optional[str] = payload.get("asm_code")
        self.zsm_code: Optional[str] = payload.get("zsm_code")
        self.nsm_code: Optional[str] = payload.get("nsm_code")
        self.territory_codes: list = payload.get("territory_codes", [])
        self.domain: str = payload.get("domain", "cpg")   # cpg | cold_chain

    @property
    def is_admin(self) -> bool:
        return self.role in ("admin", "NSM", "analyst")

    @property
    def hierarchy_code(self) -> Optional[str]:
        """Most specific hierarchy code for this user (used in JWT, RLS, Cube tokens)."""
        for code in (self.so_code, self.asm_code, self.zsm_code, self.nsm_code):
            if code:
                return code
        return None


# ── Core dependency: parse + validate JWT ───────────────────────────────────
async def get_current_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer_scheme)],
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(credentials.credentials)
    if payload.get("type") != "access":
        raise CREDENTIALS_EXCEPTION
    return CurrentUser(payload)


# ── Role guard factory ────────────────────────────────────────────────────────
def require_role(*allowed_roles: str):
    """Usage: Depends(require_role('admin', 'NSM'))"""
    async def _check(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role}' is not permitted for this action. "
                       f"Required: {list(allowed_roles)}",
            )
        return user
    return _check


def require_admin():
    return require_role("admin", "NSM", "analyst")


# ── Type aliases for clean route signatures ───────────────────────────────────
AuthUser = Annotated[CurrentUser, Depends(get_current_user)]
AdminUser = Annotated[CurrentUser, Depends(require_role("admin"))]

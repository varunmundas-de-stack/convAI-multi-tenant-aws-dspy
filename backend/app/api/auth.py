"""
Auth router — login, token refresh, logout, /me.
"""
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from app.security.auth import AuthManager
from app.security.audit import AuditLogger
from app.core.dependencies import AuthUser
from app.core.security import create_cubejs_token

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/login")
def login(body: LoginRequest, request: Request):
    user = AuthManager.get().authenticate(body.username, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    AuditLogger.get().log_login(
        user.user_id, user.username, user.client_id,
        ip_address=request.client.host if request.client else None,
    )
    return AuthManager.get().issue_tokens(user)


@router.post("/refresh")
def refresh(body: RefreshRequest):
    return AuthManager.get().refresh_access_token(body.refresh_token)


@router.get("/me")
def me(user: AuthUser):
    return {
        "user_id": user.user_id,
        "username": user.username,
        "client_id": user.client_id,
        "role": user.role,
        "sales_hierarchy_level": user.sales_hierarchy_level,
        "domain": user.domain,
    }


@router.get("/cubejs-token")
def cubejs_token(user: AuthUser):
    """Short-lived Cube.js JWT for frontend OLAP requests."""
    token = create_cubejs_token({
        "client_id": user.client_id,
        "username": user.username,
        "role": user.role,
        "hierarchy_code": user.hierarchy_code,
    })
    return {"token": token}

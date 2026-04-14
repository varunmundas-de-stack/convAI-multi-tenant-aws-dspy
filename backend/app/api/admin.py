"""
Admin router — raw SQL execution (SELECT only), schema inspection.
Restricted to admin role.
"""
import re
import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.core.dependencies import require_role, AuthUser
from app.database.postgresql import execute_query, schema_for_tenant

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])

AdminOnly = Depends(require_role("admin"))

# Only allow safe read-only statements
_SAFE_SQL_PATTERN = re.compile(
    r"^\s*(SELECT|WITH|EXPLAIN)\b", re.IGNORECASE
)


class SqlRequest(BaseModel):
    sql: str
    schema: str | None = None    # override tenant schema


@router.post("/sql", dependencies=[AdminOnly])
def run_sql(body: SqlRequest, user: AuthUser):
    if not _SAFE_SQL_PATTERN.match(body.sql):
        raise HTTPException(
            status_code=400,
            detail="Only SELECT / WITH / EXPLAIN statements are allowed",
        )
    schema = body.schema or schema_for_tenant(user.client_id, user.domain)
    try:
        rows = execute_query(body.sql, schema=schema)
        return {"rows": rows, "row_count": len(rows)}
    except Exception as exc:
        logger.error("Admin SQL error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/schema", dependencies=[AdminOnly])
def get_schema(user: AuthUser):
    """Return table + column list for the user's tenant schema."""
    schema = schema_for_tenant(user.client_id, user.domain)
    rows = execute_query(
        """
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = %s
        ORDER BY table_name, ordinal_position
        """,
        (schema,),
    )
    tables: dict = {}
    for row in rows:
        t = row["table_name"]
        tables.setdefault(t, []).append({"column": row["column_name"], "type": row["data_type"]})
    return {"schema": schema, "tables": tables}


@router.get("/tenants", dependencies=[AdminOnly])
def list_tenants(user: AuthUser):
    rows = execute_query("SELECT * FROM auth.clients ORDER BY client_id")
    return {"tenants": [dict(r) for r in rows]}

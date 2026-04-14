"""
Insights router — hierarchy-aware push insights (pre-computed by background engine).
"""
from fastapi import APIRouter, HTTPException
from app.core.dependencies import AuthUser
from app.database.postgresql import execute_query, execute_write

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("")
def get_insights(user: AuthUser, limit: int = 20):
    """Return insights scoped to the user's hierarchy level + tenant."""
    rows = execute_query(
        """
        SELECT i.insight_id, i.title, i.description, i.insight_type,
               i.priority, i.suggested_action, i.suggested_query,
               i.created_at, i.expires_at,
               COALESCE(r.read_at IS NOT NULL, FALSE) AS is_read
        FROM auth.insights i
        LEFT JOIN auth.insight_reads r
               ON r.insight_id = i.insight_id AND r.user_id = %s
        WHERE i.client_id = %s
          AND i.domain = %s
          AND (i.hierarchy_level IS NULL OR i.hierarchy_level = %s)
          AND (i.expires_at IS NULL OR i.expires_at > NOW())
        ORDER BY i.priority DESC, i.created_at DESC
        LIMIT %s
        """,
        (
            user.user_id,
            user.client_id,
            user.domain,
            user.sales_hierarchy_level or "NSM",
            limit,
        ),
    )
    return {"insights": [dict(r) for r in rows]}


@router.get("/count")
def insight_count(user: AuthUser):
    """Unread insight count (for badge in UI)."""
    rows = execute_query(
        """
        SELECT COUNT(*) AS cnt
        FROM auth.insights i
        LEFT JOIN auth.insight_reads r
               ON r.insight_id = i.insight_id AND r.user_id = %s
        WHERE i.client_id = %s
          AND i.domain = %s
          AND r.read_at IS NULL
          AND (i.expires_at IS NULL OR i.expires_at > NOW())
        """,
        (user.user_id, user.client_id, user.domain),
    )
    return {"unread_count": rows[0]["cnt"] if rows else 0}


@router.post("/{insight_id}/read")
def mark_read(insight_id: str, user: AuthUser):
    """Mark a specific insight as read for this user."""
    execute_write(
        """
        INSERT INTO auth.insight_reads (insight_id, user_id, read_at)
        VALUES (%s, %s, NOW())
        ON CONFLICT (insight_id, user_id) DO NOTHING
        """,
        (insight_id, user.user_id),
    )
    return {"status": "ok"}

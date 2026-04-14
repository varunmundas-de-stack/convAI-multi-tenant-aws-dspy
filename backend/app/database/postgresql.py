"""
PostgreSQL connection pool — shared across the FastAPI app lifecycle.
Uses psycopg2 for synchronous operations (compatible with DSPy's sync pipeline).
"""
import contextlib
import logging
from typing import Generator
import psycopg2
import psycopg2.pool
from psycopg2.extras import RealDictCursor

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Thread-safe connection pool (min=2, max=20)
_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def init_pool() -> None:
    global _pool
    _pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=2,
        maxconn=20,
        dsn=settings.POSTGRES_DSN,
    )
    logger.info("PostgreSQL connection pool initialised — DSN: %s", settings.POSTGRES_DSN)


def close_pool() -> None:
    global _pool
    if _pool:
        _pool.closeall()
        _pool = None
        logger.info("PostgreSQL connection pool closed")


@contextlib.contextmanager
def get_conn() -> Generator:
    """Context manager: borrows a connection from pool, auto-returns on exit."""
    assert _pool is not None, "PostgreSQL pool not initialised — call init_pool() first"
    conn = _pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)


@contextlib.contextmanager
def get_cursor(conn=None):
    """Context manager yielding a RealDictCursor (rows as dicts)."""
    if conn is not None:
        yield conn.cursor(cursor_factory=RealDictCursor)
    else:
        with get_conn() as _conn:
            yield _conn.cursor(cursor_factory=RealDictCursor)


def execute_query(sql: str, params=None, schema: str | None = None) -> list[dict]:
    """
    Execute a read query, optionally setting search_path to a tenant schema.
    Returns list of row dicts.
    """
    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if schema:
                cur.execute(f"SET search_path TO {schema}, public")
            cur.execute(sql, params or ())
            return [dict(row) for row in cur.fetchall()]


def execute_write(sql: str, params=None, schema: str | None = None) -> int:
    """Execute a write statement, returns rowcount."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            if schema:
                cur.execute(f"SET search_path TO {schema}, public")
            cur.execute(sql, params or ())
            return cur.rowcount


# ── Tenant schema name mapping ────────────────────────────────────────────────
TENANT_SCHEMAS: dict[str, str] = {
    "nestle":   "cpg_nestle",
    "unilever": "cpg_unilever",
    "itc":      "cpg_itc",
}

COLD_CHAIN_SCHEMAS: dict[str, str] = {
    # Populated when cold chain client is onboarded
}


def schema_for_tenant(client_id: str, domain: str = "cpg") -> str:
    if domain == "cold_chain":
        schema = COLD_CHAIN_SCHEMAS.get(client_id)
    else:
        schema = TENANT_SCHEMAS.get(client_id)
    if not schema:
        raise ValueError(f"Unknown tenant '{client_id}' for domain '{domain}'")
    return schema

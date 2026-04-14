"""
Audit logging — every query attributed to user + role + tenant.
Writes to auth.audit_log in PostgreSQL (persistent, queryable).
"""
import logging
from datetime import datetime, timezone

from app.database.postgresql import execute_write

logger = logging.getLogger(__name__)


class AuditLogger:
    _instance = None

    @classmethod
    def get(cls) -> "AuditLogger":
        if cls._instance is None:
            cls._instance = AuditLogger()
        return cls._instance

    def log_query(
        self,
        user_id: str,
        username: str,
        client_id: str,
        domain: str,
        question: str,
        cube_query: str | None,
        success: bool,
        error_message: str | None = None,
        execution_time_ms: int | None = None,
        session_id: str | None = None,
    ) -> None:
        try:
            execute_write(
                """
                INSERT INTO auth.audit_log
                  (user_id, username, client_id, domain, question,
                   cube_query, success, error_message, execution_time_ms,
                   session_id, created_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    user_id, username, client_id, domain, question,
                    cube_query, success, error_message, execution_time_ms,
                    session_id, datetime.now(timezone.utc),
                ),
            )
        except Exception as exc:
            # Never let audit failure break the user's query
            logger.error("Audit log write failed: %s", exc)

    def log_login(self, user_id: str, username: str, client_id: str, ip_address: str | None = None) -> None:
        try:
            execute_write(
                """
                INSERT INTO auth.audit_log
                  (user_id, username, client_id, domain, question,
                   cube_query, success, error_message, created_at)
                VALUES (%s,%s,%s,'auth','LOGIN',NULL,TRUE,NULL,%s)
                """,
                (user_id, username, client_id, datetime.now(timezone.utc)),
            )
        except Exception as exc:
            logger.error("Login audit log failed: %s", exc)

"""
Redis client — QCO (conversation context) + pipeline state (clarification resumption).
Uses redis-py synchronous client to stay compatible with DSPy's sync pipeline.
"""
import json
import logging
from typing import Any, Optional
import redis

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_client: redis.Redis | None = None


def init_redis() -> None:
    global _client
    _client = redis.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        db=settings.REDIS_DB,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
    )
    _client.ping()
    logger.info("Redis connected at %s:%d", settings.REDIS_HOST, settings.REDIS_PORT)


def close_redis() -> None:
    global _client
    if _client:
        _client.close()
        _client = None


def get_redis() -> redis.Redis:
    assert _client is not None, "Redis not initialised — call init_redis() first"
    return _client


# ── QCO helpers (conversation context per session) ────────────────────────────

def _qco_key(session_id: str) -> str:
    return f"qco:{session_id}"


def save_qco(session_id: str, qco: dict) -> None:
    r = get_redis()
    r.setex(_qco_key(session_id), settings.REDIS_QCO_TTL_SECONDS, json.dumps(qco))


def load_qco(session_id: str) -> Optional[dict]:
    r = get_redis()
    raw = r.get(_qco_key(session_id))
    return json.loads(raw) if raw else None


def delete_qco(session_id: str) -> None:
    get_redis().delete(_qco_key(session_id))


# ── Pipeline state helpers (clarification pause/resume) ───────────────────────

def _state_key(request_id: str) -> str:
    return f"pipeline_state:{request_id}"


def save_pipeline_state(request_id: str, state: dict) -> None:
    r = get_redis()
    r.setex(_state_key(request_id), settings.REDIS_PIPELINE_STATE_TTL, json.dumps(state))


def load_pipeline_state(request_id: str) -> Optional[dict]:
    r = get_redis()
    raw = r.get(_state_key(request_id))
    return json.loads(raw) if raw else None


def delete_pipeline_state(request_id: str) -> None:
    get_redis().delete(_state_key(request_id))


# ── Query result cache (5 min TTL, keyed by tenant+user+question) ─────────────

def _cache_key(client_id: str, username: str, question: str, domain: str) -> str:
    import hashlib
    h = hashlib.md5(f"{client_id}:{username}:{question}:{domain}".encode()).hexdigest()
    return f"query_cache:{h}"


def cache_query_result(
    client_id: str, username: str, question: str, domain: str, result: Any
) -> None:
    key = _cache_key(client_id, username, question, domain)
    get_redis().setex(key, settings.QUERY_CACHE_TTL_SECONDS, json.dumps(result))


def get_cached_query_result(
    client_id: str, username: str, question: str, domain: str
) -> Optional[Any]:
    key = _cache_key(client_id, username, question, domain)
    raw = get_redis().get(key)
    return json.loads(raw) if raw else None

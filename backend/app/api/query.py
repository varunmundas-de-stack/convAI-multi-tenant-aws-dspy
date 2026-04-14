"""
Query router — NL query execution (streaming SSE + standard), clarification, retry.
SSE streaming gives real-time progress: intent → validate → rls → exec → format → result.
"""
import json
import logging
import time
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.dependencies import AuthUser
from app.database.redis_client import (
    get_cached_query_result, cache_query_result,
    load_pipeline_state, delete_pipeline_state,
)
from app.security.audit import AuditLogger
from app.services.query_orchestrator import QueryOrchestrator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/query", tags=["query"])

# ── Request / response models ─────────────────────────────────────────────────

class QueryRequest(BaseModel):
    question: str
    session_id: str | None = None
    domain: str = "cpg"


class ClarifyRequest(BaseModel):
    request_id: str
    answers: dict
    session_id: str | None = None


class RetryRequest(BaseModel):
    original_request_id: str
    modified_query: str
    session_id: str | None = None


# ── Out-of-scope keyword check ────────────────────────────────────────────────

_OOS_KEYWORDS = [
    "who are you", "what is your name", "hello", "hi there",
    "weather", "tell me a joke", "capital of",
]

def _is_out_of_scope(question: str) -> bool:
    q = question.lower()
    return any(kw in q for kw in _OOS_KEYWORDS)


# ── SSE event generator ───────────────────────────────────────────────────────

async def _stream_query(
    question: str,
    user: AuthUser,
    session_id: str,
    domain: str,
) -> AsyncGenerator[str, None]:

    def sse(event: str, data: dict) -> str:
        return f"data: {json.dumps({'event': event, **data})}\n\n"

    request_id = str(uuid.uuid4())
    start = time.time()

    try:
        # Step 0: scope check
        if _is_out_of_scope(question):
            yield sse("error", {"message": "This question is outside the analytics scope.", "out_of_scope": True})
            return

        # Step 1: cache check
        cached = get_cached_query_result(user.client_id, user.username, question, domain)
        if cached:
            yield sse("result", {"data": cached, "from_cache": True})
            return

        yield sse("progress", {"step": "intent", "message": "Parsing your question…"})

        # Step 2: run DSPy pipeline + RLS + Cube
        orchestrator = QueryOrchestrator(
            client_id=user.client_id,
            domain=domain,
            user=user,
        )
        result = orchestrator.execute(question, session_id=session_id, request_id=request_id)

        # Clarification requested — pause and return to frontend
        if result.get("stage") == "CLARIFICATION_REQUESTED":
            yield sse("clarification", {
                "request_id": result["request_id"],
                "missing_fields": result.get("missing_fields", []),
                "message": result.get("message", ""),
            })
            return

        yield sse("progress", {"step": "exec", "message": "Running analytics…"})
        yield sse("progress", {"step": "format", "message": "Generating insights…"})

        # Cache successful result
        if result.get("success"):
            cache_query_result(user.client_id, user.username, question, domain, result)

        elapsed_ms = int((time.time() - start) * 1000)
        AuditLogger.get().log_query(
            user.user_id, user.username, user.client_id, domain,
            question, json.dumps(result.get("cube_query")),
            success=result.get("success", False),
            execution_time_ms=elapsed_ms,
            session_id=session_id,
        )

        yield sse("result", {"data": result, "request_id": request_id})

    except Exception as exc:
        logger.exception("Query stream error: %s", exc)
        AuditLogger.get().log_query(
            user.user_id, user.username, user.client_id, domain,
            question, None, success=False, error_message=str(exc), session_id=session_id,
        )
        yield sse("error", {"message": "An error occurred processing your query.", "detail": str(exc)})


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/stream")
async def query_stream(body: QueryRequest, user: AuthUser):
    """SSE streaming query — returns real-time progress events then final result."""
    session_id = body.session_id or str(uuid.uuid4())
    return StreamingResponse(
        _stream_query(body.question, user, session_id, body.domain),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("")
def query(body: QueryRequest, user: AuthUser):
    """Standard (non-streaming) query endpoint."""
    if _is_out_of_scope(body.question):
        raise HTTPException(status_code=400, detail="Question is outside analytics scope")

    cached = get_cached_query_result(user.client_id, user.username, body.question, body.domain)
    if cached:
        return {"data": cached, "from_cache": True}

    session_id = body.session_id or str(uuid.uuid4())
    orchestrator = QueryOrchestrator(
        client_id=user.client_id,
        domain=body.domain,
        user=user,
    )
    result = orchestrator.execute(body.question, session_id=session_id)

    if result.get("success"):
        cache_query_result(user.client_id, user.username, body.question, body.domain, result)

    AuditLogger.get().log_query(
        user.user_id, user.username, user.client_id, body.domain,
        body.question, json.dumps(result.get("cube_query")),
        success=result.get("success", False),
        session_id=session_id,
    )
    return result


@router.post("/clarify")
def clarify(body: ClarifyRequest, user: AuthUser):
    """Resume pipeline after user has answered clarification questions."""
    state = load_pipeline_state(body.request_id)
    if not state:
        raise HTTPException(status_code=404, detail="Clarification state not found or expired")

    orchestrator = QueryOrchestrator(
        client_id=user.client_id,
        domain=state.get("domain", "cpg"),
        user=user,
    )
    result = orchestrator.resume_clarification(body.request_id, body.answers, body.session_id)
    delete_pipeline_state(body.request_id)
    return result


@router.post("/retry")
def retry(body: RetryRequest, user: AuthUser):
    """Retry with a user-modified query (RLHF correction flow)."""
    session_id = body.session_id or str(uuid.uuid4())
    orchestrator = QueryOrchestrator(
        client_id=user.client_id,
        domain="cpg",
        user=user,
    )
    return orchestrator.execute(body.modified_query, session_id=session_id)


@router.get("/suggestions")
def suggestions(user: AuthUser):
    """Hardcoded starter suggestions per domain."""
    cpg = [
        "What were total secondary sales last month?",
        "Show top 5 brands by revenue this quarter",
        "Which state had highest discount % in Q1?",
        "Compare Nestlé vs HUL sales YoY",
        "Show week-on-week trend for instant noodles",
    ]
    cold_chain = [
        "How many temperature excursions occurred last week?",
        "Which distribution center had most compliance failures?",
        "Show lot expiry risk by facility this month",
    ]
    return {"cpg": cpg, "cold_chain": cold_chain}

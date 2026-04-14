"""
QueryOrchestrator — the central integration point.

Flow:
  1. Load QCO (conversation context) from Redis
  2. Run DSPy 9-agent pipeline → Intent
  3. IntentAdapter translates Intent → Cube.js query
  4. RLS injects tenant/hierarchy filters
  5. CubeClient executes query
  6. InsightEngine generates narrative + VisualSpec
  7. Save updated QCO to Redis
  8. Return unified response dict

Clarification: if DSPy pipeline halts with CLARIFICATION_REQUESTED,
orchestrator saves pipeline state to Redis and returns the halt payload.
The /query/clarify endpoint resumes from saved state.
"""
from __future__ import annotations
import logging
import time
import uuid
from typing import Any, Optional

from app.core.config import get_settings
from app.core.dependencies import CurrentUser
from app.database.redis_client import (
    load_qco, save_qco,
    save_pipeline_state, load_pipeline_state,
)
from app.security.rls import RowLevelSecurity
from app.services.intent.intent_adapter import IntentAdapter
from app.services.cube.cube_client import CubeClient
from app.services.insights.insight_engine import InsightEngine
from app.services.insights.visual_spec_generator import VisualSpecGenerator
from app.core.security import create_cubejs_token

logger = logging.getLogger(__name__)
settings = get_settings()


class QueryOrchestrator:
    """
    Per-request orchestrator — instantiated with client_id, domain, and user context.
    """

    def __init__(self, client_id: str, domain: str, user: CurrentUser):
        self.client_id = client_id
        self.domain = domain
        self.user = user
        self.adapter = IntentAdapter(domain=domain)
        self._cube_token = create_cubejs_token({
            "client_id": client_id,
            "username": user.username,
            "role": user.role,
            "hierarchy_code": user.hierarchy_code,
        })
        self.cube = CubeClient(api_secret=self._cube_token)

    def execute(
        self,
        question: str,
        session_id: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> dict:
        request_id = request_id or str(uuid.uuid4())
        start = time.time()

        # Step 1: Load conversation context (QCO)
        qco = load_qco(session_id) if session_id else None

        # Step 2: Run DSPy pipeline
        try:
            intent_result = self._run_dspy_pipeline(question, qco, session_id, request_id)
        except _ClarificationHalt as halt:
            return {
                "stage": "CLARIFICATION_REQUESTED",
                "request_id": halt.request_id,
                "missing_fields": halt.missing_fields,
                "message": halt.message,
                "success": False,
            }
        except Exception as exc:
            logger.exception("DSPy pipeline error: %s", exc)
            return {"success": False, "error": str(exc)}

        # Step 3: Adapt Intent → Cube.js query
        cube_query = self.adapter.adapt(intent_result)

        # Step 4: Inject RLS filters
        cube_query = RowLevelSecurity.inject_into_cube_query(cube_query, self.user)

        # Step 5: Execute Cube.js query
        try:
            cube_resp = self.cube.load(cube_query)
        except Exception as exc:
            logger.error("Cube.js execution failed: %s", exc)
            return {"success": False, "error": "Analytics backend unavailable", "cube_query": cube_query}

        data_rows = cube_resp.data

        # Step 6: Generate insights + VisualSpec
        insights = InsightEngine().generate(data_rows, intent_result)
        visual_spec = VisualSpecGenerator().generate(data_rows, intent_result)

        # Serialize Pydantic models to dicts for JSON caching
        insights_dict = insights.model_dump() if hasattr(insights, "model_dump") else (insights.dict() if hasattr(insights, "dict") else insights)
        visual_spec_dict = visual_spec.model_dump() if hasattr(visual_spec, "model_dump") else (visual_spec.dict() if hasattr(visual_spec, "dict") else visual_spec)

        # Step 7: Update QCO for next turn
        if session_id:
            updated_qco = self._update_qco(qco, question, intent_result, data_rows)
            save_qco(session_id, updated_qco)

        elapsed_ms = int((time.time() - start) * 1000)

        return {
            "success": True,
            "request_id": request_id,
            "question": question,
            "intent": intent_result if isinstance(intent_result, dict) else vars(intent_result),
            "cube_query": cube_query,
            "data": data_rows,
            "row_count": len(data_rows),
            "insights": insights_dict,
            "visual_spec": visual_spec_dict,
            "execution_time_ms": elapsed_ms,
            "domain": self.domain,
            "stage": "COMPLETED",
        }

    def resume_clarification(
        self,
        request_id: str,
        answers: dict,
        session_id: Optional[str] = None,
    ) -> dict:
        """Resume DSPy pipeline from saved clarification state."""
        state = load_pipeline_state(request_id)
        if not state:
            return {"success": False, "error": "Clarification state expired or not found"}

        # Merge user answers into the saved intent snapshot
        saved_intent = state.get("intent_snapshot", {})
        saved_intent.update(answers)

        # Re-execute from the merged intent (skip DSPy re-run)
        cube_query = self.adapter.adapt(saved_intent)
        cube_query = RowLevelSecurity.inject_into_cube_query(cube_query, self.user)

        try:
            cube_resp = self.cube.load(cube_query)
        except Exception as exc:
            return {"success": False, "error": str(exc)}

        data_rows = cube_resp.data
        insights = InsightEngine().generate(data_rows, saved_intent)
        visual_spec = VisualSpecGenerator().generate(data_rows, saved_intent)
        insights_dict = insights.model_dump() if hasattr(insights, "model_dump") else (insights.dict() if hasattr(insights, "dict") else insights)
        visual_spec_dict = visual_spec.model_dump() if hasattr(visual_spec, "model_dump") else (visual_spec.dict() if hasattr(visual_spec, "dict") else visual_spec)

        if session_id:
            qco = load_qco(session_id)
            updated_qco = self._update_qco(
                qco, state.get("original_question", ""), saved_intent, data_rows
            )
            save_qco(session_id, updated_qco)

        return {
            "success": True,
            "request_id": request_id,
            "data": data_rows,
            "row_count": len(data_rows),
            "insights": insights_dict,
            "visual_spec": visual_spec_dict,
            "stage": "COMPLETED",
            "resumed_from_clarification": True,
        }

    # ── Private ───────────────────────────────────────────────────────────

    def _run_dspy_pipeline(
        self,
        question: str,
        qco: Optional[dict],
        session_id: Optional[str],
        request_id: str,
    ) -> Any:
        """
        Run the DSPy 9-agent pipeline.
        Import here to keep startup fast and allow lazy DSPy LM configuration.
        """
        try:
            from app.dspy_pipeline.pipeline import IntentExtractionPipeline
            from app.dspy_pipeline.config import configure_dspy_model, get_dspy_pipeline
            from app.dspy_pipeline.clarification_tool import ClarificationRequired
            from datetime import date as _date

            configure_dspy_model()
            pipeline = get_dspy_pipeline()
            result = pipeline.forward(
                query=question,
                current_date=_date.today(),
                previous_context=qco or {},
                request_id=request_id,
            )

            # Check for clarification result (dict with CLARIFICATION_REQUESTED stage)
            if isinstance(result, dict) and result.get("stage") == "CLARIFICATION_REQUESTED":
                save_pipeline_state(request_id, {
                    "intent_snapshot": result.get("intent", {}),
                    "original_question": question,
                    "missing_fields": result.get("missing_fields", []),
                    "message": result.get("message", ""),
                    "domain": self.domain,
                })
                raise _ClarificationHalt(
                    request_id=request_id,
                    missing_fields=result.get("missing_fields", []),
                    message=result.get("message", "Please clarify your question"),
                )

            # Return Intent as dict
            if hasattr(result, "model_dump"):
                return result.model_dump()
            elif hasattr(result, "dict"):
                return result.dict()
            return result

        except _ClarificationHalt:
            raise
        except ClarificationRequired as cr:
            save_pipeline_state(request_id, {
                "intent_snapshot": {},
                "original_question": question,
                "missing_fields": getattr(cr, "missing_fields", []),
                "message": getattr(cr, "message", "Please clarify your question"),
                "domain": self.domain,
            })
            raise _ClarificationHalt(
                request_id=request_id,
                missing_fields=getattr(cr, "missing_fields", []),
                message=getattr(cr, "message", "Please clarify your question"),
            )
        except ImportError:
            logger.warning("DSPy pipeline not available (ImportError), using fallback intent")
            return self._fallback_intent(question)
        except Exception as exc:
            logger.warning("DSPy pipeline failed (%s: %s), using fallback intent", type(exc).__name__, exc)
            return self._fallback_intent(question)

    def _fallback_intent(self, question: str) -> dict:
        """Keyword-based fallback when DSPy pipeline is unavailable or fails."""
        import re
        q = question.lower()

        # Metric
        metric = "secondary_sales_value"
        if any(k in q for k in ("volume", "units", "quantity", "cases")):
            metric = "secondary_sales_volume"
        elif "discount" in q:
            metric = "discount_amount"
        elif "margin" in q:
            metric = "margin_amount"
        elif any(k in q for k in ("gross", "gross value")):
            metric = "gross_sales_value"

        # Time window — look for common patterns
        time_window = "last_365_days"
        granularity = "month"
        if any(k in q for k in ("last month", "previous month", "past month")):
            time_window = "last month"
        elif any(k in q for k in ("this month", "current month", "mtd", "month to date")):
            time_window = "this month"
        elif any(k in q for k in ("last quarter", "previous quarter")):
            time_window = "last quarter"
            granularity = "week"
        elif any(k in q for k in ("this quarter", "current quarter", "qtd")):
            time_window = "this quarter"
            granularity = "week"
        elif any(k in q for k in ("last year", "previous year")):
            time_window = "last year"
        elif any(k in q for k in ("this year", "current year", "ytd", "year to date")):
            time_window = "this year"
        elif any(k in q for k in ("last 30", "past 30", "30 days")):
            time_window = "last 30 days"
        elif any(k in q for k in ("last 90", "past 90", "90 days", "3 months")):
            time_window = "last 90 days"
        elif any(k in q for k in ("last 6 months", "6 months", "half year")):
            time_window = "last 6 months"
        elif re.search(r'\bin 20\d\d\b', q):
            yr = re.search(r'\b(20\d\d)\b', q).group(1)
            time_window = f"from {yr}-01-01 to {yr}-12-31"
        elif any(k in q for k in ("trend", "weekly", "week by week")):
            granularity = "week"

        # Group by / dimensions
        group_by = []
        if "brand" in q:
            group_by.append("DimProduct.brandName")
        if "category" in q or "categories" in q:
            group_by.append("DimProduct.categoryName")
        if any(k in q for k in ("zone", "region")):
            group_by.append("DimGeography.zoneName")
        if any(k in q for k in ("state", "states")):
            group_by.append("DimGeography.stateName")
        if any(k in q for k in ("channel", "channels")):
            group_by.append("DimChannel.channelName")
        if any(k in q for k in ("so", "sales officer", "outlet")):
            group_by.append("DimSalesHierarchy.soCode")

        return {
            "metrics": [metric],
            "group_by": group_by,
            "time_context": {"time_window": time_window, "granularity": granularity},
            "filters": [],
        }

    def _update_qco(
        self,
        existing_qco: Optional[dict],
        question: str,
        intent: Any,
        data_rows: list,
    ) -> dict:
        """Build updated QCO for next conversational turn."""
        if isinstance(intent, dict):
            intent_dict = intent
        else:
            try:
                intent_dict = vars(intent)
            except TypeError:
                intent_dict = {}

        qco = dict(existing_qco) if existing_qco else {}
        qco["last_question"] = question
        qco["last_intent"] = intent_dict
        qco["last_dimensions"] = intent_dict.get("group_by", [])
        qco["last_filters"] = intent_dict.get("filters", [])
        qco["last_time_context"] = intent_dict.get("time_context") or intent_dict.get("time", {})
        qco["last_row_count"] = len(data_rows)
        return qco


class _ClarificationHalt(Exception):
    def __init__(self, request_id: str, missing_fields: list, message: str):
        self.request_id = request_id
        self.missing_fields = missing_fields
        self.message = message

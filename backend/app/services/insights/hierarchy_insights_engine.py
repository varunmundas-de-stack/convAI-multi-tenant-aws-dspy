"""
HierarchyInsightsEngine — background thread generating hierarchy-aware insights.

Runs every INSIGHTS_REFRESH_INTERVAL_HOURS hours.
Generates insights scoped by hierarchy level (SO/ASM/ZSM/NSM) and tenant.
Stores in auth.insights + auth.insight_reads in PostgreSQL.
"""
from __future__ import annotations
import logging
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone

from app.core.config import get_settings
from app.database.postgresql import execute_query, execute_write

logger = logging.getLogger(__name__)
settings = get_settings()

_HIERARCHY_LEVELS = ["SO", "ASM", "ZSM", "NSM"]

_CPG_TENANTS = ["nestle", "unilever", "itc"]
_CPG_SCHEMAS = {"nestle": "cpg_nestle", "unilever": "cpg_unilever", "itc": "cpg_itc"}


class HierarchyInsightsEngine:
    """Generates pre-computed insights for each hierarchy level and tenant."""

    def __init__(self):
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._thread = threading.Thread(
            target=self._run_loop, daemon=True, name="insights-engine"
        )
        self._thread.start()
        logger.info("HierarchyInsightsEngine started (interval=%dh)", settings.INSIGHTS_REFRESH_INTERVAL_HOURS)

    def stop(self) -> None:
        self._stop_event.set()

    def _run_loop(self) -> None:
        # Run once immediately on startup
        self._generate_all()
        while not self._stop_event.wait(settings.INSIGHTS_REFRESH_INTERVAL_HOURS * 3600):
            self._generate_all()

    def _generate_all(self) -> None:
        logger.info("Generating insights for all tenants…")
        for client_id in _CPG_TENANTS:
            try:
                self._generate_for_tenant(client_id, "cpg")
            except Exception as exc:
                logger.error("Insights generation failed for %s: %s", client_id, exc)
        logger.info("Insights generation complete")

    def _generate_for_tenant(self, client_id: str, domain: str) -> None:
        schema = _CPG_SCHEMAS.get(client_id)
        if not schema:
            return

        insights = []
        expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.INSIGHTS_REFRESH_INTERVAL_HOURS * 2)

        # ── NSM-level: national KPIs ────────────────────────────────────
        try:
            rows = execute_query(
                f"""
                SELECT
                    ROUND(SUM(net_value)::numeric / 1e6, 2) AS total_sales_m,
                    COUNT(DISTINCT invoice_number) AS invoice_count,
                    ROUND(AVG(net_value)::numeric, 0) AS avg_invoice_value
                FROM {schema}.fact_secondary_sales
                WHERE invoice_date >= CURRENT_DATE - INTERVAL '7 days'
                """
            )
            if rows:
                r = rows[0]
                insights.append({
                    "hierarchy_level": "NSM",
                    "title": "National Sales — Last 7 Days",
                    "description": (
                        f"Total sales ₹{r.get('total_sales_m', 0)}M across "
                        f"{r.get('invoice_count', 0):,} invoices. "
                        f"Avg invoice value: ₹{r.get('avg_invoice_value', 0):,}."
                    ),
                    "insight_type": "snapshot",
                    "priority": 3,
                    "suggested_query": "What are total secondary sales this week?",
                })
        except Exception as exc:
            logger.debug("NSM insight query failed for %s: %s", client_id, exc)

        # ── NSM-level: top zone by revenue ──────────────────────────────
        try:
            rows = execute_query(
                f"""
                SELECT sh.zone_name, ROUND(SUM(fs.net_value)::numeric / 1e6, 2) AS sales_m
                FROM {schema}.fact_secondary_sales fs
                JOIN {schema}.dim_sales_hierarchy sh ON sh.hierarchy_key = fs.sales_hierarchy_key
                WHERE fs.invoice_date >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY sh.zone_name
                ORDER BY sales_m DESC
                LIMIT 1
                """
            )
            if rows:
                r = rows[0]
                insights.append({
                    "hierarchy_level": "NSM",
                    "title": "Top Zone Last 30 Days",
                    "description": f"Zone '{r.get('zone_name')}' led with ₹{r.get('sales_m', 0)}M in secondary sales.",
                    "insight_type": "trend",
                    "priority": 2,
                    "suggested_query": f"Show sales by zone last 30 days",
                })
        except Exception as exc:
            logger.debug("Top zone insight failed for %s: %s", client_id, exc)

        # ── ZSM-level: zone-level WoW ────────────────────────────────────
        try:
            rows = execute_query(
                f"""
                SELECT
                    ROUND(SUM(CASE WHEN invoice_date >= CURRENT_DATE - INTERVAL '7 days' THEN net_value ELSE 0 END)::numeric/1e6, 2) AS this_week,
                    ROUND(SUM(CASE WHEN invoice_date >= CURRENT_DATE - INTERVAL '14 days'
                                    AND invoice_date < CURRENT_DATE - INTERVAL '7 days' THEN net_value ELSE 0 END)::numeric/1e6, 2) AS last_week
                FROM {schema}.fact_secondary_sales
                """
            )
            if rows:
                r = rows[0]
                tw = float(r.get("this_week") or 0)
                lw = float(r.get("last_week") or 0)
                if lw > 0:
                    pct = round((tw - lw) / lw * 100, 1)
                    direction = "up" if pct >= 0 else "down"
                    insights.append({
                        "hierarchy_level": "ZSM",
                        "title": "Week-on-Week Sales Trend",
                        "description": f"Sales are {direction} {abs(pct)}% this week (₹{tw}M) vs last week (₹{lw}M).",
                        "insight_type": "trend" if pct >= 0 else "anomaly",
                        "priority": 4 if abs(pct) > 10 else 2,
                        "suggested_action": "Review distributor-wise breakdown" if pct < 0 else None,
                        "suggested_query": "Show week on week sales trend",
                    })
        except Exception as exc:
            logger.debug("WoW insight failed for %s: %s", client_id, exc)

        # ── Write insights to DB ─────────────────────────────────────────
        for ins in insights:
            try:
                execute_write(
                    """
                    INSERT INTO auth.insights
                      (insight_id, client_id, domain, hierarchy_level, title, description,
                       insight_type, priority, suggested_action, suggested_query,
                       created_at, expires_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),%s)
                    ON CONFLICT DO NOTHING
                    """,
                    (
                        str(uuid.uuid4()),
                        client_id, domain,
                        ins.get("hierarchy_level"),
                        ins.get("title", ""),
                        ins.get("description", ""),
                        ins.get("insight_type", "snapshot"),
                        ins.get("priority", 1),
                        ins.get("suggested_action"),
                        ins.get("suggested_query"),
                        expires_at,
                    ),
                )
            except Exception as exc:
                logger.error("Failed to write insight: %s", exc)

        logger.info("Generated %d insights for %s/%s", len(insights), client_id, domain)

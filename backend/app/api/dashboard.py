"""
Dashboard router — KPI summary + chart data for the Dashboard tab.
Queries Cube.js with RLS applied.
"""
import logging
from fastapi import APIRouter, HTTPException

from app.core.dependencies import AuthUser
from app.security.rls import RowLevelSecurity
from app.services.cube.cube_client import CubeClient
from app.core.security import create_cubejs_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _cube_token(user: AuthUser) -> str:
    return create_cubejs_token({
        "client_id": user.client_id,
        "username": user.username,
        "role": user.role,
        "hierarchy_code": user.hierarchy_code,
    })


def _cubejs_date_range(period: str) -> str:
    return period.replace("_", " ")


def _safe_float(val):
    try:
        return float(val) if val is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _safe_int(val):
    try:
        return int(float(val)) if val is not None else 0
    except (TypeError, ValueError):
        return 0


@router.get("")
def get_dashboard(user: AuthUser, period: str = "last_365_days"):
    """
    Returns KPI cards + sales trend + top brands/channels for the authenticated user's scope.
    All Cube queries have RLS filters injected.
    Keys are normalized to plain field names for the frontend.
    """
    rls_filters = RowLevelSecurity.get_cube_filters(user)
    token = _cube_token(user)
    client = CubeClient(api_secret=token)
    date_range = _cubejs_date_range(period)

    # ── KPI summary ───────────────────────────────────────────────────────
    kpi_query = {
        "measures": [
            "FactSecondarySales.totalNetValue",
            "FactSecondarySales.totalQuantity",
            "FactSecondarySales.invoiceCount",
            "FactSecondarySales.avgSellingPrice",
        ],
        "timeDimensions": [{"dimension": "FactSecondarySales.invoiceDate", "dateRange": date_range}],
        "filters": rls_filters,
    }

    # ── Weekly sales trend ────────────────────────────────────────────────
    trend_query = {
        "measures": ["FactSecondarySales.totalNetValue"],
        "timeDimensions": [{
            "dimension": "FactSecondarySales.invoiceDate",
            "dateRange": date_range,
            "granularity": "week",
        }],
        "filters": rls_filters,
        "order": {"FactSecondarySales.invoiceDate": "asc"},
    }

    # ── Top 5 brands ──────────────────────────────────────────────────────
    top_brands_query = {
        "measures": ["FactSecondarySales.totalNetValue"],
        "dimensions": ["DimProduct.brandName"],
        "timeDimensions": [{"dimension": "FactSecondarySales.invoiceDate", "dateRange": date_range}],
        "filters": rls_filters,
        "order": {"FactSecondarySales.totalNetValue": "desc"},
        "limit": 5,
    }

    # ── Top 5 channels ─────────────────────────────────────────────────────
    by_channel_query = {
        "measures": ["FactSecondarySales.totalNetValue"],
        "dimensions": ["DimChannel.channelName"],
        "timeDimensions": [{"dimension": "FactSecondarySales.invoiceDate", "dateRange": date_range}],
        "filters": rls_filters,
        "order": {"FactSecondarySales.totalNetValue": "desc"},
        "limit": 5,
    }

    # ── Top 5 regions ──────────────────────────────────────────────────────
    top_region_query = {
        "measures": ["FactSecondarySales.totalNetValue"],
        "dimensions": ["DimSalesHierarchy.regionName"],
        "timeDimensions": [{"dimension": "FactSecondarySales.invoiceDate", "dateRange": date_range}],
        "filters": rls_filters,
        "order": {"FactSecondarySales.totalNetValue": "desc"},
        "limit": 5,
    }

    try:
        kpis_raw = client.load(kpi_query)
        trend_raw = client.load(trend_query)
        top_brands_raw = client.load(top_brands_query)
        by_channel_raw = client.load(by_channel_query)
        top_region_raw = client.load(top_region_query)
    except Exception as exc:
        logger.error("Dashboard Cube.js query failed: %s", exc)
        raise HTTPException(status_code=502, detail="Analytics backend unavailable")

    # ── Normalize KPIs ─────────────────────────────────────────────────────
    raw_kpis = kpis_raw.data[0] if kpis_raw.data else {}
    top_brand_row = top_brands_raw.data[0] if top_brands_raw.data else {}
    top_region_row = top_region_raw.data[0] if top_region_raw.data else {}

    kpis = {
        "total_sales": _safe_float(raw_kpis.get("FactSecondarySales.totalNetValue", 0)),
        "total_invoices": _safe_int(raw_kpis.get("FactSecondarySales.invoiceCount", 0)),
        "total_quantity": _safe_int(raw_kpis.get("FactSecondarySales.totalQuantity", 0)),
        "avg_selling_price": _safe_float(raw_kpis.get("FactSecondarySales.avgSellingPrice", 0)),
        "top_brand": top_brand_row.get("DimProduct.brandName", "—"),
        "top_region": top_region_row.get("DimSalesHierarchy.regionName", "—"),
    }

    # ── Normalize weekly trend ─────────────────────────────────────────────
    trend = [
        {
            "week": row.get("FactSecondarySales.invoiceDate.week", row.get("FactSecondarySales.invoiceDate", "")),
            "sales": _safe_float(row.get("FactSecondarySales.totalNetValue", 0)),
        }
        for row in (trend_raw.data or [])
    ]

    # ── Normalize top brands ───────────────────────────────────────────────
    by_brand = [
        {
            "brand_name": row.get("DimProduct.brandName", "Unknown"),
            "sales": _safe_float(row.get("FactSecondarySales.totalNetValue", 0)),
        }
        for row in (top_brands_raw.data or [])
    ]

    # ── Normalize by channel ───────────────────────────────────────────────
    by_channel = [
        {
            "channel_name": row.get("DimChannel.channelName", "Unknown"),
            "sales": _safe_float(row.get("FactSecondarySales.totalNetValue", 0)),
        }
        for row in (by_channel_raw.data or [])
    ]

    return {
        "period": period,
        "kpis": kpis,
        "trend": trend,
        "by_brand": by_brand,
        "by_channel": by_channel,
    }

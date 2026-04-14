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
    """Convert underscore-separated period strings to Cube.js date range format."""
    return period.replace("_", " ")


@router.get("")
def get_dashboard(user: AuthUser, period: str = "last_30_days"):
    """
    Returns KPI cards + sales trend + top brands for the authenticated user's scope.
    All Cube queries have RLS filters injected.
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

    try:
        kpis = client.load(kpi_query)
        trend = client.load(trend_query)
        top_brands = client.load(top_brands_query)
    except Exception as exc:
        logger.error("Dashboard Cube.js query failed: %s", exc)
        raise HTTPException(status_code=502, detail="Analytics backend unavailable")

    return {
        "period": period,
        "kpis": kpis.data[0] if kpis.data else {},
        "trend": trend.data,
        "top_brands": top_brands.data,
    }

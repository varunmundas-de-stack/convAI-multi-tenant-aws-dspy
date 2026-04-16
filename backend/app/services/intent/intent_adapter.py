"""
IntentAdapter — translates DSPy pipeline's Intent output into a Cube.js query dict.

This is the key integration bridge:
  DSPy Intent  →  IntentAdapter  →  Cube.js JSON query  →  RLS injection  →  Cube.js API

The DSPy agents produce a rich, validated Intent; this adapter mechanically maps it
to Cube.js measures/dimensions/filters/timeDimensions that CubeClient can execute.
"""
from __future__ import annotations
import logging
from typing import Any

logger = logging.getLogger(__name__)


# ── Mapping: Intent metric names → Cube.js measure names ─────────────────────
# Extend this for cold_chain domain when catalog is available.

METRIC_TO_CUBE_MEASURE: dict[str, str] = {
    # CPG domain
    "secondary_sales_value":  "FactSecondarySales.totalNetValue",
    "secondary_sales_volume": "FactSecondarySales.totalQuantity",
    "gross_sales_value":      "FactSecondarySales.grossSalesValue",
    "discount_amount":        "FactSecondarySales.totalDiscount",
    "margin_amount":          "FactSecondarySales.totalMargin",
    "invoice_count":          "FactSecondarySales.invoiceCount",
    "avg_selling_price":      "FactSecondarySales.avgSellingPrice",
    "return_value":           "FactSecondarySales.returnValue",
    "active_outlets":         "FactSecondarySales.activeOutlets",
    # cold_chain domain — populated when catalog is ready
    "temperature_excursions": "FactColdChain.temperatureExcursions",
    "on_time_delivery_pct":   "FactColdChain.onTimeDeliveryPct",
    "compliance_rate":        "FactColdChain.complianceRate",
    "lot_count":              "FactColdChain.lotCount",
}

# ── Mapping: dimension names → Cube.js dimension names ───────────────────────
DIM_TO_CUBE_DIM: dict[str, str] = {
    "brand_name":        "DimProduct.brandName",
    "category_name":     "DimProduct.categoryName",
    "sku_name":          "DimProduct.skuName",
    "pack_size":         "DimProduct.packSize",
    "state_name":        "DimGeography.stateName",
    "zone_name":         "DimGeography.zoneName",
    "district_name":     "DimGeography.districtName",
    "channel_name":      "DimChannel.channelName",
    "distributor_name":  "DimCustomer.distributorName",
    "outlet_type":       "DimCustomer.outletType",
    "so_code":           "DimSalesHierarchy.soCode",
    "asm_code":          "DimSalesHierarchy.asmCode",
    "zsm_code":          "DimSalesHierarchy.zsmCode",
    "week":              "DimDate.weekLabel",
    "month":             "DimDate.monthLabel",
    "quarter":           "DimDate.quarter",
    "year":              "DimDate.year",
    # cold chain
    "facility_name":     "DimFacility.facilityName",
    "facility_type":     "DimFacility.facilityType",
    "lot_number":        "DimLot.lotNumber",
    "product_name":      "DimColdProduct.productName",
    "route_name":        "DimRoute.routeName",
}

# ── Filter operator mapping ──────────────────────────────────────────────────
OPERATOR_MAP: dict[str, str] = {
    "=":           "equals",
    "!=":          "notEquals",
    ">":           "gt",
    ">=":          "gte",
    "<":           "lt",
    "<=":          "lte",
    "contains":    "contains",
    "startswith":  "startsWith",
    "in":          "equals",
    "not in":      "notEquals",
}

# ── Time dimension ────────────────────────────────────────────────────────────
TIME_DIM = "FactSecondarySales.invoiceDate"
COLD_TIME_DIM = "FactColdChain.eventDate"


class IntentAdapter:
    """
    Converts a DSPy-resolved Intent (dict or object) to a Cube.js query dict.
    Handles: metrics, dimensions, filters, time windows, sorting, ranking.
    """

    def __init__(self, domain: str = "cpg"):
        self.domain = domain
        self.time_dim = COLD_TIME_DIM if domain == "cold_chain" else TIME_DIM

    def adapt(self, intent: Any) -> dict:
        """
        Main entry point.
        intent can be:
          - a dict (from DSPy pipeline's .to_dict())
          - an object with attributes
        Returns a Cube.js query dict ready for CubeClient.execute().
        """
        if hasattr(intent, "__dict__"):
            intent = intent.__dict__

        cube_query: dict = {}

        # Measures
        measures = self._resolve_measures(intent)
        if measures:
            cube_query["measures"] = measures

        # Dimensions
        dimensions = self._resolve_dimensions(intent)
        if dimensions:
            cube_query["dimensions"] = dimensions

        # Time dimensions
        time_dims = self._resolve_time(intent)
        if time_dims:
            cube_query["timeDimensions"] = time_dims

        # Filters
        filters = self._resolve_filters(intent)
        if filters:
            cube_query["filters"] = filters

        # Order + limit (ranking, top-N)
        order, limit = self._resolve_order(intent)
        if order:
            cube_query["order"] = order
        if limit:
            cube_query["limit"] = limit

        logger.debug("IntentAdapter output: %s", cube_query)
        return cube_query

    # ── Private helpers ───────────────────────────────────────────────────

    def _resolve_measures(self, intent: dict) -> list[str]:
        measures = []
        # DSPy pipeline populates intent.metrics or intent.metric_request
        metrics = intent.get("metrics") or []
        if not metrics:
            mr = intent.get("metric_request") or {}
            primary = mr.get("primary_metric") or intent.get("primary_metric")
            if primary:
                metrics = [primary]
            secondary = mr.get("secondary_metrics") or []
            metrics += secondary

        for m in metrics:
            name = m if isinstance(m, str) else m.get("name") or m.get("metric")
            if name:
                cube_m = METRIC_TO_CUBE_MEASURE.get(name)
                if cube_m:
                    measures.append(cube_m)
                else:
                    logger.warning("Unknown metric '%s' — skipping", name)
        return measures

    def _resolve_dimensions(self, intent: dict) -> list[str]:
        dims = []
        group_by = intent.get("group_by") or intent.get("dimensionality", {}).get("group_by") or []
        for d in group_by:
            name = d if isinstance(d, str) else d.get("name") or d.get("dimension")
            if name:
                cube_d = DIM_TO_CUBE_DIM.get(name)
                if cube_d:
                    dims.append(cube_d)
                elif "." in name:
                    # Already a fully-qualified Cube.js dimension (e.g. DimProduct.brandName)
                    dims.append(name)
                else:
                    logger.warning("Unknown dimension '%s' — skipping", name)
        return dims

    def _resolve_time(self, intent: dict) -> list[dict]:
        tc = intent.get("time_context") or intent.get("time") or {}
        if not tc:
            return []

        time_entry: dict = {"dimension": self.time_dim}

        window = tc.get("time_window") or tc.get("window")
        start = tc.get("start_date")
        end = tc.get("end_date")
        grain = tc.get("granularity") or tc.get("grain")

        if start and end:
            time_entry["dateRange"] = [str(start), str(end)]
        elif window:
            # Map named windows to Cube.js date range strings
            time_entry["dateRange"] = self._map_window(window)

        if grain and grain not in ("none", "auto"):
            time_entry["granularity"] = grain

        return [time_entry]

    def _map_window(self, window: str) -> str:
        mapping = {
            "last_7_days":    "last 7 days",
            "last_14_days":   "last 14 days",
            "last_28_days":   "last 28 days",
            "last_30_days":   "last 30 days",
            "last_60_days":   "last 60 days",
            "last_90_days":   "last 90 days",
            "last_120_days":  "last 120 days",
            "last_180_days":  "last 180 days",
            "last_365_days":  "last 365 days",
            "last_4_weeks":   "last 4 weeks",
            "last_12_weeks":  "last 12 weeks",
            "this_month":     "this month",
            "last_month":     "last month",
            "this_quarter":   "this quarter",
            "last_quarter":   "last quarter",
            "this_year":      "this year",
            "last_year":      "last year",
            "ytd":            "year to date",
            "mtd":            "month to date",
        }
        # Fall back to replacing underscores with spaces so Cube.js can parse
        # any window format the LLM produces (e.g. "last_365_days" -> "last 365 days")
        return mapping.get(window, window.replace("_", " "))

    def _resolve_filters(self, intent: dict) -> list[dict]:
        raw = intent.get("filters") or []
        cube_filters = []
        for f in raw:
            dim = f.get("dimension") or f.get("member")
            op = f.get("operator", "=")
            values = f.get("values") or []
            if isinstance(values, str):
                values = [values]

            cube_dim = DIM_TO_CUBE_DIM.get(dim, dim)
            cube_op = OPERATOR_MAP.get(op, "equals")

            if cube_dim and values:
                cube_filters.append({
                    "member": cube_dim,
                    "operator": cube_op,
                    "values": [str(v) for v in values],
                })
        return cube_filters

    def _resolve_order(self, intent: dict) -> tuple[dict | None, int | None]:
        sorting = intent.get("sorting") or intent.get("post_processing") or {}
        order = None
        limit = None

        order_by = sorting.get("order_by")
        direction = sorting.get("direction", "DESC").lower()
        rank_limit = sorting.get("limit") or intent.get("limit")

        if order_by:
            cube_m = METRIC_TO_CUBE_MEASURE.get(order_by) or DIM_TO_CUBE_DIM.get(order_by) or order_by
            order = {cube_m: direction}

        if rank_limit:
            limit = int(rank_limit)

        return order, limit

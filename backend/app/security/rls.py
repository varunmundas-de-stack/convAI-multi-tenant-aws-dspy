"""
Row-Level Security — injects WHERE-clause filters into Cube.js queries
based on user's role and sales hierarchy position.

Priority:
  1. Sales hierarchy codes (most restrictive — field-level users)
  2. Geographic codes (state/zone/district)
  3. National access (admin, NSM, analyst)
"""
from dataclasses import dataclass, field
from typing import Optional
import logging

from app.core.dependencies import CurrentUser

logger = logging.getLogger(__name__)


@dataclass
class RLSFilter:
    """Single WHERE filter to be injected into Cube.js query."""
    member: str           # Cube.js member e.g. "FactSecondarySales.soCode"
    operator: str         # equals | contains | gte | lte
    values: list[str]


@dataclass
class UserContext:
    user_id: str
    role: str
    data_access_level: str      # territory | region | state | national
    sales_hierarchy_level: Optional[str]
    territories: list[str] = field(default_factory=list)
    regions: list[str] = field(default_factory=list)
    states: list[str] = field(default_factory=list)
    so_codes: list[str] = field(default_factory=list)
    asm_codes: list[str] = field(default_factory=list)
    zsm_codes: list[str] = field(default_factory=list)
    nsm_codes: list[str] = field(default_factory=list)


# ── Cube.js member names for hierarchy columns ────────────────────────────────
_HIERARCHY_MEMBERS = {
    "so_code":  "DimSalesHierarchy.soCode",
    "asm_code": "DimSalesHierarchy.asmCode",
    "zsm_code": "DimSalesHierarchy.zsmCode",
    "nsm_code": "DimSalesHierarchy.nsmCode",
}

_GEO_MEMBERS = {
    "state":    "DimGeography.stateName",
    "zone":     "DimGeography.zoneName",
    "district": "DimGeography.districtName",
}


class RowLevelSecurity:

    @staticmethod
    def build_user_context(user: CurrentUser) -> UserContext:
        """Convert JWT-resolved CurrentUser into a UserContext for RLS processing."""
        role = user.role
        level = user.sales_hierarchy_level

        if role in ("admin", "analyst") or level == "NSM":
            access = "national"
        elif level == "ZSM":
            access = "region"
        elif level == "ASM":
            access = "state"
        else:
            access = "territory"

        return UserContext(
            user_id=user.user_id,
            role=role,
            data_access_level=access,
            sales_hierarchy_level=level,
            territories=user.territory_codes or [],
            so_codes=[user.so_code] if user.so_code else [],
            asm_codes=[user.asm_code] if user.asm_code else [],
            zsm_codes=[user.zsm_code] if user.zsm_code else [],
            nsm_codes=[user.nsm_code] if user.nsm_code else [],
        )

    @staticmethod
    def get_cube_filters(user: CurrentUser, cube_name: str = "FactSecondarySales") -> list[dict]:
        """
        Return list of Cube.js filter dicts to inject into the query.
        Empty list = national/admin access (no restriction).
        """
        ctx = RowLevelSecurity.build_user_context(user)

        if ctx.data_access_level == "national":
            return []

        filters = []

        # Priority 1 — Sales hierarchy (most restrictive)
        if ctx.so_codes:
            filters.append({
                "member": f"{cube_name}.soCode",
                "operator": "equals",
                "values": ctx.so_codes,
            })
        elif ctx.asm_codes:
            filters.append({
                "member": f"{cube_name}.asmCode",
                "operator": "equals",
                "values": ctx.asm_codes,
            })
        elif ctx.zsm_codes:
            filters.append({
                "member": f"{cube_name}.zsmCode",
                "operator": "equals",
                "values": ctx.zsm_codes,
            })
        elif ctx.nsm_codes:
            filters.append({
                "member": f"{cube_name}.nsmCode",
                "operator": "equals",
                "values": ctx.nsm_codes,
            })

        if filters:
            logger.debug(
                "RLS applied for user=%s role=%s level=%s filters=%s",
                user.username, user.role, ctx.sales_hierarchy_level, filters,
            )

        return filters

    @staticmethod
    def inject_into_cube_query(cube_query: dict, user: CurrentUser) -> dict:
        """
        Inject RLS filters into a Cube.js query dict.
        Merges with any existing filters in the query.
        """
        rls_filters = RowLevelSecurity.get_cube_filters(user)
        if not rls_filters:
            return cube_query

        existing = cube_query.get("filters", [])
        cube_query = dict(cube_query)
        cube_query["filters"] = existing + rls_filters
        return cube_query

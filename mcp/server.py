"""
CPG Analytics MCP Server
Wraps the CPG Flask API for use inside Claude Code / Claude Desktop.

Transport: stdio (Claude Code picks this up via .mcp.json)

Tools exposed:
  cpg_ask         — natural-language analytics query (all tenants)
  cpg_sql         — direct SQL against a tenant schema (admin only)
  cpg_insights    — pre-computed weekly insights for a tenant
  cpg_health      — Flask API + container health check
  cpg_ec2_status  — EC2 idle time remaining before auto-shutdown

Environment vars (set in .mcp.json or shell):
  CPG_BASE_URL    — Flask base URL  (default: http://32.192.99.187)
  CPG_PEM_KEY     — Path to PEM key (default: auto-detected from repo root)
  CPG_EC2_HOST    — EC2 hostname/IP (default: 32.192.99.187)
"""

import os
import re
import json
import subprocess
from pathlib import Path

import requests
from mcp.server.fastmcp import FastMCP

# ── Config ─────────────────────────────────────────────────────────────────
BASE_URL  = os.getenv("CPG_BASE_URL", "http://32.192.99.187").rstrip("/")
EC2_HOST  = os.getenv("CPG_EC2_HOST", "32.192.99.187")
PEM_KEY   = os.getenv(
    "CPG_PEM_KEY",
    str(Path(__file__).parent.parent / "cpg-sales-key.pem"),
)

# Tenant → (username, password)  — admin credentials for developer tooling
TENANT_CREDS: dict[str, tuple[str, str]] = {
    "nestle":   ("nestle_admin",    "admin123"),
    "unilever": ("unilever_admin",  "admin123"),
    "itc":      ("itc_admin",       "admin123"),
}

TENANT_ALIASES = {
    "hul": "unilever", "hindustan unilever": "unilever",
    "nestlé": "nestle", "nestle india": "nestle",
    "itc limited": "itc",
}

# ── Session pool (one requests.Session per tenant) ─────────────────────────
_sessions: dict[str, requests.Session] = {}


def _resolve_tenant(tenant: str) -> str:
    t = tenant.strip().lower()
    return TENANT_ALIASES.get(t, t)


def _get_session(tenant: str) -> requests.Session:
    """Return an authenticated requests.Session for tenant, auto-logging in."""
    tenant = _resolve_tenant(tenant)
    if tenant not in TENANT_CREDS:
        raise ValueError(
            f"Unknown tenant '{tenant}'. Valid: {', '.join(TENANT_CREDS)}"
        )

    if tenant in _sessions:
        # Verify session still alive
        try:
            r = _sessions[tenant].get(f"{BASE_URL}/api/me", timeout=5)
            if r.status_code == 200:
                return _sessions[tenant]
        except Exception:
            pass

    sess = requests.Session()
    user, pwd = TENANT_CREDS[tenant]
    resp = sess.post(
        f"{BASE_URL}/login",
        json={"username": user, "password": pwd},
        timeout=10,
    )
    if not resp.ok or not resp.json().get("success"):
        raise RuntimeError(
            f"Login failed for {user}: {resp.text[:200]}"
        )
    _sessions[tenant] = sess
    return sess


# ── MCP Server ──────────────────────────────────────────────────────────────
mcp = FastMCP(
    "cpg-analytics",
    instructions=(
        "CPG Analytics assistant. Gives you direct access to multi-tenant "
        "FMCG sales data (Nestlé, HUL, ITC). "
        "Use cpg_ask for natural-language queries, cpg_sql for raw SQL, "
        "cpg_insights for weekly AI insights, cpg_health to verify the app "
        "is up, and cpg_ec2_status to check idle-shutdown countdown."
    ),
)


# ── Tool 1: Natural-language query ─────────────────────────────────────────
@mcp.tool()
def cpg_ask(question: str, tenant: str = "nestle") -> str:
    """
    Ask a natural-language analytics question about a CPG tenant's sales data.

    Args:
        question: e.g. "Top 5 brands by revenue in Maharashtra this month"
        tenant:   nestle | unilever | itc  (default: nestle)

    Returns:
        Formatted answer including HTML table if applicable, plus the SQL used.
    """
    sess = _get_session(tenant)
    resp = sess.post(
        f"{BASE_URL}/api/query",
        json={"question": question},
        timeout=60,
    )
    if not resp.ok:
        return f"HTTP {resp.status_code}: {resp.text[:400]}"

    data = resp.json()
    if not data.get("success"):
        return f"Query failed: {data.get('error', 'unknown error')}"

    meta = data.get("metadata", {})
    parts = [
        f"**Tenant:** {_resolve_tenant(tenant).title()}",
        f"**Intent:** {meta.get('intent', 'n/a')}",
        f"**Confidence:** {int(float(meta.get('confidence', 0)) * 100)}%",
        "",
        data.get("response", "(no response)"),
    ]
    sql = meta.get("sql")
    if sql:
        parts += ["", f"**SQL:**\n```sql\n{sql}\n```"]
    timing = f"{meta.get('exec_time_ms', 0):.0f}ms exec / {meta.get('parse_time_ms', 0):.0f}ms parse"
    parts += ["", f"*{timing}*"]
    return "\n".join(parts)


# ── Tool 2: Direct SQL ──────────────────────────────────────────────────────
@mcp.tool()
def cpg_sql(sql: str, tenant: str = "nestle") -> str:
    """
    Execute raw SQL against a tenant's DuckDB schema (admin only).

    The tenant schema is automatically set — do NOT include schema prefix
    in simple queries; use client_nestle / client_unilever / client_itc
    explicitly only when doing cross-schema joins.

    Args:
        sql:    Any valid DuckDB SQL, e.g. "SELECT brand, SUM(revenue) FROM fact_sales GROUP BY 1 ORDER BY 2 DESC LIMIT 10"
        tenant: nestle | unilever | itc

    Returns:
        JSON array of rows, or error message.
    """
    sess = _get_session(tenant)
    resp = sess.post(
        f"{BASE_URL}/api/admin/sql",
        json={"sql": sql, "tenant": _resolve_tenant(tenant)},
        timeout=30,
    )
    if resp.status_code == 404:
        return (
            "The /api/admin/sql endpoint is not deployed yet. "
            "Run the latest docker compose to get it."
        )
    if not resp.ok:
        return f"HTTP {resp.status_code}: {resp.text[:400]}"

    data = resp.json()
    if not data.get("success"):
        return f"SQL error: {data.get('error', 'unknown')}"

    rows = data.get("rows", [])
    if not rows:
        return "Query returned 0 rows."

    # Pretty-print as markdown table
    cols = list(rows[0].keys())
    header = "| " + " | ".join(cols) + " |"
    sep    = "| " + " | ".join(["---"] * len(cols)) + " |"
    lines  = [header, sep]
    for row in rows[:200]:  # cap at 200 rows in output
        lines.append("| " + " | ".join(str(row.get(c, "")) for c in cols) + " |")

    suffix = f"\n\n*{len(rows)} rows returned{', showing first 200' if len(rows) > 200 else ''}*"
    return "\n".join(lines) + suffix


# ── Tool 3: Insights ────────────────────────────────────────────────────────
@mcp.tool()
def cpg_insights(tenant: str = "nestle") -> str:
    """
    Fetch the latest pre-computed AI insights for a tenant
    (anomalies, trends, alerts generated by the background insights engine).

    Args:
        tenant: nestle | unilever | itc

    Returns:
        Bulleted list of insights with severity labels.
    """
    sess = _get_session(tenant)
    resp = sess.get(f"{BASE_URL}/api/insights", timeout=15)
    if not resp.ok:
        return f"HTTP {resp.status_code}: {resp.text[:200]}"

    insights = resp.json().get("insights", [])
    if not insights:
        return "No insights available yet — background engine may still be computing."

    ICONS = {"critical": "🔴", "warning": "🟡", "info": "🔵"}
    lines = [f"## CPG Insights — {_resolve_tenant(tenant).title()}", ""]
    for ins in insights:
        icon = ICONS.get(ins.get("severity", "info"), "•")
        read = "" if ins.get("read") else " *(unread)*"
        lines.append(f"{icon} **{ins.get('title', 'Insight')}**{read}")
        if ins.get("description"):
            lines.append(f"   {ins['description']}")
        lines.append("")
    return "\n".join(lines)


# ── Tool 4: Health check ────────────────────────────────────────────────────
@mcp.tool()
def cpg_health() -> str:
    """
    Check whether the CPG Flask API and its containers are healthy.
    Also verifies authentication works for all three tenants.

    Returns:
        Status summary with response times.
    """
    results = []

    # Ping /login page
    try:
        r = requests.get(f"{BASE_URL}/login", timeout=8)
        results.append(f"✅ HTTP reachable — {r.elapsed.total_seconds()*1000:.0f}ms")
    except Exception as e:
        results.append(f"❌ HTTP unreachable: {e}")
        return "\n".join(results)

    # Auth check per tenant
    for tenant, (user, pwd) in TENANT_CREDS.items():
        try:
            sess = requests.Session()
            r = sess.post(
                f"{BASE_URL}/login",
                json={"username": user, "password": pwd},
                timeout=8,
            )
            ok = r.ok and r.json().get("success")
            status = "✅" if ok else "❌"
            results.append(f"{status} Auth: {user} ({tenant})")
        except Exception as e:
            results.append(f"❌ Auth: {user} — {e}")

    return "\n".join(results)


# ── Tool 5: EC2 idle status ─────────────────────────────────────────────────
@mcp.tool()
def cpg_ec2_status() -> str:
    """
    Check EC2 idle-shutdown countdown: how long until auto-shutdown,
    last real HTTP request time, and current Docker container status.

    Returns:
        Idle time remaining, last request timestamp, container status.
    """
    pem = str(PEM_KEY)
    if not os.path.exists(pem):
        return f"PEM key not found at {pem} — set CPG_PEM_KEY env var."

    cmd = [
        "ssh", "-i", pem,
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=10",
        f"ubuntu@{EC2_HOST}",
        (
            "echo '=== IDLE LOG (last 3) ==='; "
            "tail -3 ~/idle_shutdown.log 2>/dev/null || echo 'no log'; "
            "echo '=== CONTAINERS ==='; "
            "docker compose -f ~/cpg-sales-assistant/aws-deploy/docker-compose.prod.yml ps --format 'table {{.Name}}\\t{{.Status}}' 2>/dev/null || echo 'docker error'; "
            "echo '=== UPTIME ==='; uptime"
        ),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        output = result.stdout.strip() or result.stderr.strip()
        return output if output else "No output from EC2."
    except subprocess.TimeoutExpired:
        return "SSH timed out — instance may be stopped."
    except Exception as e:
        return f"SSH error: {e}"


# ── Tool 6: EC2 wake (useful when called from a script) ────────────────────
@mcp.tool()
def cpg_tenants() -> str:
    """
    List all available tenants, their admin users, and the Flask base URL
    this MCP server is pointed at.

    Returns:
        Tenant configuration summary.
    """
    lines = [
        f"**Flask API:** {BASE_URL}",
        f"**EC2 host:** {EC2_HOST}",
        "",
        "| Tenant   | Admin User      | Client Name         |",
        "|----------|-----------------|---------------------|",
        "| nestle   | nestle_admin    | Nestlé India        |",
        "| unilever | unilever_admin  | Hindustan Unilever  |",
        "| itc      | itc_admin       | ITC Limited         |",
        "",
        "**Analyst users** (read-only, RLS applied):",
        "- nestle_analyst / analyst123",
        "- unilever_analyst / analyst123",
        "- itc_analyst / analyst123",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    mcp.run(transport="stdio")

"""
convAI CPG Analytics — FastAPI main application entry point.

Architecture:
  Nginx (port 80) → FastAPI/uvicorn (port 8000) → Cube.js (port 4000, internal)
  PostgreSQL (port 5432, internal) + Redis (port 6379, internal)

On startup:
  - PostgreSQL connection pool init
  - Redis connection init
  - DSPy LM configuration
  - Background hierarchy insights engine start
  - RLHF scheduler start (if enabled)
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from app.core.config import get_settings
from app.database.postgresql import init_pool, close_pool
from app.database.redis_client import init_redis, close_redis
from app.api import auth, query, insights, dashboard, admin
from app.rlhf.router import router as rlhf_router

settings = get_settings()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


# ── App lifecycle ─────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    logger.info("Starting convAI DSPy v%s", settings.APP_VERSION)

    # Database connections
    init_pool()
    init_redis()

    # Configure DSPy LM (lazy — first call initialises)
    try:
        from app.dspy_pipeline.config import configure_dspy
        configure_dspy()
        logger.info("DSPy pipeline configured")
    except Exception as exc:
        logger.warning("DSPy configuration failed (non-fatal): %s", exc)

    # Background insights engine
    try:
        from app.services.insights.hierarchy_insights_engine import HierarchyInsightsEngine
        _insights_engine = HierarchyInsightsEngine()
        _insights_engine.start()
        logger.info("Hierarchy insights engine started")
    except Exception as exc:
        logger.warning("Insights engine failed to start (non-fatal): %s", exc)

    # RLHF scheduler
    try:
        from app.rlhf.scheduler import start_scheduler
        start_scheduler()
        logger.info("RLHF scheduler started")
    except Exception as exc:
        logger.warning("RLHF scheduler failed to start (non-fatal): %s", exc)

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    close_pool()
    close_redis()
    logger.info("Application shutdown complete")


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url=None,
)

# CORS — tighten in production (Nginx handles origin filtering)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.DEBUG else ["http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API routers ───────────────────────────────────────────────────────────────
# Note: each router already defines its own prefix — do NOT add prefix here
app.include_router(auth.router)
app.include_router(query.router)
app.include_router(insights.router)
app.include_router(dashboard.router)
app.include_router(admin.router)
app.include_router(rlhf_router,      prefix="/rlhf")


# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
def health():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


# ── Serve React SPA static files ──────────────────────────────────────────────
_STATIC_DIR = Path(__file__).parent.parent / "frontend" / "static" / "react"

if _STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(_STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        """Catch-all for React client-side routing."""
        index = _STATIC_DIR / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return {"error": "Frontend not built"}
else:
    logger.warning("React static files not found at %s — serving API only", _STATIC_DIR)

"""
Application configuration — loaded from environment variables / .env file.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── App ────────────────────────────────────────────────────────────────
    APP_NAME: str = "convAI CPG Analytics"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False

    # ── JWT ────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 480       # 8 hours
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── PostgreSQL (analytics + auth) ──────────────────────────────────────
    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "cpg_analytics"
    POSTGRES_USER: str = "cpg_user"
    POSTGRES_PASSWORD: str = "cpg_password"

    @property
    def POSTGRES_DSN(self) -> str:
        return (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # ── Redis ──────────────────────────────────────────────────────────────
    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_QCO_TTL_SECONDS: int = 3600        # 1 hour conversation context
    REDIS_PIPELINE_STATE_TTL: int = 1800     # 30 min clarification state

    # ── Cube.js ────────────────────────────────────────────────────────────
    CUBEJS_URL: str = "http://cubejs:4000"
    CUBEJS_API_SECRET: str = "cpg-cubejs-secret"
    CUBEJS_TOKEN_EXPIRE_HOURS: int = 8

    # ── Anthropic / DSPy ───────────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-haiku-4-5-20251001"
    DSPY_MAX_RETRIES: int = 3

    # ── Query caching ──────────────────────────────────────────────────────
    QUERY_CACHE_TTL_SECONDS: int = 300       # 5 min same-question cache

    # ── Background insights ────────────────────────────────────────────────
    INSIGHTS_REFRESH_INTERVAL_HOURS: int = 6

    # ── Scope / anonymisation ──────────────────────────────────────────────
    ANONYMIZE_SCHEMA: bool = False

    # ── RLHF ──────────────────────────────────────────────────────────────
    RLHF_DB_PATH: str = "/app/data/rlhf.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()

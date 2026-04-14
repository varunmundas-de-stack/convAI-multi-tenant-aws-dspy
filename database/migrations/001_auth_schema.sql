-- 001_auth_schema.sql
-- Auth schema: users, clients, audit_log, insights, insight_reads
-- Run once on fresh database.

CREATE SCHEMA IF NOT EXISTS auth;

-- ── Clients (tenants) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.clients (
    client_id       VARCHAR(50) PRIMARY KEY,
    client_name     VARCHAR(200) NOT NULL,
    schema_name     VARCHAR(100) NOT NULL,   -- PostgreSQL schema
    domain          VARCHAR(50) DEFAULT 'cpg',
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Users ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.users (
    user_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username                VARCHAR(100) UNIQUE NOT NULL,
    email                   VARCHAR(200),
    full_name               VARCHAR(200),
    password_hash           VARCHAR(200) NOT NULL,
    client_id               VARCHAR(50) REFERENCES auth.clients(client_id),
    role                    VARCHAR(50) NOT NULL DEFAULT 'analyst',
    -- Valid roles: SO, ASM, ZSM, NSM, analyst, admin
    is_active               BOOLEAN DEFAULT TRUE,
    sales_hierarchy_level   VARCHAR(10),     -- SO | ASM | ZSM | NSM
    so_code                 VARCHAR(50),
    asm_code                VARCHAR(50),
    zsm_code                VARCHAR(50),
    nsm_code                VARCHAR(50),
    territory_codes         JSONB DEFAULT '[]',
    domain                  VARCHAR(50) DEFAULT 'cpg',
    last_login              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON auth.users(username);
CREATE INDEX IF NOT EXISTS idx_users_client_id ON auth.users(client_id);

-- ── Audit log ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.audit_log (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             UUID,
    username            VARCHAR(100),
    client_id           VARCHAR(50),
    domain              VARCHAR(50) DEFAULT 'cpg',
    question            TEXT,
    cube_query          TEXT,
    success             BOOLEAN DEFAULT TRUE,
    error_message       TEXT,
    execution_time_ms   INTEGER,
    session_id          VARCHAR(100),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON auth.audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_client ON auth.audit_log(client_id, created_at DESC);

-- ── Insights ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.insights (
    insight_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           VARCHAR(50),
    domain              VARCHAR(50) DEFAULT 'cpg',
    hierarchy_level     VARCHAR(10),         -- SO | ASM | ZSM | NSM | NULL (all)
    title               VARCHAR(500) NOT NULL,
    description         TEXT,
    insight_type        VARCHAR(50) DEFAULT 'snapshot',
    -- Valid: trend | anomaly | alert | recommendation | opportunity | snapshot
    priority            INTEGER DEFAULT 1,   -- 1 (low) → 5 (critical)
    suggested_action    TEXT,
    suggested_query     TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    expires_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_insights_client ON auth.insights(client_id, domain, hierarchy_level);
CREATE INDEX IF NOT EXISTS idx_insights_expiry ON auth.insights(expires_at);

-- ── Insight reads (user read tracking) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.insight_reads (
    insight_id  UUID NOT NULL,
    user_id     UUID NOT NULL,
    read_at     TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (insight_id, user_id)
);

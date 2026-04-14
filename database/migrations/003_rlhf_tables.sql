-- 003_rlhf_tables.sql
-- RLHF system tables — feedback, prompt versioning, A/B testing
-- These are in the public schema (shared, not tenant-scoped)

CREATE TABLE IF NOT EXISTS rlhf_feedback_log (
    id              SERIAL PRIMARY KEY,
    request_id      VARCHAR(100),
    query           TEXT,
    response_summary TEXT,
    prompt_version  VARCHAR(100),
    rating          INTEGER CHECK (rating BETWEEN 1 AND 5),
    ab_group        VARCHAR(10),
    correction      TEXT,
    full_response   TEXT,
    cube_query      TEXT,
    user_id         UUID,
    client_id       VARCHAR(50),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rlhf_prompt_versions (
    id              SERIAL PRIMARY KEY,
    version_tag     VARCHAR(100) UNIQUE NOT NULL,
    prompt_text     TEXT NOT NULL,
    parent_version  VARCHAR(100),
    is_active       BOOLEAN DEFAULT FALSE,
    avg_rating      NUMERIC(3,2),
    feedback_count  INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rlhf_ab_test_config (
    id              SERIAL PRIMARY KEY,
    version_a       VARCHAR(100) NOT NULL,
    version_b       VARCHAR(100) NOT NULL,
    traffic_split   NUMERIC(4,3) DEFAULT 0.5,   -- fraction going to version_b
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rlhf_retry_log (
    id                  SERIAL PRIMARY KEY,
    original_request_id VARCHAR(100),
    original_query      TEXT,
    modified_query      TEXT,
    user_id             UUID,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial prompt version
INSERT INTO rlhf_prompt_versions (version_tag, prompt_text, is_active)
VALUES ('v1.0.0', 'Initial DSPy pipeline system prompt', TRUE)
ON CONFLICT (version_tag) DO NOTHING;

#!/bin/bash
# init_db.sh — Run all migrations in order, then seed users.
# Called by Docker entrypoint or manually.

set -e

POSTGRES_DSN="${POSTGRES_DSN:-postgresql://cpg_user:cpg_password@postgres:5432/cpg_analytics}"

run_sql() {
  echo "Running migration: $1"
  psql "$POSTGRES_DSN" -f "$1"
}

echo "=== Running database migrations ==="
run_sql /app/database/migrations/001_auth_schema.sql
run_sql /app/database/migrations/002_cpg_schemas.sql
run_sql /app/database/migrations/003_rlhf_tables.sql

echo "=== Seeding users ==="
python /app/database/seed/seed_users.py

echo "=== Database initialisation complete ==="

#!/usr/bin/env bash
# =============================================================================
# CPG Sales Assistant — App Spin-Up / Recovery Script
# Run this on the EC2 instance to start, heal, or fully re-initialise the app.
#
# Usage (from repo root on EC2):
#   bash aws-deploy/startapp.sh              # normal start / restart
#   bash aws-deploy/startapp.sh --reseed     # force re-seed DB (wipes data)
#   bash aws-deploy/startapp.sh --status     # health check only, no changes
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()      { echo -e "${GREEN}  ✓ $*${NC}"; }
warn()    { echo -e "${YELLOW}  ⚠ $*${NC}"; }
fail()    { echo -e "${RED}  ✗ $*${NC}"; }
section() { echo -e "\n${CYAN}══════ $* ══════${NC}"; }

RESEED=false
STATUS_ONLY=false
for arg in "$@"; do
  [[ "$arg" == "--reseed"  ]] && RESEED=true
  [[ "$arg" == "--status"  ]] && STATUS_ONLY=true
done

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_DIR/aws-deploy/docker-compose.prod.yml"
ENV_FILE="$REPO_DIR/.env"

# ─── 1. Pre-flight checks ──────────────────────────────────────────────────────
section "1. Pre-flight checks"

# .env must exist
if [[ ! -f "$ENV_FILE" ]]; then
  fail ".env not found at $ENV_FILE"
  echo "  Create it from the example:"
  echo "    cp $REPO_DIR/.env.example $ENV_FILE && nano $ENV_FILE"
  exit 1
fi
ok ".env found"

# ANTHROPIC_API_KEY must be real (not placeholder)
API_KEY=$(grep -E '^ANTHROPIC_API_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | xargs)
if [[ -z "$API_KEY" || "$API_KEY" == "PASTE_YOUR_KEY_HERE" || "$API_KEY" == "sk-ant-api03-..."* ]]; then
  fail "ANTHROPIC_API_KEY is not set or still a placeholder in .env"
  echo "  Edit $ENV_FILE and paste your real key."
  exit 1
fi
ok "ANTHROPIC_API_KEY is set (${API_KEY:0:18}...)"

# JWT_SECRET_KEY must be set
JWT_KEY=$(grep -E '^JWT_SECRET_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | xargs || true)
if [[ -z "$JWT_KEY" || "$JWT_KEY" == "change-me"* ]]; then
  warn "JWT_SECRET_KEY is weak/default — generating a strong one now"
  NEW_JWT=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  # Add or replace
  if grep -q '^JWT_SECRET_KEY=' "$ENV_FILE"; then
    sed -i "s|^JWT_SECRET_KEY=.*|JWT_SECRET_KEY=${NEW_JWT}|" "$ENV_FILE"
  else
    echo "JWT_SECRET_KEY=${NEW_JWT}" >> "$ENV_FILE"
  fi
  ok "JWT_SECRET_KEY generated and saved to .env"
else
  ok "JWT_SECRET_KEY is set"
fi

# CUBEJS_API_SECRET must be set
CUBE_SECRET=$(grep -E '^CUBEJS_API_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | xargs || true)
if [[ -z "$CUBE_SECRET" || "$CUBE_SECRET" == "change-me"* ]]; then
  warn "CUBEJS_API_SECRET missing — generating one now"
  NEW_CUBE=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  if grep -q '^CUBEJS_API_SECRET=' "$ENV_FILE"; then
    sed -i "s|^CUBEJS_API_SECRET=.*|CUBEJS_API_SECRET=${NEW_CUBE}|" "$ENV_FILE"
  else
    echo "CUBEJS_API_SECRET=${NEW_CUBE}" >> "$ENV_FILE"
  fi
  ok "CUBEJS_API_SECRET generated and saved to .env"
else
  ok "CUBEJS_API_SECRET is set"
fi

# POSTGRES_PASSWORD must be set
PG_PASS=$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | xargs || true)
if [[ -z "$PG_PASS" || "$PG_PASS" == "change-me"* ]]; then
  warn "POSTGRES_PASSWORD missing — generating one now"
  NEW_PG=$(python3 -c "import secrets; print(secrets.token_hex(16))")
  if grep -q '^POSTGRES_PASSWORD=' "$ENV_FILE"; then
    sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${NEW_PG}|" "$ENV_FILE"
  else
    echo "POSTGRES_PASSWORD=${NEW_PG}" >> "$ENV_FILE"
  fi
  ok "POSTGRES_PASSWORD generated and saved to .env"
else
  ok "POSTGRES_PASSWORD is set"
fi

if $STATUS_ONLY; then
  section "Container Status (--status mode)"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
  echo ""
  echo "App health:"
  curl -sf http://localhost:8000/health && echo "" || echo "  (not reachable on port 8000)"
  echo ""
  echo "Nginx:"
  sudo systemctl is-active nginx || true
  exit 0
fi

# ─── 2. Start / restart containers ────────────────────────────────────────────
section "2. Starting Docker containers"
cd "$REPO_DIR"

# Pull latest images (skip build errors non-fatal)
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull --quiet 2>/dev/null || true

# Up all containers (rebuild app image if Dockerfile changed)
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build
ok "Docker containers started"

# ─── 3. Wait for PostgreSQL to be healthy ─────────────────────────────────────
section "3. Waiting for PostgreSQL"
MAX_WAIT=60
WAITED=0
until docker exec cpg_dspy_postgres pg_isready -U cpg_user -d cpg_analytics -q 2>/dev/null; do
  if (( WAITED >= MAX_WAIT )); then
    fail "PostgreSQL did not become ready within ${MAX_WAIT}s"
    docker logs cpg_dspy_postgres --tail 20
    exit 1
  fi
  echo -n "."
  sleep 2
  WAITED=$((WAITED + 2))
done
echo ""
ok "PostgreSQL is ready"

# ─── 4. Wait for FastAPI app ───────────────────────────────────────────────────
section "4. Waiting for FastAPI app"
MAX_WAIT=90
WAITED=0
until curl -sf http://localhost:8000/health > /dev/null 2>&1; do
  if (( WAITED >= MAX_WAIT )); then
    fail "FastAPI app did not come up within ${MAX_WAIT}s"
    echo "Last 30 lines of app log:"
    docker logs cpg_dspy_app --tail 30
    exit 1
  fi
  echo -n "."
  sleep 3
  WAITED=$((WAITED + 3))
done
echo ""
ok "FastAPI app is healthy"

# ─── 5. Check if DB is initialised (auth schema exists) ───────────────────────
section "5. Database initialisation"

DB_READY=$(docker exec cpg_dspy_postgres psql \
  -U cpg_user -d cpg_analytics -tAc \
  "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='auth';" 2>/dev/null || echo "0")

if [[ "$DB_READY" == "0" ]] || $RESEED; then
  if $RESEED; then
    warn "--reseed flag set: dropping existing data"
    docker exec cpg_dspy_postgres psql -U cpg_user -d cpg_analytics -c \
      "DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS cpg_nestle CASCADE; DROP SCHEMA IF EXISTS cpg_unilever CASCADE; DROP SCHEMA IF EXISTS cpg_itc CASCADE;" 2>/dev/null || true
  fi

  echo "  Running migrations..."
  docker exec cpg_dspy_app bash /app/database/seed/init_db.sh
  ok "Migrations complete"

  echo "  Seeding sales data (~90k rows × 3 tenants — takes ~2 min)..."
  docker exec cpg_dspy_app python /app/database/seed/seed_data.py
  ok "Sales data seeded"

  echo "  Seeding users..."
  docker exec cpg_dspy_app python /app/database/seed/seed_users.py
  ok "Users seeded"
else
  # Check user count as a quick sanity check
  USER_COUNT=$(docker exec cpg_dspy_postgres psql \
    -U cpg_user -d cpg_analytics -tAc \
    "SELECT COUNT(*) FROM auth.users;" 2>/dev/null || echo "0")
  ok "DB already initialised (${USER_COUNT} users found) — skipping seed"
  echo "  To force re-seed: bash aws-deploy/startapp.sh --reseed"
fi

# ─── 6. Nginx check ───────────────────────────────────────────────────────────
section "6. Nginx"
if sudo systemctl is-active --quiet nginx; then
  ok "Nginx is running"
else
  warn "Nginx is not running — starting it"
  sudo nginx -t && sudo systemctl start nginx
  ok "Nginx started"
fi

# ─── 7. Final health summary ───────────────────────────────────────────────────
section "7. Health summary"

HEALTH=$(curl -sf http://localhost:8000/health 2>/dev/null || echo "FAIL")
if echo "$HEALTH" | grep -q '"status"'; then
  ok "App health endpoint: $HEALTH"
else
  fail "App health endpoint unreachable"
fi

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  CPG Sales Assistant is UP${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
PUBLIC_IP=$(curl -sf http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null \
         || curl -sf http://checkip.amazonaws.com 2>/dev/null \
         || echo "<your-ec2-ip>")
echo "  URL        :  http://${PUBLIC_IP}"
echo ""
echo "  Logins:"
echo "    nestle_admin   / admin123   (Nestlé — full admin)"
echo "    hul_admin      / admin123   (HUL / Unilever)"
echo "    itc_admin      / admin123   (ITC)"
echo ""
echo "  Quick log tails:"
echo "    docker logs cpg_dspy_app     -f --tail 50"
echo "    docker logs cpg_dspy_cubejs  -f --tail 20"
echo "    docker logs cpg_dspy_postgres -f --tail 20"
echo ""

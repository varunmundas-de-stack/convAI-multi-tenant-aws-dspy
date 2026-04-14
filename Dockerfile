# Multi-stage Dockerfile
# Stage 1: Build React frontend
# Stage 2: FastAPI backend serving React static files + API

# ── Stage 1: React build ──────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build

COPY frontend_react/package*.json ./
RUN npm ci --silent

COPY frontend_react/ ./
# Inject API base URL (empty = same origin, handled by Nginx proxy)
ENV VITE_API_BASE_URL=""
RUN npm run build

# ── Stage 2: FastAPI app ──────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY backend/ ./backend/
COPY database/ ./database/
COPY cubejs/ ./cubejs/

# Copy React build into the location FastAPI serves static files from
# Vite outDir is ../frontend/static/react (relative to frontend_react workdir)
COPY --from=frontend-builder /frontend/static/react/ ./frontend/static/react/

# Data directory (RLHF SQLite)
RUN mkdir -p /app/data

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "1", "--loop", "uvloop", "--http", "httptools"]

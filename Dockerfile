# Dockerfile — FastAPI backend serving pre-built React static files
# The React bundle is built locally (npm run build in frontend_react/) and
# committed to frontend/static/react/ so Docker just COPYs it in.
# This avoids stale Docker layer-cache issues with multi-stage npm builds.

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

# Pre-built React bundle (built locally, committed to git)
COPY frontend/static/react/ ./frontend/static/react/

# Data directory (RLHF SQLite)
RUN mkdir -p /app/data

# Set WORKDIR to the backend package so 'from app.xxx import ...' resolves correctly
WORKDIR /app/backend

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "1", "--loop", "uvloop", "--http", "httptools"]

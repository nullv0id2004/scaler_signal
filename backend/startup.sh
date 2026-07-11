#!/usr/bin/env bash
# Azure App Service startup command for the FastAPI backend.
# App Service deploys this folder to /home/site/wwwroot and runs this script.
set -e

# Run pending DB migrations. DATABASE_URL points at /home (persistent disk),
# so the SQLite file survives restarts and redeploys.
alembic upgrade head || echo "alembic upgrade failed (continuing)"

# gunicorn + uvicorn worker = ASGI + WebSocket support on App Service.
# App Service injects $PORT; bind to it.
exec gunicorn app.main:app \
  -k uvicorn.workers.UvicornWorker \
  -w 2 \
  --bind 0.0.0.0:${PORT:-8000} \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -

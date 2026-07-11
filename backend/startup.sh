#!/usr/bin/env bash
# Azure App Service startup command for the FastAPI backend.
# App Service deploys this folder to /home/site/wwwroot and runs this script.
set -e

# Run pending DB migrations. DATABASE_URL points at /home (persistent disk),
# so the SQLite file survives restarts and redeploys. Fail hard (set -e) rather
# than booting against a stale/broken schema and 500-ing at runtime.
alembic upgrade head

# gunicorn + uvicorn worker = ASGI + WebSocket support on App Service.
# App Service injects $PORT; bind to it.
#
# EXACTLY ONE worker (-w 1): the WebSocket ConnectionManager keeps its
# user_id -> sockets map in process memory. Multiple workers would each hold a
# separate map, so two users routed to different workers could not exchange
# live messages. Scaling out requires a shared broker (e.g. Redis pub/sub),
# which is out of scope for this single-instance demo.
exec gunicorn app.main:app \
  -k uvicorn.workers.UvicornWorker \
  -w 1 \
  --bind 0.0.0.0:${PORT:-8000} \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -

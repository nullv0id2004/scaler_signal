FROM python:3.12-slim

WORKDIR /app

# System deps: none beyond what pip needs for aiosqlite/pillow wheels on slim.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first for better layer caching.
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir -e .

COPY alembic.ini ./
COPY alembic ./alembic

# SQLite file + uploads live here. Mount an Azure Files share (or any
# persistent volume) at this path in production — container-local disk is
# ephemeral and data is lost on restart/redeploy otherwise.
RUN mkdir -p /app/data /app/uploads
ENV DATABASE_URL=sqlite+aiosqlite:////app/data/signal.db

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]

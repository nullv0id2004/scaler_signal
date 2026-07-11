#!/bin/sh
set -e

# Apply migrations on every start — safe/no-op if already up to date.
alembic upgrade head

# Opt-in seeding: set SEED_ON_START=1 to (re)populate the 7 demo users +
# sample conversations on container start. Leave unset in production once
# real data exists, since app/seed.py resets demo data.
if [ "${SEED_ON_START:-0}" = "1" ]; then
    echo "SEED_ON_START=1: seeding database..."
    python -m app.seed
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000

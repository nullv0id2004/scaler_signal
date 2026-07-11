# Deployment — Azure App Service

Two Linux Web Apps on one App Service plan, deployed by GitHub Actions on push
to `main`.

| Piece    | Stack              | URL                                            |
|----------|--------------------|------------------------------------------------|
| Backend  | FastAPI / Python   | `https://<BACKEND_APP>.azurewebsites.net`      |
| Frontend | Next.js / Node     | `https://<FRONTEND_APP>.azurewebsites.net`     |

## One-time setup

1. **Provision Azure resources**

   Edit the three app names at the top of [`infra/azure-setup.sh`](../infra/azure-setup.sh)
   (must be globally unique), then:

   ```bash
   az login
   bash infra/azure-setup.sh
   ```

   This creates the resource group, plan, both Web Apps, sets app settings +
   startup commands, enables WebSockets on the backend, and writes two
   `*.publishsettings` files.

2. **Wire GitHub Actions** (the script prints these exact commands):

   ```bash
   gh secret set AZURE_BACKEND_PUBLISH_PROFILE  < backend.publishsettings
   gh secret set AZURE_FRONTEND_PUBLISH_PROFILE < frontend.publishsettings
   gh variable set BACKEND_APP_NAME  --body "<BACKEND_APP>"
   gh variable set FRONTEND_APP_NAME --body "<FRONTEND_APP>"
   rm backend.publishsettings frontend.publishsettings   # they are credentials
   ```

3. **Deploy** — push to `main`, or run each workflow from the Actions tab
   (`workflow_dispatch`). Path filters mean a backend-only change only redeploys
   the backend, and vice versa.

## How it works

- **Remote build (Oryx).** Both apps set `SCM_DO_BUILD_DURING_DEPLOYMENT=true`,
  so Azure builds on deploy: backend from `requirements.txt`, frontend via
  `npm install && npm run build`.
- **Backend startup** — [`backend/startup.sh`](../backend/startup.sh) runs
  `alembic upgrade head`, then `gunicorn` with a Uvicorn worker (ASGI +
  WebSocket) bound to `$PORT`.
- **Frontend startup** — `npm start` (`next start`), which binds to `$PORT`.
- **Config** lives in App Settings, not in the repo:
  - Backend: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `SMS_PROVIDER`,
    `OTP_DEV_MODE`.
  - Frontend: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` — read by Oryx at
    **build** time and baked into the bundle. Change one → redeploy to rebuild.

## Caveats (demo-grade)

- **SQLite** lives at `/home/signal.db`. `/home` is a persistent Azure Files
  mount, so data survives restarts and redeploys — but it does **not** scale
  past one instance (don't scale the backend out). For production, move to
  Azure Database for PostgreSQL and swap `DATABASE_URL`.
- **Uploads** written under the app folder are lost on redeploy. Move to Azure
  Blob Storage for durability.
- OTP runs in dev mode (`SMS_PROVIDER=console`, `OTP_DEV_MODE=true`): codes are
  logged / returned in the response, no real SMS. Wire a real provider (Twilio)
  and set `OTP_DEV_MODE=false` before any real use.

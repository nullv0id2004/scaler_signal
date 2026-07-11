# Azure Portal Setup — click-through guide

Create both Web Apps by hand in the [Azure Portal](https://portal.azure.com),
then let the existing GitHub Actions workflows deploy them. No CLI needed.

Pick your two app names up front (must be **globally unique**). This guide uses:

| App      | Name (change these)  | URL                                          |
|----------|----------------------|----------------------------------------------|
| Backend  | `scaler-signal-api`  | `https://scaler-signal-api.azurewebsites.net` |
| Frontend | `scaler-signal-web`  | `https://scaler-signal-web.azurewebsites.net` |

---

## 1. Create the Backend Web App (Python)

1. Portal → **Create a resource** → **Web App**.
2. **Basics** tab:
   - **Resource Group** → *Create new* → `scaler-signal-rg`.
   - **Name**: `scaler-signal-api`.
   - **Publish**: `Code`.
   - **Runtime stack**: `Python 3.12`.
   - **Operating System**: `Linux`.
   - **Region**: pick nearest (e.g. Central India).
   - **Pricing plan** → *Create new* → name `scaler-signal-plan`, **Sku = Basic B1**
     (B1 is the minimum that supports WebSockets + Always On).
3. **Review + create** → **Create**. Wait for deploy → **Go to resource**.

### Configure the backend
4. Left menu → **Settings → Configuration** (or **Environment variables**) →
   **App settings** → add each (New application setting):

   | Name | Value |
   |------|-------|
   | `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` |
   | `DATABASE_URL` | `sqlite+aiosqlite:////home/signal.db` |
   | `JWT_SECRET` | `c95ef980ba74a5b4f47acce9649aecf570e9b7a355a3afbcd15d936db877a333` |
   | `CORS_ORIGINS` | `["https://scaler-signal-web.azurewebsites.net"]` |
   | `SMS_PROVIDER` | `console` |
   | `OTP_DEV_MODE` | `true` |

   > `DATABASE_URL` has **four** slashes — `////home/...` — that's an absolute
   > path to the persistent `/home` disk. `CORS_ORIGINS` is a JSON array.
   >
   > ⚠️ The `JWT_SECRET` above is a sample committed to this (public) repo —
   > **generate your own** and paste that instead: `openssl rand -hex 32`.

5. Same page → **General settings**:
   - **Startup Command**: `bash startup.sh`
   - **Web sockets**: `On`
   - **Always on**: `On`
   - **Save** (the app restarts).
6. Left menu → **Settings → TLS/SSL** (or **Configuration → General**) →
   **HTTPS Only**: `On`.

---

## 2. Create the Frontend Web App (Node)

7. **Create a resource** → **Web App** → **Basics**:
   - **Resource Group**: `scaler-signal-rg` (the same one).
   - **Name**: `scaler-signal-web`.
   - **Publish**: `Code`.
   - **Runtime stack**: `Node 22 LTS`.
   - **Operating System**: `Linux`.
   - **Pricing plan**: select **existing** `scaler-signal-plan`.
8. **Review + create** → **Create** → **Go to resource**.

### Configure the frontend
9. **Configuration → App settings** → add:

   | Name | Value |
   |------|-------|
   | `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` |
   | `NEXT_PUBLIC_API_URL` | `https://scaler-signal-api.azurewebsites.net` |
   | `NEXT_PUBLIC_WS_URL` | `wss://scaler-signal-api.azurewebsites.net` |

   > `NEXT_PUBLIC_*` are baked in at **build** time (Oryx reads them during the
   > remote build), so they must exist before the first deploy.

10. **General settings** → **Startup Command**: `npm start` → **Save**.
11. **HTTPS Only**: `On`.

---

## 3. Wire GitHub Actions to deploy

The repo already has `.github/workflows/deploy-backend.yml` and
`deploy-frontend.yml`. They need publish profiles (secrets) + app names (variables).

12. **Backend app** → **Overview** → top toolbar → **Download publish profile**.
    Saves an XML file. Repeat on the **Frontend app**.
13. GitHub → your repo → **Settings → Secrets and variables → Actions**:
    - **Secrets** tab → **New repository secret**:
      - `AZURE_BACKEND_PUBLISH_PROFILE` → paste the **entire** backend XML.
      - `AZURE_FRONTEND_PUBLISH_PROFILE` → paste the frontend XML.
    - **Variables** tab → **New repository variable**:
      - `BACKEND_APP_NAME` → `scaler-signal-api`
      - `FRONTEND_APP_NAME` → `scaler-signal-web`
14. GitHub → **Actions** tab → run **Deploy Backend** and **Deploy Frontend**
    (Run workflow), or just push a commit to `main`.

---

## 4. Verify

- Backend health: open `https://scaler-signal-api.azurewebsites.net/api/health`
  → `{"status":"ok"}`.
- Frontend: open `https://scaler-signal-web.azurewebsites.net` → log in as a
  seeded user + OTP `123456`.
- First backend boot runs `alembic upgrade head` (creates the DB). If login
  fails, seed users: backend app → **SSH** (or **Console**) →
  `python -m app.seed`.

## Notes

- **Cost**: B1 is a paid tier (~small hourly rate). Stop or delete the resource
  group when done to avoid charges.
- **SQLite** at `/home/signal.db` persists across restarts/redeploys but does
  **not** support scaling the backend past one instance.
- **Uploads** are lost on redeploy — fine for a demo; use Blob Storage for prod.

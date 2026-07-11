#!/usr/bin/env bash
# One-time Azure provisioning for the Signal-clone app: two Linux Web Apps
# (FastAPI backend + Next.js frontend) on one App Service plan.
#
# Prereqs: `az login` done, and an Azure subscription selected
#          (`az account set --subscription <id>`).
#
# App names must be GLOBALLY unique. Edit the three names below first.
set -euo pipefail

# ---- EDIT THESE ------------------------------------------------------------
RG="scaler-signal-rg"
LOCATION="centralindia"           # e.g. eastus, westeurope, centralindia
PLAN="scaler-signal-plan"
BACKEND_APP="signal-api"   # -> https://signal-api.azurewebsites.net
FRONTEND_APP="signal-frontend"  # -> https://signal-frontend.azurewebsites.net
# ---------------------------------------------------------------------------

BACKEND_URL="https://${BACKEND_APP}.azurewebsites.net"
FRONTEND_URL="https://${FRONTEND_APP}.azurewebsites.net"
WS_URL="wss://${BACKEND_APP}.azurewebsites.net"
JWT_SECRET="$(openssl rand -hex 32)"

echo "==> Resource group"
az group create --name "$RG" --location "$LOCATION" -o none

echo "==> App Service plan (Linux, B1)"
az appservice plan create --name "$PLAN" --resource-group "$RG" \
  --is-linux --sku B1 -o none

# ---------------------------------------------------------------------------
# BACKEND (Python 3.12)
# ---------------------------------------------------------------------------
echo "==> Backend Web App"
az webapp create --resource-group "$RG" --plan "$PLAN" \
  --name "$BACKEND_APP" --runtime "PYTHON:3.12" -o none

echo "==> Backend: startup command, websockets, HTTPS-only"
az webapp config set --resource-group "$RG" --name "$BACKEND_APP" \
  --startup-file "bash startup.sh" --web-sockets-enabled true -o none
az webapp update --resource-group "$RG" --name "$BACKEND_APP" \
  --https-only true -o none

echo "==> Backend: app settings"
# DATABASE_URL points at /home (persistent disk) so the SQLite file survives
# restarts/redeploys. CORS_ORIGINS is a JSON array (pydantic-settings parses it).
az webapp config appsettings set --resource-group "$RG" --name "$BACKEND_APP" \
  --settings \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true \
    DATABASE_URL="sqlite+aiosqlite:////home/signal.db" \
    JWT_SECRET="$JWT_SECRET" \
    CORS_ORIGINS="[\"${FRONTEND_URL}\"]" \
    SMS_PROVIDER="console" \
    OTP_DEV_MODE="true" \
  -o none

# ---------------------------------------------------------------------------
# FRONTEND (Node 22)
# ---------------------------------------------------------------------------
echo "==> Frontend Web App"
az webapp create --resource-group "$RG" --plan "$PLAN" \
  --name "$FRONTEND_APP" --runtime "NODE:22-lts" -o none

echo "==> Frontend: startup command, HTTPS-only"
az webapp config set --resource-group "$RG" --name "$FRONTEND_APP" \
  --startup-file "npm start" -o none
az webapp update --resource-group "$RG" --name "$FRONTEND_APP" \
  --https-only true -o none

echo "==> Frontend: app settings"
# NEXT_PUBLIC_* are read by Oryx at BUILD time and baked into the bundle.
az webapp config appsettings set --resource-group "$RG" --name "$FRONTEND_APP" \
  --settings \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true \
    NEXT_PUBLIC_API_URL="$BACKEND_URL" \
    NEXT_PUBLIC_WS_URL="$WS_URL" \
  -o none

# ---------------------------------------------------------------------------
# Publish profiles for GitHub Actions
# ---------------------------------------------------------------------------
echo "==> Writing publish profiles (feed these to GitHub secrets)"
az webapp deployment list-publishing-profiles --resource-group "$RG" \
  --name "$BACKEND_APP" --xml > backend.publishsettings
az webapp deployment list-publishing-profiles --resource-group "$RG" \
  --name "$FRONTEND_APP" --xml > frontend.publishsettings

cat <<EOF

============================================================
Done. Backend : $BACKEND_URL
      Frontend: $FRONTEND_URL

Next — wire GitHub Actions (needs the gh CLI, or set these in the
GitHub web UI under Settings > Secrets and variables > Actions):

  gh secret set AZURE_BACKEND_PUBLISH_PROFILE  < backend.publishsettings
  gh secret set AZURE_FRONTEND_PUBLISH_PROFILE < frontend.publishsettings
  gh variable set BACKEND_APP_NAME  --body "$BACKEND_APP"
  gh variable set FRONTEND_APP_NAME --body "$FRONTEND_APP"

Then push to main (or run the workflows manually) to deploy.
Delete the *.publishsettings files afterwards — they are credentials.
============================================================
EOF

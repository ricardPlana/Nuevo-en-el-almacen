#!/usr/bin/env bash
# Despliega el código (front + API) a la Static Web App con la SWA CLI, sin GitHub.
# Uso: az login && SUBSCRIPTION=<id> RG=<rg> SWA=<nombre> ./infra/deploy-code.sh
# Requiere: Node y .NET 10 SDK. SWA CLI fijada por npx (2.1.0+: la 2.0.x no acepta dotnet-isolated:10.0 en el config).
# Ojo: el binario de despliegue quiere "dotnetisolated" (sin guion) en --api-language; con guion falla con
# "Function language info isn't provided" (github.com/Azure/static-web-apps-cli/issues/1002).
# El token no se muestra.
set -euo pipefail
SWA_CLI="${SWA_CLI:-npx -y @azure/static-web-apps-cli@2.1.0}"

: "${RG:?Falta RG (resource group, p. ej. rg-wh3d-app)}"
: "${SWA:?Falta SWA (nombre de la Static Web App, p. ej. swa-wh3d)}"
APP_NAME="${APP_NAME:-wh3d-app}"
SUB=()
[ -n "${SUBSCRIPTION:-}" ] && SUB=(--subscription "$SUBSCRIPTION")
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

HOST=$(az staticwebapp show -g "$RG" -n "$SWA" "${SUB[@]}" --query defaultHostname -o tsv)
TENANT=$(az account show "${SUB[@]}" --query tenantId -o tsv)
APP_ID=$(az ad app list --display-name "$APP_NAME" --query "[0].appId" -o tsv)
[ -n "$APP_ID" ] || { echo "No encuentro la app registration $APP_NAME (infra/entra-app.sh)"; exit 1; }

echo "== SPA (modo api, Entra $APP_ID)"
(
  cd "$ROOT/swa"
  [ -d node_modules ] || npm ci
  VITE_DATA_SOURCE=api \
  VITE_ENTRA_CLIENT_ID="$APP_ID" \
  VITE_ENTRA_TENANT_ID="$TENANT" \
  VITE_API_SCOPE="api://$HOST/$APP_ID/access_as_user" \
  VITE_TEAMS_APP_ID="${TEAMS_APP_ID:-}" \
  npm run build
)
cp "$ROOT/swa/staticwebapp.config.json" "$ROOT/swa/dist/"

echo "== API (.NET 10 isolated)"
rm -rf "$ROOT/api/publish"
dotnet publish "$ROOT/api/Wh3d.Api.csproj" -c Release -o "$ROOT/api/publish" --nologo -v quiet

echo "== Despliegue a $SWA ($HOST)"
SWA_CLI_DEPLOYMENT_TOKEN="$(az staticwebapp secrets list -g "$RG" -n "$SWA" "${SUB[@]}" --query properties.apiKey -o tsv)" \
  $SWA_CLI deploy "$ROOT/swa/dist" \
    --api-location "$ROOT/api/publish" \
    --api-language dotnetisolated --api-version 10.0 \
    --env production

echo "== Comprobación"
curl -s "https://$HOST/api/health"; echo
echo "Listo: https://$HOST"

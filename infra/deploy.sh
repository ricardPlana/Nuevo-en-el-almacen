#!/usr/bin/env bash
# Levanta la infraestructura de WH3D con Azure CLI. Lo mínimo para una ponencia:
# una Static Web App (Free) con el front y la API (managed functions). Nada más.
# Uso: az login && SUBSCRIPTION=<id> RG=<rg> SWA=<nombre> ./deploy.sh
# Idempotente: repetir no crea recursos nuevos. No cambia tu suscripción por defecto de az.
set -euo pipefail

LOCATION="${LOCATION:-westeurope}"
: "${RG:?Falta RG (resource group, p. ej. rg-wh3d-app)}"
: "${SWA:?Falta SWA (nombre de la Static Web App, p. ej. swa-wh3d)}"
SUB=()
[ -n "${SUBSCRIPTION:-}" ] && SUB=(--subscription "$SUBSCRIPTION")

echo "== Resource group $RG"
if ! az group show -n "$RG" "${SUB[@]}" -o none 2>/dev/null; then
  az group create -n "$RG" -l "$LOCATION" "${SUB[@]}" -o none
fi

echo "== Static Web App $SWA (Free)"
if ! az staticwebapp show -g "$RG" -n "$SWA" "${SUB[@]}" -o none 2>/dev/null; then
  az staticwebapp create -g "$RG" -n "$SWA" -l "$LOCATION" --sku Free "${SUB[@]}" -o none
fi
SWA_HOST=$(az staticwebapp show -g "$RG" -n "$SWA" "${SUB[@]}" --query defaultHostname -o tsv)

echo "== App settings de la API (MOCK_MODE=true)"
AGENT_API_KEY="$(az staticwebapp appsettings list -g "$RG" -n "$SWA" "${SUB[@]}" --query properties.AGENT_API_KEY -o tsv 2>/dev/null || true)"
[ -n "$AGENT_API_KEY" ] || AGENT_API_KEY="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
az staticwebapp appsettings set -g "$RG" -n "$SWA" "${SUB[@]}" --setting-names \
  MOCK_MODE=true AUTH_DISABLED=false \
  SWA_URL="https://$SWA_HOST" TEAMS_ENTITY_ID=mapa3d \
  ENTRA_TENANT_ID="$(az account show "${SUB[@]}" --query tenantId -o tsv)" \
  AGENT_API_KEY="$AGENT_API_KEY" -o none

cat <<EOF

Listo.
  SWA:  https://$SWA_HOST   (API en https://$SWA_HOST/api)
  AGENT_API_KEY guardada en los app settings de la SWA (para el custom connector de Copilot Studio):
       az staticwebapp appsettings list -g $RG -n $SWA ${SUB[*]} --query properties.AGENT_API_KEY -o tsv

Siguientes pasos:
  1. App registration wh3d-app: infra/entra-app.sh (SWA_HOST=$SWA_HOST).
  2. Deployment token de la SWA para GitHub Actions (secret AZURE_STATIC_WEB_APPS_API_TOKEN):
       az staticwebapp secrets list -g $RG -n $SWA ${SUB[*]} --query properties.apiKey -o tsv
EOF

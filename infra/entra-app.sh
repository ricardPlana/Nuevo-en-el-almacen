#!/usr/bin/env bash
# Crea (o completa) la app registration única de WH3D: wh3d-app.
#  - SPA: redirect a /auth-redirect.html (MSAL v5) en la SWA y en localhost:5173.
#  - Expose an API: api://<SWA_HOST>/<appId>, scope access_as_user, Teams preautorizado.
#  - Client secret para que la API llame a F&O (client credentials).
# El secret NO se imprime: va a api/local.settings.json y, si pasas RG/SWA, a los app settings de la SWA.
#
# Uso: az login && SWA_HOST=<host> FNO_URL=<url F&O> [SUBSCRIPTION=<id> RG=<rg> SWA=<nombre>] ./infra/entra-app.sh
set -euo pipefail

: "${SWA_HOST:?Falta SWA_HOST (host de la Static Web App, sin https://)}"
: "${FNO_URL:?Falta FNO_URL (https://<entorno>.cloudax.dynamics.com)}"
APP_NAME="${APP_NAME:-wh3d-app}"
FNO_URL="${FNO_URL%/}"
TEAMS_CLIENTS=("1fec8e78-bce4-4aaf-ab1b-5451cc387264" "5e3ce6c0-2b1f-4285-8d4b-75ee78787346") # Teams desktop/móvil y web
SUB=()
[ -n "${SUBSCRIPTION:-}" ] && SUB=(--subscription "$SUBSCRIPTION")
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

TENANT=$(az account show "${SUB[@]}" --query tenantId -o tsv)

echo "== App registration $APP_NAME (tenant $TENANT)"
APP_ID=$(az ad app list --display-name "$APP_NAME" --query "[0].appId" -o tsv)
if [ -z "$APP_ID" ]; then
  APP_ID=$(az ad app create --display-name "$APP_NAME" --sign-in-audience AzureADMyOrg --query appId -o tsv)
fi
OBJ_ID=$(az ad app show --id "$APP_ID" --query id -o tsv)
SCOPE_ID=$(az ad app show --id "$APP_ID" --query "api.oauth2PermissionScopes[?value=='access_as_user'].id | [0]" -o tsv)
[ -n "$SCOPE_ID" ] || SCOPE_ID=$(python -c "import uuid; print(uuid.uuid4())")

echo "== Expose an API + SPA redirect URIs"
body=$(python - "$SWA_HOST" "$APP_ID" "$SCOPE_ID" <<'PY'
import json, sys
host, app, scope = sys.argv[1:4]
print(json.dumps({
    "identifierUris": [f"api://{host}/{app}"],
    "spa": {"redirectUris": [f"https://{host}/auth-redirect.html", "http://localhost:5173/auth-redirect.html"]},
    "api": {"oauth2PermissionScopes": [{
        "id": scope, "value": "access_as_user", "type": "User", "isEnabled": True,
        "adminConsentDisplayName": "Ver rutas de WH3D", "adminConsentDescription": "Permite a la app leer rutas de picking en nombre del usuario.",
        "userConsentDisplayName": "Ver rutas de WH3D", "userConsentDescription": "Permite a la app leer rutas de picking en tu nombre.",
    }]},
}))
PY
)
az rest --method PATCH --uri "https://graph.microsoft.com/v1.0/applications/$OBJ_ID" --headers "Content-Type=application/json" --body "$body" -o none

echo "== Teams preautorizado + permiso sobre su propio scope"
body=$(python - "$APP_ID" "$SCOPE_ID" "${TEAMS_CLIENTS[@]}" <<'PY'
import json, sys
app, scope, *teams = sys.argv[1:]
print(json.dumps({
    "api": {"preAuthorizedApplications": [{"appId": t, "delegatedPermissionIds": [scope]} for t in teams]},
    "requiredResourceAccess": [{"resourceAppId": app, "resourceAccess": [{"id": scope, "type": "Scope"}]}],
}))
PY
)
az rest --method PATCH --uri "https://graph.microsoft.com/v1.0/applications/$OBJ_ID" --headers "Content-Type=application/json" --body "$body" -o none

echo "== Service principal + consentimiento de administrador"
az ad sp show --id "$APP_ID" -o none 2>/dev/null || az ad sp create --id "$APP_ID" -o none
az ad app permission admin-consent --id "$APP_ID" 2>/dev/null \
  || echo "   (No he podido dar el consentimiento de admin: hazlo en el portal → API permissions → Grant admin consent)"

echo "== Client secret (no se muestra)"
SECRET=$(az ad app credential reset --id "$APP_ID" --display-name wh3d-demo --years 1 --append --query password -o tsv)

python - "$ROOT/api/local.settings.json" "$ROOT/api/local.settings.sample.json" "$TENANT" "$APP_ID" "$SWA_HOST" "$FNO_URL" "$SECRET" <<'PY'
import json, os, sys
path, sample, tenant, app, host, fno, secret = sys.argv[1:]
d = json.load(open(path if os.path.exists(path) else sample, encoding="utf-8"))
d["Values"].update({
    "ENTRA_TENANT_ID": tenant,
    "ENTRA_API_AUDIENCE": f"api://{host}/{app}",
    "FNO_URL": fno,
    "FNO_CLIENT_ID": app,
    "FNO_CLIENT_SECRET": secret,
})
json.dump(d, open(path, "w", encoding="utf-8"), indent=2)
PY
echo "   api/local.settings.json actualizado (MOCK_MODE sin tocar)."

if [ -n "${RG:-}" ] && [ -n "${SWA:-}" ]; then
  echo "== App settings de la SWA $SWA"
  az staticwebapp appsettings set -g "$RG" -n "$SWA" "${SUB[@]}" --setting-names \
    ENTRA_TENANT_ID="$TENANT" ENTRA_API_AUDIENCE="api://$SWA_HOST/$APP_ID" \
    FNO_URL="$FNO_URL" FNO_CLIENT_ID="$APP_ID" FNO_CLIENT_SECRET="$SECRET" -o none
fi

cat <<EOF

Listo.
  appId (Client ID):  $APP_ID
  tenant:             $TENANT
  App ID URI:         api://$SWA_HOST/$APP_ID
  Scope SPA:          api://$SWA_HOST/$APP_ID/access_as_user

Ahora en Finance: System administration > Setup > Microsoft Entra applications → New
  Client ID = $APP_ID · Name = WH3D · User ID = WH3DSVC (rol Warehouse manager)
EOF

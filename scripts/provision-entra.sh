#!/usr/bin/env bash
# =============================================================================
#  Deal Room accelerator — auto-provision Microsoft Entra app registrations
#  (bash mirror of scripts/provision-entra.ps1). Idempotent: finds/updates the
#  apps by display name. Requires: az CLI (admin login) + jq.
#
#  Creates/ensures: Teams SSO, M365 connector, Bot (+SP), Deal MCP; grants
#  admin consent; writes entra.generated.bicepparam + prints the secret params.
#
#  Usage:
#    scripts/provision-entra.sh --workload dealhub --env dev \
#      --teams-fqdn <teamsAppFqdn> --orch-fqdn <orchestratorFqdn>
# =============================================================================
set -euo pipefail

WORKLOAD="dealhub"; ENVIRONMENT="dev"; DISPLAY_PREFIX=""; TEAMS_FQDN=""; ORCH_FQDN=""
MCP_SCOPE="deals.read"; OUTFILE="./entra.generated.bicepparam"; SKIP_CONSENT="false"; SECRETS_OUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --workload) WORKLOAD="$2"; shift 2;;
    --env) ENVIRONMENT="$2"; shift 2;;
    --display-prefix) DISPLAY_PREFIX="$2"; shift 2;;
    --teams-fqdn) TEAMS_FQDN="$2"; shift 2;;
    --orch-fqdn) ORCH_FQDN="$2"; shift 2;;
    --mcp-scope) MCP_SCOPE="$2"; shift 2;;
    --out) OUTFILE="$2"; shift 2;;
    --secrets-out) SECRETS_OUT="$2"; shift 2;;
    --skip-consent) SKIP_CONSENT="true"; shift;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done
[[ -z "$DISPLAY_PREFIX" ]] && DISPLAY_PREFIX="Deal Room ($ENVIRONMENT)"
command -v jq >/dev/null || { echo "ERROR: jq is required" >&2; exit 1; }

GRAPH_APPID="00000003-0000-0000-c000-000000000000"
echo "== Deal Room — Entra provisioning =="
TENANT_ID="$(az account show --query tenantId -o tsv)"
echo "Tenant: $TENANT_ID  |  Signed-in: $(az account show --query user.name -o tsv)"

# Map Graph delegated scope NAME -> id (avoids hardcoded GUIDs).
GRAPH_SCOPES_JSON="$(az ad sp show --id "$GRAPH_APPID" --query "oauth2PermissionScopes" -o json)"
scope_id() { echo "$GRAPH_SCOPES_JSON" | jq -r --arg v "$1" '.[] | select(.value==$v) | .id'; }
# Build a requiredResourceAccess JSON array for the given delegated scope names.
rra_json() {
  local access="[]"
  for n in "$@"; do
    local id; id="$(scope_id "$n")"
    [[ -z "$id" || "$id" == "null" ]] && { echo "unknown scope $n" >&2; exit 1; }
    access="$(echo "$access" | jq --arg id "$id" '. + [{id:$id,type:"Scope"}]')"
  done
  jq -n --arg g "$GRAPH_APPID" --argjson a "$access" '[{resourceAppId:$g,resourceAccess:$a}]'
}

# PATCH a Graph application object, retrying on new-app replication lag.
graph_patch() {
  local obj="$1" body="$2" i out
  for i in 1 2 3 4 5 6; do
    if out="$(az rest --method PATCH --url "https://graph.microsoft.com/v1.0/applications/$obj" \
                --headers 'Content-Type=application/json' --body "$body" 2>&1)"; then return 0; fi
    [[ $i -eq 6 ]] && { echo "graph PATCH failed: $out" >&2; return 1; }
    sleep $(( i*5 < 20 ? i*5 : 20 ))
  done
}

ensure_app() { # <display-name> [sign-in-audience] -> prints "appId objId"
  local name="$1" aud="${2:-AzureADMyOrg}" found
  found="$(az ad app list --filter "displayName eq '$name'" --query "[0].{appId:appId,id:id}" -o json)"
  if [[ "$found" != "null" && -n "$found" ]]; then
    echo "  found  $name" >&2
  else
    echo "  create $name" >&2
    found="$(az ad app create --display-name "$name" --sign-in-audience "$aud" --query "{appId:appId,id:id}" -o json)"
  fi
  echo "$(echo "$found" | jq -r .appId) $(echo "$found" | jq -r .id)"
}
ensure_sp() { az ad sp show --id "$1" >/dev/null 2>&1 || az ad sp create --id "$1" >/dev/null; }
grant_consent() { [[ "$SKIP_CONSENT" == "true" ]] || az ad app permission admin-consent --id "$1" >/dev/null 2>&1 || true; }
new_secret() { az ad app credential reset --id "$1" --display-name "${2:-accelerator}" --years 2 --query password -o tsv; }

TEAMS_CLIENTS='["1fec8e78-bce4-4aaf-ab1b-5451cc387264","5e3ce6c0-2b1f-4285-8d4b-75ee78787346","4765445b-32c6-49b0-83e6-1d93765276ca","0ec893e0-5785-4de6-99da-4ed124e5296c","d3590ed6-52b3-4102-aeff-aad2292ab01c","bc59ab01-8403-45c6-8796-ac3ef710b3e3","27922004-5251-4030-b22d-91ecd9a37ea4"]'

# 1) Teams tab SSO ------------------------------------------------------------
echo "[1/4] Teams tab SSO"
read -r SSO_APPID SSO_OBJ < <(ensure_app "$DISPLAY_PREFIX Teams SSO")
IDURI="api://${SSO_APPID}"; [[ -n "$TEAMS_FQDN" ]] && IDURI="api://${TEAMS_FQDN}/${SSO_APPID}"
SID="$(az ad app show --id "$SSO_APPID" --query "api.oauth2PermissionScopes[?value=='access_as_user'].id | [0]" -o tsv)"
[[ -z "$SID" || "$SID" == "None" ]] && SID="$(cat /proc/sys/kernel/random/uuid)"
SSO_BODY="$(jq -n --arg id "$SID" --arg uri "$IDURI" --argjson clients "$TEAMS_CLIENTS" \
  --argjson rra "$(rra_json User.Read Files.ReadWrite Sites.ReadWrite.All offline_access)" '{
  identifierUris: [$uri],
  requiredResourceAccess: $rra,
  api: {
    requestedAccessTokenVersion: 2,
    oauth2PermissionScopes: [{ id:$id, value:"access_as_user", type:"User", isEnabled:true,
      adminConsentDisplayName:"Access Deal Room as the signed-in user",
      adminConsentDescription:"Allows the Deal Room Teams app to call its API as the signed-in user.",
      userConsentDisplayName:"Access Deal Room as you",
      userConsentDescription:"Allows the Deal Room Teams app to call its API as you." }],
    preAuthorizedApplications: [ $clients[] | { appId: ., delegatedPermissionIds: [$id] } ]
  }
}')"
graph_patch "$SSO_OBJ" "$SSO_BODY"
ensure_sp "$SSO_APPID"; grant_consent "$SSO_APPID"
SSO_SECRET="$(new_secret "$SSO_APPID" teams-tab)"
echo "  identifierUri: $IDURI"

# 2) M365 connector -----------------------------------------------------------
echo "[2/4] M365 connector"
read -r M365_APPID M365_OBJ < <(ensure_app "$DISPLAY_PREFIX M365 Connector")
REDIRECTS="[]"
[[ -n "$ORCH_FQDN" ]]  && REDIRECTS="$(echo "$REDIRECTS" | jq --arg u "https://$ORCH_FQDN/api/m365/callback" '. + [$u]')"
[[ -n "$TEAMS_FQDN" ]] && REDIRECTS="$(echo "$REDIRECTS" | jq --arg u "https://$TEAMS_FQDN/api/m365/callback" '. + [$u]')"
M365_BODY="$(jq -n --argjson r "$REDIRECTS" \
  --argjson rra "$(rra_json offline_access openid profile email User.Read Team.ReadBasic.All Team.Create Channel.Create ChannelSettings.ReadWrite.All Sites.ReadWrite.All Files.ReadWrite.All GroupMember.Read.All TeamMember.ReadWrite.All TeamsAppInstallation.ReadWriteForTeam)" \
  '{ web: { redirectUris: $r }, requiredResourceAccess: $rra }')"
graph_patch "$M365_OBJ" "$M365_BODY"
ensure_sp "$M365_APPID"; grant_consent "$M365_APPID"
M365_SECRET="$(new_secret "$M365_APPID" m365-connector)"

# 3) Teams bot ----------------------------------------------------------------
echo "[3/4] Teams bot"
read -r BOT_APPID BOT_OBJ < <(ensure_app "$DISPLAY_PREFIX Bot" AzureADMultipleOrgs)
ensure_sp "$BOT_APPID"   # REQUIRED: without the SP the bot cannot acquire a reply token (AADSTS7000229)
BOT_SECRET="$(new_secret "$BOT_APPID" bot)"

# 4) Deal MCP server ----------------------------------------------------------
echo "[4/4] Deal MCP server"
read -r MCP_APPID MCP_OBJ < <(ensure_app "$DISPLAY_PREFIX MCP")
MSID="$(az ad app show --id "$MCP_APPID" --query "api.oauth2PermissionScopes[?value=='$MCP_SCOPE'].id | [0]" -o tsv)"
[[ -z "$MSID" || "$MSID" == "None" ]] && MSID="$(cat /proc/sys/kernel/random/uuid)"
MCP_BODY="$(jq -n --arg id "$MSID" --arg uri "api://${MCP_APPID}" --arg sc "$MCP_SCOPE" '{
  identifierUris: [$uri],
  api: { oauth2PermissionScopes: [{ id:$id, value:$sc, type:"User", isEnabled:true,
    adminConsentDisplayName:"Read Deal Room deals", adminConsentDescription:"Read the Deal Room deal pipeline via the MCP server.",
    userConsentDisplayName:"Read deals", userConsentDescription:"Read the Deal Room deal pipeline." }] }
}')"
graph_patch "$MCP_OBJ" "$MCP_BODY"
ensure_sp "$MCP_APPID"

# ---- Emit the bicepparam fragment ------------------------------------------
{
  echo "// GENERATED by scripts/provision-entra.sh — merge into your main.<env>.bicepparam"
  echo "param teamsTabClientId = '$SSO_APPID'"
  echo "param m365ClientId = '$M365_APPID'"
  echo "param botAppId = '$BOT_APPID'"
  echo "param entraTenantId = '$TENANT_ID'"
  echo "param m365TenantId = '$TENANT_ID'"
  echo "param mcpAudience = 'api://${MCP_APPID}'"
  echo "param mcpRequiredScope = '$MCP_SCOPE'"
  echo "param deployBot = true"
  echo "param deployTeamsApp = true"
} > "$OUTFILE"

echo ""
echo "== Done =="
echo "Wrote non-secret IDs -> $OUTFILE"
if [[ -n "$SECRETS_OUT" ]]; then
  { echo "teamsTabClientSecret=$SSO_SECRET"; echo "m365ClientSecret=$M365_SECRET"; echo "botAppPassword=$BOT_SECRET"; } > "$SECRETS_OUT"
  chmod 600 "$SECRETS_OUT" 2>/dev/null || true
  echo "Wrote secret parameters -> $SECRETS_OUT (delete after use)"
else
  echo ""
  echo "Pass these SECRET parameters at deploy time (shown once, not saved):"
  echo "  --parameters \\"
  echo "    teamsTabClientSecret=$SSO_SECRET \\"
  echo "    m365ClientSecret=$M365_SECRET \\"
  echo "    botAppPassword=$BOT_SECRET"
fi
[[ -z "$TEAMS_FQDN" ]] && echo "" && echo "NOTE: --teams-fqdn not supplied; SSO identifierUri is host-less (api://<appId>). Re-run with --teams-fqdn once the Teams Container App exists so Teams SSO matches the tab domain."

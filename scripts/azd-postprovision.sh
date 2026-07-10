#!/usr/bin/env sh
# azd postprovision hook (POSIX) — FULL mode only: provision the Entra app registrations
# and persist their IDs/secrets to the azd environment so the next `azd up` wires them.
# DEMO mode (default) skips this (no identity, no admin needed).
set -e
MODE="${DEALROOM_MODE:-demo}"
if [ "$MODE" != "full" ]; then
  echo "[azd] DEALROOM_MODE=$MODE — skipping Entra provisioning (demo mode)."
  echo "[azd] Enable Teams SSO / M365 / bot with:  azd env set DEALROOM_MODE full  &&  azd up"
  exit 0
fi
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(dirname "$HERE")"
VALS="$(azd env get-values)"
val() { echo "$VALS" | grep -i "^$1=" | head -1 | sed 's/^[^=]*=//; s/^"//; s/"$//'; }
TEAMS_FQDN="$(val teamsAppFqdn)"
ORCH_FQDN="$(val orchestratorFqdn)"
ENVN="${AZURE_ENV_NAME:-dev}"
GEN="$REPO/entra.generated.bicepparam"
SECRETS="$(mktemp)"

echo "[azd] Provisioning Entra app registrations (full mode)…"
"$HERE/provision-entra.sh" --env "$ENVN" --teams-fqdn "$TEAMS_FQDN" --orch-fqdn "$ORCH_FQDN" --out "$GEN" --secrets-out "$SECRETS"

gp() { sed -n "s/^param $1 = '\(.*\)'.*/\1/p" "$GEN"; }
azd env set TEAMS_TAB_CLIENT_ID "$(gp teamsTabClientId)"
azd env set M365_CLIENT_ID "$(gp m365ClientId)"
azd env set BOT_APP_ID "$(gp botAppId)"
azd env set ENTRA_TENANT_ID "$(gp entraTenantId)"
azd env set M365_TENANT_ID "$(gp m365TenantId)"
azd env set MCP_AUDIENCE "$(gp mcpAudience)"
while IFS='=' read -r k v; do
  case "$k" in
    teamsTabClientSecret) azd env set TEAMS_TAB_CLIENT_SECRET "$v" ;;
    m365ClientSecret) azd env set M365_CLIENT_SECRET "$v" ;;
    botAppPassword) azd env set BOT_APP_PASSWORD "$v" ;;
  esac
done < "$SECRETS"
rm -f "$SECRETS"
echo "[azd] Entra apps provisioned and saved to the azd environment."
echo "[azd] Run 'azd up' once more to wire the identity (Teams SSO / M365 / bot) into the platform."

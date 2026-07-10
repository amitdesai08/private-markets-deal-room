#!/usr/bin/env bash
# =============================================================================
#  Deal Room accelerator — ONE unified deploy workflow (Linux / macOS).
#  Pick options interactively or pass flags; auto-detects the identity path and
#  runs: subscription select -> (what-if) -> infra deploy -> Entra provisioning
#  -> wire -> summary. Windows users: run scripts/deploy.ps1 (identical workflow).
#
#  Flags: --mode demo|full  --identity provision|deployment-script|byo
#         --env <name>  --location <region>  --subscription <id>
#         --param-file <bicepparam>  --provisioning-identity <uami-resource-id>
#         --what-if  --yes
# =============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMPL="$ROOT/infra/main.bicep"

MODE="ask"; IDENTITY="ask"; ENVIRONMENT="dev"; LOCATION="swedencentral"; SUBSCRIPTION=""
PARAM_FILE="$ROOT/infra/main.sample.bicepparam"; PROV_ID=""; DO_WHATIF="false"; YES="false"
while [[ $# -gt 0 ]]; do case "$1" in
  --mode) MODE="$2"; shift 2;; --identity) IDENTITY="$2"; shift 2;;
  --env) ENVIRONMENT="$2"; shift 2;; --location) LOCATION="$2"; shift 2;;
  --subscription) SUBSCRIPTION="$2"; shift 2;; --param-file) PARAM_FILE="$2"; shift 2;;
  --provisioning-identity) PROV_ID="$2"; shift 2;; --what-if) DO_WHATIF="true"; shift;;
  --yes) YES="true"; shift;; *) echo "unknown arg: $1" >&2; exit 2;; esac; done
DEPLOY_NAME="dealhub-$ENVIRONMENT"

ask() { if [[ "$YES" == "true" ]]; then echo "$2"; return; fi; read -rp "$1 [$2]: " a; echo "${a:-$2}"; }

# 0) Login + subscription
az account show >/dev/null 2>&1 || az login >/dev/null
[[ -n "$SUBSCRIPTION" ]] && az account set --subscription "$SUBSCRIPTION"
echo "Subscription : $(az account show --query name -o tsv)"
echo "Tenant       : $(az account show --query tenantId -o tsv)"

# 1) Mode
if [[ "$MODE" == "ask" ]]; then
  echo ""; echo "Deployment mode:"; echo "  [1] demo  — infra + seeded data, no identity (fastest)"; echo "  [2] full  — Teams SSO + per-user M365 docs + bot"
  [[ "$(ask 'Choose 1/2' '1')" == "2" ]] && MODE="full" || MODE="demo"
fi

# 2) Identity path (full only) — auto-detect when ask
if [[ "$MODE" == "full" && "$IDENTITY" == "ask" ]]; then
  if [[ -n "$PROV_ID" ]]; then IDENTITY="deployment-script"
  elif grep -Eq "teamsTabClientId[[:space:]]*=[[:space:]]*'[0-9a-fA-F-]{10,}'" "$PARAM_FILE"; then IDENTITY="byo"
  else
    echo ""; echo "Entra app registrations:"
    echo "  [1] provision          — auto-create now with your admin login (recommended)"
    echo "  [2] deployment-script  — create inside the Bicep deploy (needs a Graph-permissioned UAMI)"
    echo "  [3] byo                — app IDs already set in your parameter file"
    case "$(ask 'Choose 1/2/3' '1')" in 2) IDENTITY="deployment-script";; 3) IDENTITY="byo";; *) IDENTITY="provision";; esac
  fi
fi
[[ "$MODE" == "demo" ]] && IDENTITY="none"
echo ""; echo "Mode = $MODE   Identity = $IDENTITY"; echo ""

deploy() { # $1=verb(create|what-if) ; remaining = extra params
  local verb="$1"; shift
  az deployment sub "$verb" --name "$DEPLOY_NAME" --location "$LOCATION" \
    --template-file "$TMPL" --parameters "$PARAM_FILE" --parameters "environmentName=$ENVIRONMENT" "$@"
}

# 3) What-if
if [[ "$DO_WHATIF" == "true" ]]; then
  deploy what-if
  [[ "$(ask 'Proceed with deploy? y/n' 'y')" == "y" ]] || { echo "Aborted."; exit 0; }
fi

# 4) Deploy infrastructure
ID_PARAMS=()
if [[ "$IDENTITY" == "deployment-script" ]]; then
  [[ -n "$PROV_ID" ]] || { echo "deployment-script identity requires --provisioning-identity" >&2; exit 1; }
  ID_PARAMS=(--parameters "deployIdentityProvisioning=true" "provisioningIdentityResourceId=$PROV_ID")
fi
echo "== Deploying infrastructure =="
deploy create "${ID_PARAMS[@]}" >/dev/null
OUT="$(az deployment sub show --name "$DEPLOY_NAME" --query properties.outputs -o json)"
TEAMS_FQDN="$(echo "$OUT" | jq -r '.teamsAppFqdn.value')"
ORCH_FQDN="$(echo "$OUT" | jq -r '.orchestratorFqdn.value')"
echo "Teams FQDN : $TEAMS_FQDN"; echo "Orch  FQDN : $ORCH_FQDN"

# 5) Provision Entra (local script) + wire
if [[ "$IDENTITY" == "provision" ]]; then
  echo ""; echo "== Provisioning Entra app registrations =="
  SECRETS="$(mktemp)"; GEN="$ROOT/entra.generated.bicepparam"
  "$ROOT/scripts/provision-entra.sh" --env "$ENVIRONMENT" \
    --teams-fqdn "$TEAMS_FQDN" --orch-fqdn "$ORCH_FQDN" --out "$GEN" --secrets-out "$SECRETS"
  echo ""; echo "== Wiring identity into the platform =="
  mapfile -t SECRET_ARGS < "$SECRETS"
  az deployment sub create --name "$DEPLOY_NAME" --location "$LOCATION" --template-file "$TMPL" \
    --parameters "$PARAM_FILE" --parameters "$GEN" --parameters "environmentName=$ENVIRONMENT" \
    --parameters "${SECRET_ARGS[@]}" >/dev/null
  rm -f "$SECRETS"
fi

echo ""; echo "== Done =="
echo "Next — build + roll the application images:"
echo "  az acr build -r <acr> -t deal-room:v1     --file app/Dockerfile app"
echo "  az acr build -r <acr> -t dealhub-teams:v1 --file teams-app/Dockerfile teams-app"
echo "  az containerapp update -n ca-dealhub-orch-$ENVIRONMENT-swc  -g rg-dealhub-app-$ENVIRONMENT-swc --image <acr>/deal-room@<digest>"
echo "  az containerapp update -n ca-dealhub-teams-$ENVIRONMENT-swc -g rg-dealhub-app-$ENVIRONMENT-swc --image <acr>/dealhub-teams@<digest>"

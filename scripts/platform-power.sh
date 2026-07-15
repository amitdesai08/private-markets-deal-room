#!/usr/bin/env bash
# Power the whole Deal Room platform off/on for cost control.
#
# Stops/starts everything that CAN be stopped as one unit, and reports the
# standing-cost resources that cannot (so there are no surprises on the bill).
#
#   Acted on:   Container Apps (orchestrator + Teams), Function App (start/stop),
#               Fabric capacity (suspend/resume, if deployed) — skip with --compute-only.
#   Reported:   AI Search, API Management, Container Registry, Log Analytics,
#               App Insights, Cosmos (serverless) — billed while they exist.
#
#   stop    Stop everything stoppable (the whole platform off).
#   start   Start everything back up.
#   sleep   Stop the ORCHESTRATOR only, leaving the Teams app up so anyone can
#           self-serve "Bring online" from the in-Teams offline gate.
#   status  Show running state of the apps (+ Fabric) and list standing costs.
#
# Usage:
#   ./platform-power.sh <stop|start|sleep|status> [--env dev] [--compute-only] [--yes]
#   ENV / LOCATION_SHORT / WORKLOAD / RESOURCE_GROUP / ORCH_APP / TEAMS_APP override defaults.
# Requires the Azure CLI, logged in (az login) with rights on the resource groups.
set -euo pipefail

ACTION="${1:-}"; shift || true
ENV_NAME="${ENV:-dev}"
LOC="${LOCATION_SHORT:-swc}"
WORKLOAD="${WORKLOAD:-dealhub}"
YES="${YES:-false}"
COMPUTE_ONLY=false

while [ $# -gt 0 ]; do
  case "$1" in
    --env) ENV_NAME="$2"; shift 2 ;;
    --compute-only) COMPUTE_ONLY=true; shift ;;
    --yes|-y) YES=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

case "$ACTION" in stop|start|sleep|status) ;; *)
  echo "Usage: $0 <stop|start|sleep|status> [--env dev] [--compute-only] [--yes]" >&2; exit 2 ;;
esac

APP_RG="${RESOURCE_GROUP:-rg-${WORKLOAD}-app-${ENV_NAME}-${LOC}}"
DATA_RG="rg-${WORKLOAD}-data-${ENV_NAME}-${LOC}"
AI_RG="rg-${WORKLOAD}-ai-${ENV_NAME}-${LOC}"
CORE_RG="rg-${WORKLOAD}-core-${ENV_NAME}-${LOC}"
INT_RG="rg-${WORKLOAD}-integration-${ENV_NAME}-${LOC}"
ORCH="${ORCH_APP:-ca-${WORKLOAD}-orch-${ENV_NAME}-${LOC}}"
TEAMS="${TEAMS_APP:-ca-${WORKLOAD}-teams-${ENV_NAME}-${LOC}}"

ORCH_ID="$(az containerapp show -n "$ORCH" -g "$APP_RG" --query id -o tsv 2>/dev/null || true)"
if [ -z "$ORCH_ID" ]; then
  echo "Orchestrator app '$ORCH' not found in '$APP_RG'. Set RESOURCE_GROUP/ORCH_APP/ENV." >&2
  exit 1
fi
TEAMS_ID="$(az containerapp show -n "$TEAMS" -g "$APP_RG" --query id -o tsv 2>/dev/null || true)"

rg_exists() { [ "$(az group exists -n "$1")" = "true" ]; }
running() { az containerapp show -n "$1" -g "$APP_RG" --query 'properties.runningStatus' -o tsv 2>/dev/null || echo 'Unknown'; }
# Start/stop a container app via ARM — works on any az CLI (`az containerapp stop`
# isn't available on older versions).
ca_power() { [ -n "$1" ] || return 0; az rest --method post --url "https://management.azure.com$1/$2?api-version=2024-03-01" --only-show-errors >/dev/null 2>&1 || true; }
set_lease() { az tag update --resource-id "$ORCH_ID" --operation Merge \
  --tags "dealroom-lease-mode=$1" "dealroom-lease-expires=${2:-0}" 'dealroom-lease-by=script' >/dev/null; }
confirm() {
  [ "$YES" = "true" ] && return 0
  read -r -p "About to $1. Continue? [y/N] " ans
  case "$ans" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

functions_op() {  # $1 = stop|start
  { [ "$COMPUTE_ONLY" = "true" ] || ! rg_exists "$APP_RG"; } && return 0
  for f in $(az functionapp list -g "$APP_RG" --query '[].name' -o tsv 2>/dev/null); do
    echo "  $1 function app $f"; az functionapp "$1" -n "$f" -g "$APP_RG" >/dev/null 2>&1 || true
  done
}
fabric_op() {  # $1 = suspend|resume
  { [ "$COMPUTE_ONLY" = "true" ] || ! rg_exists "$DATA_RG"; } && return 0
  for c in $(az resource list -g "$DATA_RG" --resource-type 'Microsoft.Fabric/capacities' --query '[].id' -o tsv 2>/dev/null); do
    echo "  $1 Fabric capacity"; az resource invoke-action --ids "$c" --action "$1" --api-version 2023-11-01 >/dev/null 2>&1 || true
  done
}
standing_costs() {
  echo ''
  echo 'Standing-cost resources (NOT stopped — remove by tearing down the stack):'
  local any=false
  # rg|type|note
  local rows=(
    "$AI_RG|Microsoft.Search/searchServices|SKU-billed while it exists (not stoppable)"
    "$INT_RG|Microsoft.ApiManagement/service|SKU-billed while it exists (not stoppable)"
    "$APP_RG|Microsoft.ContainerRegistry/registries|small (Basic); holds your images"
    "$CORE_RG|Microsoft.OperationalInsights/workspaces|ingestion/retention billed"
    "$CORE_RG|Microsoft.Insights/components|ingestion billed"
    "$DATA_RG|Microsoft.DocumentDB/databaseAccounts|serverless = per-request; left up to protect data"
  )
  for row in "${rows[@]}"; do
    IFS='|' read -r rg type note <<< "$row"
    rg_exists "$rg" || continue
    for n in $(az resource list -g "$rg" --resource-type "$type" --query '[].name' -o tsv 2>/dev/null); do
      any=true; printf '  - %-22s %s  (%s)\n' "${type##*/}" "$n" "$note"
    done
  done
  [ "$any" = "true" ] || echo '  (none found)'
}

case "$ACTION" in
  status)
    echo "Orchestrator  $ORCH : $(running "$ORCH")"
    echo "Teams app     $TEAMS : $(running "$TEAMS")"
    fns="$(az functionapp list -g "$APP_RG" --query '[].{n:name,s:state}' -o tsv 2>/dev/null || true)"; [ -n "$fns" ] && echo "Function app  $fns"
    if rg_exists "$DATA_RG"; then fab="$(az resource list -g "$DATA_RG" --resource-type 'Microsoft.Fabric/capacities' --query '[0].properties.state' -o tsv 2>/dev/null || true)"; [ -n "$fab" ] && echo "Fabric        capacity: $fab"; fi
    echo "Lease         $(az containerapp show -n "$ORCH" -g "$APP_RG" --query "tags.\"dealroom-lease-mode\"" -o tsv 2>/dev/null || echo '-')"
    standing_costs
    ;;
  sleep)
    confirm "put the orchestrator to sleep (Teams gate stays up)" || { echo 'Cancelled.'; exit 0; }
    set_lease asleep
    ca_power "$ORCH_ID" stop
    echo "Orchestrator asleep. The Teams app stays up so users can wake it from the offline gate."
    ;;
  stop)
    scope="the whole platform (apps + functions + Fabric)"; [ "$COMPUTE_ONLY" = "true" ] && scope="the container apps"
    confirm "STOP $scope" || { echo 'Cancelled.'; exit 0; }
    set_lease asleep
    ca_power "$ORCH_ID" stop
    ca_power "$TEAMS_ID" stop
    functions_op stop
    fabric_op suspend
    echo "Platform stopped. Run '$0 start' to bring it back up."
    standing_costs
    ;;
  start)
    ca_power "$ORCH_ID" start
    ca_power "$TEAMS_ID" start
    functions_op start
    fabric_op resume
    set_lease indefinite
    echo "Platform started (lease: indefinite). Give the apps ~1 minute to become ready."
    ;;
esac

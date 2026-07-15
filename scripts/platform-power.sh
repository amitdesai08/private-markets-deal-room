#!/usr/bin/env bash
# Power the whole Deal Room platform off/on for cost control.
#
# The Deal Room's running cost is dominated by its two Azure Container Apps. This
# script stops/starts them as one unit so an idle demo costs almost nothing.
#
#   stop    Stop BOTH apps (orchestrator + Teams) — the whole platform off.
#   start   Start both apps (marks the orchestrator lease "indefinite").
#   sleep   Stop the ORCHESTRATOR only, leaving the Teams app up so anyone can
#           self-serve "Bring online" from the in-Teams offline gate.
#   status  Show the running state of both apps and the orchestrator's lease tag.
#
# Usage:
#   ./platform-power.sh <stop|start|sleep|status> [--env dev] [--yes]
#   ENV / LOCATION_SHORT / WORKLOAD / RESOURCE_GROUP / ORCH_APP / TEAMS_APP override defaults.
# Requires the Azure CLI, logged in (az login) with rights on the app resource group.
set -euo pipefail

ACTION="${1:-}"; shift || true
ENV_NAME="${ENV:-dev}"
LOC="${LOCATION_SHORT:-swc}"
WORKLOAD="${WORKLOAD:-dealhub}"
YES="${YES:-false}"

while [ $# -gt 0 ]; do
  case "$1" in
    --env) ENV_NAME="$2"; shift 2 ;;
    --yes|-y) YES=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

case "$ACTION" in stop|start|sleep|status) ;; *)
  echo "Usage: $0 <stop|start|sleep|status> [--env dev] [--yes]" >&2; exit 2 ;;
esac

RG="${RESOURCE_GROUP:-rg-${WORKLOAD}-app-${ENV_NAME}-${LOC}}"
ORCH="${ORCH_APP:-ca-${WORKLOAD}-orch-${ENV_NAME}-${LOC}}"
TEAMS="${TEAMS_APP:-ca-${WORKLOAD}-teams-${ENV_NAME}-${LOC}}"

ORCH_ID="$(az containerapp show -n "$ORCH" -g "$RG" --query id -o tsv 2>/dev/null || true)"
if [ -z "$ORCH_ID" ]; then
  echo "Orchestrator app '$ORCH' not found in '$RG'. Set RESOURCE_GROUP/ORCH_APP/ENV." >&2
  exit 1
fi

running() { az containerapp show -n "$1" -g "$RG" --query 'properties.runningStatus' -o tsv 2>/dev/null || echo 'Unknown'; }
set_lease() { az tag update --resource-id "$ORCH_ID" --operation Merge \
  --tags "dealroom-lease-mode=$1" "dealroom-lease-expires=${2:-0}" 'dealroom-lease-by=script' >/dev/null; }
confirm() {
  [ "$YES" = "true" ] && return 0
  read -r -p "About to $1. Continue? [y/N] " ans
  case "$ans" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

case "$ACTION" in
  status)
    echo "Orchestrator  $ORCH : $(running "$ORCH")"
    echo "Teams app     $TEAMS : $(running "$TEAMS")"
    echo "Lease         $(az containerapp show -n "$ORCH" -g "$RG" --query "tags.\"dealroom-lease-mode\"" -o tsv 2>/dev/null || echo '-')"
    ;;
  sleep)
    confirm "put the orchestrator to sleep (Teams gate stays up)" || { echo 'Cancelled.'; exit 0; }
    set_lease asleep
    az containerapp stop -n "$ORCH" -g "$RG" >/dev/null
    echo "Orchestrator asleep. The Teams app stays up so users can wake it from the offline gate."
    ;;
  stop)
    confirm "STOP the whole platform (both apps)" || { echo 'Cancelled.'; exit 0; }
    set_lease asleep
    az containerapp stop -n "$ORCH" -g "$RG" >/dev/null
    az containerapp stop -n "$TEAMS" -g "$RG" >/dev/null
    echo "Whole platform stopped. Run '$0 start' to bring it back up."
    ;;
  start)
    az containerapp start -n "$ORCH" -g "$RG" >/dev/null
    az containerapp start -n "$TEAMS" -g "$RG" >/dev/null
    set_lease indefinite
    echo "Whole platform started (lease: indefinite). Give the apps ~1 minute to become ready."
    ;;
esac

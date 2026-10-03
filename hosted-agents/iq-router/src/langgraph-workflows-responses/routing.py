"""Deterministic prompt routing and data-boundary policy for the four IQ peers."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class IqRoute:
    id: str
    label: str
    agent: str
    protocol: str
    data_class: str
    reason: str
    signals: re.Pattern[str]


IQ_ROUTES = (
    IqRoute("foundry", "Foundry IQ", "deal-room-foundry-iq", "A2A", "internal-data", "firm knowledge, playbooks, citations, and cross-agent synthesis", re.compile(r"\b(playbook|policy|precedent|citation|memo|deck|recommend|synthesi[sz]|agent|skill|methodology|framework)\b", re.I)),
    IqRoute("fabric", "Fabric IQ", "deal-room-fabric-iq", "A2A", "internal-data", "fund, portfolio, model, and lakehouse analytics", re.compile(r"\b(fabric|lakehouse|onelake|portfolio|fund|exposure|benchmark|trend|returns?|irr|moic|leverage|model|valuation|multiple|ebitda)\b", re.I)),
    IqRoute("work", "Work IQ", "deal-room-work-iq", "A2A", "internal-data", "user-scoped Microsoft 365 mail, files, meetings, and conversations", re.compile(r"\b(work iq|microsoft 365|m365|sharepoint|teams|channel|chat|mail|email|outlook|meeting|calendar|file|document|message|correspondence)\b", re.I)),
    IqRoute("web", "Web IQ", "deal-room-web-iq", "A2A", "external-web", "current public-web company, market, and news intelligence", re.compile(r"\b(web iq|public web|internet|latest news|current news|news|press release|website|online|market update|public source|search the web)\b", re.I)),
)


def _public_route(route: IqRoute) -> dict:
    value = asdict(route)
    value.pop("signals")
    value["dataClass"] = value.pop("data_class")
    return value


def route_prompt(prompt: str) -> dict:
    text = str(prompt or "").strip()
    matched_routes = [route for route in IQ_ROUTES if route.signals.search(text)]
    primary = matched_routes[0] if matched_routes else IQ_ROUTES[0]
    blocked = any(route.id == "web" for route in matched_routes) and any(
        route.data_class == "internal-data" for route in matched_routes
    )
    decision = (
        f"Prompt matched {primary.label}: {primary.reason}."
        if matched_routes
        else f"No specialist data signal matched; {primary.label} owns orchestration and synthesis."
    )
    trace = [
        {"id": "route", "kind": "route", "label": f"Route to {primary.label}", "detail": decision, "iq": primary.id, "status": "complete"},
        {
            "id": "boundary" if blocked else "handoff",
            "kind": "route" if blocked else "handoff",
            "label": "Internal/public boundary blocked" if blocked else f"Handoff to {primary.agent}",
            "detail": "Split internal and public-web research into separate requests." if blocked else primary.reason,
            "iq": primary.id,
            "agent": primary.agent,
            "protocol": primary.protocol,
            "status": "blocked" if blocked else "complete",
        },
    ]
    return {
        "version": 1,
        **_public_route(primary),
        "matched": [route.id for route in matched_routes],
        "blockedCombination": blocked,
        "decision": decision,
        "trace": trace,
    }
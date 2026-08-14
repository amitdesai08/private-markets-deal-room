# Lightning demo — technical audience — 10 minutes

The short cut of the [technical walkthrough](DEMO-WALKTHROUGH-TECHNICAL.md), which runs about
15 minutes. Same product, same claims, fewer stops. For a CTO, VP of Technology, Director of
IT, security architect, or the engineers who would operate this — not for anyone evaluating
whether it helps run a deal, which is the [PE-audience lightning cut](DEMO-LIGHTNING.md).

**Say this before you click anything:**

> "Everything you see is a demonstration book — invented companies, invented people, invented
> numbers. What we're actually looking at is what's underneath: identity, data sovereignty,
> connector governance, the audit trail and the Azure footprint. This deploys into your own
> subscription and your own Entra tenant. It is not a multi-tenant SaaS product."

---

## The ten minutes

| # | Beat | What to do | What it proves |
|---|---|---|---|
| **1** | **Opening** · 1 min | Let the product load, signed in as an administrator. *"One command, `azd up`, into your own Azure subscription and Entra tenant. The five tabs a deal team uses are not today's story — what's underneath them is."* | Sets the frame: this is an infrastructure review, not a feature tour. |
| **2** | **Identity trust seam** · 2 min | **All deals** as admin: **21 of 21**. Switch seat to **Chidi Anagonye — Analyst**, open **All deals** again: **8**. Open a deal this seat is not cleared for — it is not blurred, it is not there. | Access is resolved server-side from Entra ID, never trusted from or filtered by the client. |
| **3** | **Agent isolation** · 2 min | Open **Helvetia Diagnostics** → **💬 Ask the assistant**. *"Every agent is one of two registry-set classes — internal-data or external-web — checked on every tool call. Neither class can reach across the line into the other's territory."* | A prompt-injection or compromised conversation has no channel to move data in either direction. |
| **4** | **Connector governance** · 2 min | **Settings ⚙ → Data sources**. Point at the mix of free, subscription and self-registered sources — none reports connected without a real round trip. Scroll to **Custom sources**, then **Your CRM / deal database**: both sit **pending** until an administrator approves them. | Every outside connection, including the firm's own CRM, is honestly tested and admin-gated before it can move data. |
| **5** | **Audit trail** · 2 min | Ask the assistant a question that proposes an action; point at the **Apply** chip — a person presses it, not the model. Open **Audit trail**: the change carries a **"via assistant, you approved"** badge, timestamped and named. | The AI cannot act unilaterally, and every write — human or assistant-proposed — is attributable. |
| **6** | **Footprint and deploy** · 1 min | No screen needed — talk through it, or open the [architecture diagrams](../ARCHITECTURE.md). *"Six Bicep resource groups, one managed identity, no secrets in the path. Private networking is one switch, off by default. `azd up` stands it up; `seedDemoData = false` ships it with zero fake data for a real customer jumpstart."* | The Azure footprint and the deploy story both hold up under a security review. |

**The three-minute cut:** beats **2 → 4 → 5**. Identity resolved server-side, connectors that
cannot go live unapproved, and a write that is always attributable. That is the whole
security story.

---

## Close

> "One deployment, your subscription, your Entra tenant. Access resolved server-side, two
> hard-isolated agent classes, every connector honestly tested and admin-gated, every write
> attributable, and no secret anywhere in the path."

**Then ask for something.** An architecture review with your security team, a pilot deployment
into a sandbox subscription, or a walk through the repository itself before any decision.

---

## What it addresses for an IT or security reviewer

| What you showed | The concern it addresses |
|---|---|
| Deploys via `azd up` into the customer's own subscription and tenant | "Is this multi-tenant SaaS holding our data?" — no; it is single-tenant, in infrastructure you own. |
| Access resolved server-side from Entra ID, re-verified live with a seat switch | "Is this a display filter or a real boundary?" — verified live: the restricted record is never transmitted. |
| Two registry-set agent classes, checked per tool call | "Can a prompt injection exfiltrate data?" — no reachable path exists between the two classes at the tool layer. |
| Connectors tested with a real round trip; custom sources and the CRM connector pending until approved | "What stops an uncontrolled outbound connection?" — nothing goes live without an administrator's explicit approval. |
| Approve-to-apply plus a named, timestamped audit trail | "Can the AI act without us knowing?" — no; every write is attributed, whether typed by a person or applied from an assistant proposal. |
| Six Bicep resource groups, one managed identity, zero secrets, optional private endpoints | "What is our actual attack surface?" — a scoped, reviewable Azure footprint with no credential to leak. |
| `seedDemoData = false` for a customer jumpstart | "Will our real deployment carry the demo's fake data?" — no; a real deployment boots empty. |

---

## If you are asked

Formal certifications (SOC 2, ISO 27001, pentest reports) are the deploying firm's to obtain
against their own deployment — say so plainly rather than implying the product ships with one.
For anything else — current Azure cost estimates, supported regions, specific compliance
frameworks — get a current answer from the delivery team rather than improvising a figure in
the room.

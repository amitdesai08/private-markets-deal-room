# Demo walkthrough — technical audience

**Who this is for:** a CTO, VP of Technology, Director of IT, security architect, or the
engineers who would actually operate this — anyone evaluating whether The Deal Room is safe
and sensible to deploy, not anyone evaluating whether it helps run a deal. It assumes you know
Azure, Entra ID and enterprise security review, and assumes nothing about private equity.

**How long:** about 15 minutes at a walking pace — the seven acts below add up to roughly
that. If you only have five, run Acts 2, 4 and 6.

**Before you present it once,** sit with this document open beside the live product and click
through it. Every screen name and claim below was checked against the product and the
[architecture](../ARCHITECTURE.md) / [security & compliance](../SECURITY-COMPLIANCE.md)
documents on 14 August 2026 — but the product moves. If a line has not aged well, **correct it
here** rather than working around it live.

> **There is a narrated version of this walkthrough.** [`demo/`](../../demo/) builds a
> click-through of all seven acts — captured against the running product, voiced by Azure AI
> Speech. Useful for rehearsing, for sending to somebody who could not attend, or for playing
> behind you while you talk. Build it with `--scenes scenes-technical.mjs`.

---

## Before you start

- Open the **Deal Room** — either the tab inside Microsoft Teams or the same thing in a
  browser. They are identical, because they are the same build.
- **Say this once, out loud, at the start.** It sets the right expectation for this audience:

  > "Everything you see on screen is an invented demonstration book — the data is not the
  > point of this walkthrough. What we're actually reviewing is what's underneath it: identity,
  > data sovereignty, connector governance, the audit trail, and the Azure footprint. This
  > deploys into your own subscription and your own Entra tenant — it is not a multi-tenant
  > SaaS product."

- This walkthrough is signed in as an **administrator** for most of it, because an
  administrator and an engineer are the audiences who need to see the platform's edges, not
  a partner's daily view of one deal.

---

## The five tabs are not the story

The product a deal team uses is five tabs — Home, Sourcing & screening, All deals, Fund &
Portfolio, Firm reporting. That surface is covered in the [PE-audience
walkthrough](DEMO-WALKTHROUGH.md); this one does not re-cover it, because a technical audience
is not evaluating whether the daily briefing is useful. What this walkthrough covers is
underneath that surface, and it is the same five sections every time:

| Section | What it proves |
|---|---|
| **Identity trust seam** | Access is resolved on the server, never trusted from a client. |
| **Data sovereignty** | Two hard classes of AI agent, checked on every tool call. |
| **Connector governance** | Every outside connection is honestly tested and admin-approved. |
| **Audit trail** | Every write, including every assistant-applied one, is named and timestamped. |
| **Azure footprint** | Six resource groups, managed identity end to end, no secrets in the path. |

---

## Act 1 · Whose tenant this runs in (2 min)

Open the product and let it load. This is signed in as **Michael Realman**, an administrator.

> "This deploys with one command, `azd up`, into your own Azure subscription and your own
> Microsoft Entra tenant. It is not a multi-tenant SaaS product — your data does not leave a
> resource group you control. Everything on the screens I'm about to show you is an invented
> demonstration book. The architecture underneath it is the real, deployed thing, and that's
> what the rest of this covers."

The product surface — five tabs — is small on purpose. That smallness is not the interesting
part of this review.

---

## Act 2 · The identity trust seam (3 min) — *the differentiator*

1. Open **All deals** as the administrator. Note the header count: **21 of 21** — everything
   this seat is cleared for.
2. Switch the signed-in seat (top-bar dropdown) to **Chidi Anagonye — Analyst**. Open **All
   deals** again. The count drops to **8**.

> "Same server, same code path, same API route — a different number came back because a
> different identity made the request. There is no permissions table inside this application.
> The role, the group memberships and the need-to-know grants all live in Microsoft Entra ID,
> the same directory that already governs this firm's Teams and SharePoint. This product reads
> that directory. It does not maintain a second one for an attacker to find."

3. Open a deal this analyst seat is **not** cleared for (a confidential deal under a different
   team). It does not render blurred or locked — it is simply not there.

> "If you want to prove this to a security reviewer, open the browser's network tab while
> that request goes out. There is nothing to inspect. The record is never transmitted — this
> is not a display rule client-side code could switch back on."

---

## Act 3 · Data sovereignty — two classes of agent (2 min)

Open a deal (Helvetia Diagnostics) and press **💬 Ask the assistant**.

> "Every agent in this platform is one of exactly two classes, set from a registry entry, not
> asserted by the model itself. An internal-data agent — the deal analyst, the persona
> specialists — can read this firm's governed record and has no reachable path to the public
> web. The one external-web agent, the news-sourcing scout, can reach the open internet and has
> no reachable path back into a deal record. That boundary is checked on every tool call,
> server-side, before it runs — so neither a manipulated prompt nor a compromised conversation
> has a channel to move data across the line in either direction."

If your audience wants the technical detail: the classification is a static registry lookup
(`app/lib/connectors.js`), not a runtime decision the model participates in.

---

## Act 4 · Connector governance (3 min)

1. Open **Settings ⚙ → Data sources**. Point at the mix: free public filings and news
   (SEC EDGAR, GLEIF, GDELT), subscription market-data providers reached over OAuth, the
   firm's own Microsoft 365 files and mail, and anything the fund registers itself.

> "None of these report connected until a real round trip actually succeeds — a token refresh,
> a live request, an honest failure message if it does not. There is no connector in this
> registry that fakes a green light."

2. Scroll to **Custom sources**. A self-registered connector shows **Pending approval**.

> "A data source the fund adds itself cannot be tested, enabled, or used by any agent until an
> administrator approves it. That gate exists for the reason a security review would raise it —
> a self-registered outbound connection is a real attack surface, and this platform will not
> let one go live silently."

3. Scroll to **Your CRM / deal database**. This is the newest connector, and the one this
   audience tends to ask about first.

> "A firm's existing CRM or deal database — DealCloud, Salesforce, Allvue, or an internal
> system — connects under exactly the same governance: administrator-only to register, pending
> until approved, a real credential required, either an OAuth client-credentials grant or an
> API key. Once approved, it pulls the firm's existing pipeline in, matched by connector and
> native record id — never by company name, so a re-sync can never create a duplicate — and
> pushes investment-committee decisions back out automatically the moment a deal clears a gate,
> without ever blocking that decision if the CRM happens to be briefly unreachable."

---

## Act 5 · The audit trail and approve-to-apply (2 min)

1. Still inside the deal, ask the assistant a question that produces a proposed action (for
   example, "log this open condition as resolved"). Point at the proposal chip.

> "The assistant does not act on the record on its own initiative. It proposes; a person
> presses Apply. That write is then governed by the caller's own role, server-side, exactly as
> if a human had typed it directly — the assistant has no reach that lets it bypass the access
> model it operates inside."

2. Open the deal's **Audit trail**.

> "Every mutating action, including every assistant-applied one, writes a named, timestamped
> entry — with a 'via assistant, you approved' badge on anything the assistant proposed and a
> person applied. If a compliance or security review asks 'can we reconstruct who changed
> what', the answer already exists here. It is not a feature request."

---

## Act 6 · The Azure footprint and the network boundary (2 min)

This act does not need a screen — it is the moment to open the
[architecture diagrams](../ARCHITECTURE.md) alongside the product, or simply talk through it.

> "The deployed footprint is subscription-scoped Bicep, split into six resource groups — app,
> ai, data, integration, core, network — so each domain can be governed and costed on its own.
> Every Azure-to-Azure call is authorised by one user-assigned managed identity and an RBAC
> role assignment scoped to exactly the resource it touches. There is no connection string, no
> API key and no secret anywhere in the running application or in this repository."

> "Private networking is one switch, not a re-architecture. Turned on, the storage account and
> Cosmos DB sit behind private endpoints inside a virtual network, public network access is
> disabled, and private DNS resolves the lookups. It is off by default so a lean pilot deploys
> in minutes, and a security review can turn it on before anything production-grade goes live."

---

## Act 7 · Deploy, extend, jumpstart (1 min)

> "Standing this up is one command against your own subscription. A demo deployment seeds an
> invented showcase book so the product is usable immediately. A customer jumpstart turns that
> off with a single flag — `seedDemoData = false` — so the store boots empty and is populated
> only through the firm's own connectors, the CRM connector shown a moment ago among them.
> Nothing fake ever has to touch a real firm's Cosmos account."

> "And every identity decision runs through the Entra ID you already operate, every document
> lives in the SharePoint you already govern, every conversation is a Teams channel you already
> retain. There is no new identity system, document store or retention policy to reconcile —
> this is additive to a Microsoft 365 and Azure estate you already run and already secure."

---

## The questions you will actually be asked

| Question | Answer, in one line |
|---|---|
| "Where does our data actually live?" | In your own Azure subscription, your own resource groups, chosen at deploy time — never in a vendor's tenant. |
| "Can a bug in the AI leak data across deals?" | Access is resolved server-side on every read; the model never sees a record it was not already authorised to read. |
| "Can the AI act without a human?" | No — every proposed action is a chip a person must press Apply on, and that write is then governed by the caller's real role. |
| "What stops a prompt injection from reaching our documents?" | Agent class is a static registry lookup, not something the model can talk itself into; the boundary is checked before every tool call, not after. |
| "Do we need a new IAM system?" | No — it reads your existing Entra ID directory; there is no parallel permissions store to keep in sync or to leak from. |
| "What is our exposure if a connector credential leaks?" | Every connector's credential is scoped to that connector; there are no shared keys, and secret-typed config fields are never echoed back to any client. |
| "How much of this can we see before committing?" | The whole repository is available for architecture and code review before any deploy decision. |

---

## The one-page card

| # | Act | Screen | The line that lands |
|---|---|---|---|
| 1 | Opening | Home | "Deploys into your own subscription and tenant — not multi-tenant SaaS." |
| 2 | Identity | All deals, admin → analyst | "Same route, same code — a different number because a different identity asked." |
| 3 | Sovereignty | Deal → assistant | "Two agent classes, checked on every tool call, never asserted by the model." |
| 4 | Connectors | Settings → Data sources | "Nothing reports connected until a real round trip succeeds." |
| 5 | Audit | Deal → Audit trail | "The assistant proposes; a person applies; every write is named and timestamped." |
| 6 | Footprint | (talk through, diagrams) | "Six resource groups, one managed identity, no secrets anywhere." |
| 7 | Deploy | (talk through) | "One command, your tenant — jumpstart mode ships with zero fake data." |

**Five traps:**
1. Don't demo the deal-team screens in depth — that is a different audience's walkthrough.
2. Don't claim a formal certification (SOC 2, ISO 27001) — those are the deploying firm's to
   obtain, not a vendor deliverable; say so plainly if asked.
3. Don't skip the "no client-side filter" distinction in Act 2 — it is the single fact that
   separates a real security boundary from a display convenience.
4. Don't let "AI" become the whole conversation — the story is the access model and the
   Azure footprint; the assistant is one governed feature inside it.
5. Private networking is off by default — say so, so nobody assumes it is already on.

## The one-paragraph version

> "The Deal Room deploys with one command into your own Azure subscription and your own
> Microsoft Entra tenant. Access is resolved on the server from your existing identity
> directory, never trusted from a client. Every AI agent belongs to one of two hard classes —
> internal data or external web — checked on every tool call. Every outside connector,
> including a firm's own CRM, is honestly tested and stays pending until an administrator
> approves it. Every write, including everything the assistant proposes, is named, timestamped
> and governed by the same role the writer actually holds. And the whole thing runs on managed
> identity end to end, with no secret anywhere in the path."

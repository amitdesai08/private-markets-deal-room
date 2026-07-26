# Access model — RBAC, need-to-know & demo mode

> How [The Deal Room](../README.md) decides what each person sees and can do. Every answer —
> and every action — is scoped to **who is asking**, resolved **server-side** so a client can
> never widen its own powers.
>
> See also: [How it works](HOW-IT-WORKS.md#the-identity-trust-seam) · [Inside a deal](DEAL-STAGES.md#access-within-a-deal)

---

## Two tiers of access

- **Status tier — pipeline awareness for everyone.** Every role sees the *metadata* of every
  non-confidential deal (company, sector, size, stage, status, IC readiness). Analysts get a
  clean **status-only view** of post-screening deals — never a dead-end lock.
- **Content tier — the workspace, on need-to-know.** The confidential workspace (financials,
  diligence findings, signed terms, valuations, documents and the agents) opens to the
  **deal-team role**, **admins**, or **anyone named on that deal's team**.

| Role | Agents | Deal metadata | Deal workspace | Write |
|---|---|---|---|---|
| **Administrator** | **all 10** | every deal | every deal | ✓ |
| **Partner** | all 10 | every deal | every deal | ✓ |
| **Deal team** | 8 | every deal | every deal | ✓ |
| **Analyst / Member** | 1 | every deal *(status)* | only deals they're **named on** | read-only |

- **Deal-team need-to-know** — add a user to a specific deal's team (`deal.team`) and they get
  the **full** workspace for *that* deal regardless of their role tier — true least-privilege,
  deal by deal.
- **Confidential deals** — flag a deal `confidential` and it disappears from the status tier
  entirely: only its named team and admins even know it exists. Built for take-privates under
  NDA, carve-outs on a clean-team protocol, or a live exit.
- **Role-based agent routing** — the orchestrator surfaces *only* the agents a role may call;
  an Administrator can call **every** agent.
- **Hierarchy "view-as-down"** — a senior role can preview the room **as any lower role**, and
  **never** upward — so it can't self-elevate.
- **Graceful downgrade** — an unauthorised persona request is quietly narrowed to a read-only
  analyst view rather than refused, so the conversation keeps flowing.

![Role-gated access in the Teams tab](../teams-app/docs/teams-rbac.png)

<sub>*Viewing as an Analyst, a post-screening deal shows a status-only summary — the full financials, findings and terms stay with the deal team, and confidential deals don't appear at all — while a partner, admin or a **named deal-team member** sees the whole record.*</sub>

---

## Demo profiles — the whole access model, in one click

Flip on `deployDemoProfiles` (`azd env set DEPLOY_DEMO_PROFILES true`) and the tab's **"sign in
as"** switcher is seeded with one named profile per role, so the model is demoable without
provisioning a single user. Every profile is enforced end-to-end by the orchestrator — the
switcher even shows how many agents each identity may call:

| Profile | Role | Agents |
|---|---|---|
| **Sam Rivera** — Platform Administrator | admin | **10** · view-as any role |
| **Eleanor Bishop** — Partner / Deal Sponsor | partner | **10** |
| **Marcus Feld** — Principal / Deal Lead | deal-team | 8 |
| **James Whitfield** — Retail MD | deal-team | 8 |
| **Dr. Priya Nair** — AI MD | deal-team | 8 |
| **Diego Marquez** — Supply Chain MD | deal-team | 8 |
| **Rachel Nguyen** — Operating Partner | deal-team | 8 |
| **David Osei** — Fund CFO | deal-team | 8 |
| **Priya Raman** — General Counsel | deal-team | 8 |
| **Sofia Marchetti** — Investor Relations | partner | **10** |
| **Maya Olsen** — Analyst | analyst | 1 · read-only |

> 🕵️ **Need-to-know, live in the demo.** The seeded pipeline ships with **confidential deals**
> — a take-private under NDA, a carve-out on a clean-team protocol, and a live exit — plus a
> real **need-to-know grant**. Sign in as **Maya (Analyst)** and the wider pipeline is
> **status-only**, the confidential take-private and exit are **invisible**, yet she gets the
> **full** workspace on the two deals she's *named on* — including the confidential carve-out.
> Switch to **Eleanor (Partner)** or **Sam (Admin)** and every deal opens. No code, no
> redeploy — just the switcher.

---

## Demo Mode — a runtime switch

`deployDemoProfiles` sets the initial state (and, in a production deploy, **hard-disables**
it), but an administrator can flip Demo Mode off/on at runtime from **Settings → Access
administration** — with it off, the "view as" switcher and showcase personas disappear and
every user sees only their own role and identity. Only the Entra object IDs you supply in the
harness then apply.

---

## Where it's enforced

- **Deploy-time hard gate** — the `deployDemoProfiles` parameter → `DEMO_PROFILES` env on both
  containers. Off in production = demo identities never resolve to a role.
- **Runtime toggle** — persisted admin setting layered over the deploy default (can only turn
  *off* within a demo-capable deploy).
- **Server-side trust seam** — the orchestrator only honours a supplied identity when it
  carries the shared bot key; see [the identity trust seam](HOW-IT-WORKS.md#the-identity-trust-seam).
- **Policy seam** — all of the above lives behind [`app/lib/userPolicy.js`](../app/lib/userPolicy.js);
  the deploy parameters (`adminIds`, `partnerIds`, …) feed straight into it.

---

## MNPI & information barriers — compliance by design

Private-markets deal teams routinely hold **material non-public information (MNPI)** —
take-privates under NDA, carve-outs on a clean-team protocol, live exits — and are obliged
to contain it behind **information barriers** (ethical walls) with an auditable
**need-to-know** discipline. The same server-side access mechanics above *are* that control
plane; this section maps them to the regulatory concepts a compliance officer expects.

| Regulatory concept | How The Deal Room enforces it |
|---|---|
| **MNPI containment** | A deal flagged `confidential` leaves the status tier entirely — only its **named team** and **admins** know it exists. The workspace (financials, findings, signed terms, valuations, documents) is never exposed to a non-entitled identity. |
| **Information barrier / ethical wall** | Access is a **per-deal wall**: `deal.team` need-to-know grants the full workspace for *that deal only*, independent of role tier. Nothing widens by default. |
| **Wall-crossing (control & log)** | Adding a user to `deal.team` is an explicit, recorded **need-to-know grant** — the wall-crossing event — rather than an ambient role privilege. Removal revokes access immediately. |
| **Restricted / watch list** | `confidential` deals behave like a **restricted list**: invisible to the wider firm, surfaced only to entitled staff — the pattern for a public take-private before a Rule 2.7 / tender announcement. |
| **No side-channels (agents included)** | Access is resolved **server-side** from the requesting identity; a client can never widen its own powers, and **agents can't be a side-channel** — chat and every MCP tool (`get_deal`, `list_deals`, …) refuse or redact for an identity that couldn't otherwise see the deal (see the identity-gated dispatch in [HOW-IT-WORKS.md](HOW-IT-WORKS.md)). |
| **External-data boundary** | The **data-sovereignty guard** ([DATA-SOVEREIGNTY.md](DATA-SOVEREIGNTY.md)) blocks any internal deal context from crossing to an **external** agent (e.g. the news scout) and **audit-logs** the refusal — MNPI never leaks out through a web-grounded tool. |
| **Draft, don't act** | Agents **draft** work product (memos, models, findings) for **human sign-off**; they never execute, post, or approve — mirroring the "agents produce, people decide" governance stance. |
| **Audit trail** | Identity resolution, need-to-know grants, denied persona requests and boundary refusals are all resolved and logged at the server trust seam, giving compliance a reviewable record. |

> **Enterprise alignment.** This model mirrors **Microsoft Purview Information Barriers** and
> Entra Conditional Access: The Deal Room enforces the *application-layer* need-to-know for
> deal content, and composes with tenant-level Purview / Exchange **Application Access
> Policies** (used to scope Work IQ mailbox reach) for the M365 substrate. Together they give
> a defensible **MNPI + information-barrier** posture across both the app and the underlying
> Microsoft 365 data.

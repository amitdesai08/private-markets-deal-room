# Action items — WorkIQ integration & Deal Room UX

A tracked backlog of the WorkIQ follow-ups plus the product/UX items raised on
2026-07-24. Each item states the **problem**, a grounded **analysis** (with the
files involved), the **proposed approach**, and a rough **effort**. Nothing here is
implemented yet — this is the plan.

> Related plans (not duplicated here): private-networking cutover +
> cost/ops in [OPERATIONS-PLAN.md](OPERATIONS-PLAN.md); agent data-sovereignty
> model in [DATA-SOVEREIGNTY.md](DATA-SOVEREIGNTY.md).

## Status (2026-07-24)

| Item | Status |
|---|---|
| B1 · single demo switcher (removed View-as-ROLE) | ✅ done |
| B2 · agents panel scoped to own persona (non-demo) | ✅ done |
| B3 · Good Place roster + "Name — Role" labels | ✅ done |
| C1 · portfolio totals follow the active persona | ✅ done (KPIs derived from filtered deals) |
| D1 · "Ask agents" opens chat *inside* the Deal Room | ✅ done |
| E1 · responsive layout | ✅ done (breakpoints at 860/560) |
| F1 · agent + skills docs | ✅ done — [AGENTS.md](AGENTS.md) |
| A1 · WorkIQ tools on agents | ✅ deal analyst (function tools) + persona agents (via deal MCP) |
| A2 · WorkIQ endpoint + admin consent | ⏳ **prepared, not executed** — existing M365 app has Teams-provisioning consent only; needs `Mail.Read`+`ChannelMessage.Read.All` + a live WorkIQ MCP URL (steps below) |
| A3 · per-user OBO for WorkIQ | ⏳ **design ready** — needs user-token forwarding across the Teams→backend trust boundary; deferred (inert + untestable until A2 live) |
| G · CoWork document engine + WorkIQ surface | ⏸️ deferred (needs CoWork SKU); seam scaffolded ([workiq.js](../app/lib/mcp/workiq.js), [SKILLS.md](../SKILLS.md)) |
| H · Claude financial-services skills & agents | ⏸️ deferred (needs licensing decision); skills already ported to `skills/*` |
| I1 · Agents can't bypass RBAC (identity-gated dispatch) | ✅ done |
| I2 · Purpose-based agents + orchestrator delegation | ✅ **live in Foundry** — 7 agents provisioned in `proj-dealhub-dev` ([create_purpose_agents.py](../app/scripts/create_purpose_agents.py), [purpose-agents.env](../app/scripts/purpose-agents.env)); app still routes personas (flip when ready) |
| I3 · PE personas researched + documented | ✅ done — [PERSONAS.md](PERSONAS.md) |
| I4 · Role-aware "what can you do?" capabilities | ✅ done — [capabilities.js](../app/lib/capabilities.js) + `/capabilities` |
| I5 · Builder/IT explainer + PE glossary | ✅ done — [EXPLAINER.md](EXPLAINER.md) |

---

## A · WorkIQ integration (make the scaffold live)

The WorkIQ MCP client, governed tools, and Settings-configurable endpoint are
already shipped (see [DATA-SOVEREIGNTY.md](DATA-SOVEREIGNTY.md) and
[app/lib/mcp/workiq.js](../app/lib/mcp/workiq.js)). These three items turn the
inert scaffold into a live capability.

### A1 · Register `workiq_*` tools on the Foundry agent definitions
- **Problem:** the server dispatch seam is ready and the tools are governed, but
  the Foundry agents don't *list* the tools, so a model can't call them yet.
- **Approach:** add the four tool schemas (`workiq_search_files`,
  `workiq_read_channel`, `workiq_search_mail`, `workiq_search`) to the
  **internal-data** agent definitions only — the deal analyst
  ([scripts/create_deal_agent.py](../app/scripts/create_deal_agent.py)) and the 10
  persona agents (`create_*_agent.py`). Explicitly **exclude** the news scout
  ([create_news_agent.py](../app/scripts/create_news_agent.py)) — the sovereignty
  guard already denies it, this keeps the definition honest too.
- **Effort:** S (tool JSON schemas + re-provision agents).

### A2 · Real WorkIQ MCP endpoint + delegated sign-in + admin consent
- **Problem:** no endpoint is configured and the read scopes aren't consented.
- **Verified state (2026-07-25):** the M365 connector app **`Deal Room M365 Connector (dev)`**
  (`appId 2ecae299-02ce-41d0-8b4f-31b157a74930`, SP `601bd796-…`) already has **AllPrincipals
  admin consent** for its *Teams-provisioning* scopes (`User.Read`, `Team.ReadBasic.All`,
  `Team.Create`, `ChannelSettings.ReadWrite.All`, `Files.ReadWrite.All`, `Sites.ReadWrite.All`,
  `GroupMember.Read.All`, `TeamMember.ReadWrite.All`, `Channel.Create`, + app-role
  `AppCatalog.ReadWrite.All`). It does **not** yet request the WorkIQ *read* scopes
  **`Mail.Read`** and **`ChannelMessage.Read.All`** (files/sites reads are covered by the
  existing ReadWrite grants). Secrets exist (`m365-client-secret` on the orchestrator).
- **Why not executed autonomously:** broadening tenant-wide `Mail.Read` / `ChannelMessage.Read.All`
  admin consent expands the tenant attack surface, and the capability is **inert** (no WorkIQ MCP
  endpoint yet) — so there is no functional benefit to consent until an endpoint exists. Left for
  an attended run.
- **Ready-to-run (Global Admin):**
  ```powershell
  $app='2ecae299-02ce-41d0-8b4f-31b157a74930'
  az ad app permission add --id $app --api 00000003-0000-0000-c000-000000000000 `
    --api-permissions 570282fd-fa5c-430d-a7fd-fc8dc98a9dca=Scope `  # Mail.Read (delegated)
    767156cb-16ae-4d10-8f8b-41b657c8c8c8=Scope                      # ChannelMessage.Read.All (delegated)
  az ad app permission admin-consent --id $app                       # grant tenant-wide consent
  ```
  Then set the endpoint in **Settings → Data Sources → Work IQ** (or `WORKIQ_MCP_URL`) and complete
  the delegated `workiq` sign-in. Restrict mailbox access with an Exchange Application Access Policy
  (mirrors [app/graph/README.md](../app/graph/README.md)).
- **Residual external dependency:** a real **WorkIQ MCP server URL**. Until one is provided the
  seam stays inert by design (`workiq-not-configured`).
- **Effort:** M (mostly tenant-admin + endpoint provisioning, not code).

### A3 · Per-user OBO for WorkIQ reads (need-to-know)
- **Problem:** `dispatchWorkiq` runs with the shared delegated connection today, so
  reads aren't scoped to the requesting user.
- **Approach:** thread the requesting user's OBO token (the Teams-SSO→OBO seam in
  [teams-app/server/sso.js](../teams-app/server/sso.js), extended to the Power BI
  resource for the report) into `dispatchWorkiq`, so an agent only ever sees M365
  content the caller is entitled to. Compose with the two-tier RBAC + confidential
  exclusion already enforced.
- **Effort:** M.

---

## B · Persona / access UX

### B1 · Collapse "View as" into a single demo switcher
- **Problem:** two overlapping controls in the top bar — a **"View as ROLE"**
  dropdown and a **"Sign in as" demo-profile** dropdown — are confusing and
  redundant with picking a persona.
- **Analysis:** both live in [App.tsx](../teams-app/tab/src/App.tsx) top bar
  (`viewAsRoles` select + `demoUsers` select), both gated on demo mode. The role
  view-as and the profile picker do nearly the same thing (impersonate a
  lower-privilege identity).
- **Approach:** keep **one** demo-mode dropdown (the showcase profiles, which each
  already resolve a role + persona set), remove the separate "View as ROLE"
  select. "View as" becomes purely a **demo-mode** affordance (hidden entirely when
  demo mode is off, as it already is).
- **Effort:** S. **Depends on:** B3 (they touch the same top bar).

### B2 · Scope the agents panel to the signed-in persona
- **Problem:** when asking agents, a user sees *all* personas their role may act
  as; they should see **only their own** persona (the multi-persona roster is a
  demo-mode feature).
- **Analysis:** [App.tsx](../teams-app/tab/src/App.tsx) `visibleAgents` = orchestrator
  + every persona in `allowedPersonas`. Outside demo mode, a real user should get
  the orchestrator + their single persona.
- **Approach:** when demo mode is off, filter `visibleAgents` to the orchestrator +
  the caller's own persona only. In demo mode (or when a profile is selected), keep
  the full roster so the showcase still demonstrates the org.
- **Effort:** S.

### B3 · Good Place demo roster + "Name — Role" labels — ✅ done
- **Decision:** replaced the 11-profile roster (7 of them redundant `deal-team`
  look-alikes) with **one character per RBAC tier**, themed on *The Good Place* and
  mapped by personality, so the demo showcases the access **separation + guardrails**
  cleanly:
  | Character | Role | Access |
  |---|---|---|
  | **Michael** | Administrator | everything; view-as any role |
  | **Eleanor Shellstrop** | Partner / Deal Sponsor | all agents · Stage 2 · write |
  | **Tahani Al-Jamil** | Deal Team | deal-team agents · Stage 2 · write |
  | **Chidi Anagonye** | Analyst | 1 agent · read-only · Stage 1 (confidential hidden) |
  | **Jason Mendoza** | Member / observer | 0 agents · view-only (guardrail floor) |
- **Done:** [app/data/demoProfiles.js](../app/data/demoProfiles.js) reduced/rethemed;
  `member` tightened to `personas: []` in
  [app/lib/userPolicy.js](../app/lib/userPolicy.js) so the floor is a genuine
  distinct tier; the demo switcher label is now **"Name — Role"** (agent count
  dropped). This also satisfies the "too many personas that do the same thing"
  concern for the view-as roster.
- **Follow-up:** optionally rename the orchestrator display label to **Janet** (the
  all-knowing assistant) to complete the theme — deferred (touches the agent label).

---

## C · Deal visibility consistency

### C1 · Portfolio totals must follow the active persona/identity
- **Problem:** switching persona changes the **stage** lists but **not** the total
  deal count / KPIs — you see the same total, just not the per-stage deals.
- **Analysis (root cause):** the `[viewAs, viewAsRole]` effect in
  [App.tsx](../teams-app/tab/src/App.tsx) re-pulls only `af('/api/deals')` (which is
  identity-filtered). It does **not** re-pull `/api/analytics` (or `/api/pipeline`),
  so the "Live deals" KPI + funnel come from the **system-wide** analytics (9) and
  never reflect the persona's visibility. The stage components read the filtered
  `deals`, hence the mismatch.
- **Approach:** on identity/persona/view-as change, also refresh
  `/api/analytics` + `/api/pipeline` **as that identity** (pass the same
  `x-dr-as` / `x-dr-view-as` headers via `af`), and make those endpoints
  identity-aware server-side so the totals, KPIs and funnel match the visible
  deals. Alternatively derive the KPI counts client-side from the already-filtered
  `deals` to guarantee consistency.
- **Effort:** M (touches server analytics/pipeline endpoints + client refresh).

---

## D · Deal Room chat UX

### D1 · "Ask agents" inside a Deal Room should chat *in* the Deal Room
- **Problem:** the **💬 Ask agents** button inside a deal drawer closes the deal and
  routes to the main-screen agents panel, losing the deal context/layout.
- **Analysis:** [DealDetail.tsx](../teams-app/tab/src/DealDetail.tsx#L221)
  `onAsk(dealId)` is wired in [App.tsx](../teams-app/tab/src/App.tsx) to
  `() => { setOpenDealId(''); askAbout(id); }` — it **closes** the drawer
  (`setOpenDealId('')`) and opens the shared `ChatPanel` on the main screen.
- **Approach:** render a **deal-scoped `ChatPanel` inside the DealDetail drawer**
  (kept open), focused on `dealId`, instead of closing + delegating. Reuse the
  existing `ChatPanel` component with the deal focus + the deal-scope guardrails so
  the conversation stays within the Deal Room tab.
- **Effort:** M.

---

## E · Responsive layout

### E1 · Make the app responsive so views don't diverge across screens
- **Problem:** the layout looks "polar opposite" on different screen sizes /
  resolutions.
- **Analysis:** the tab CSS in [App.tsx](../teams-app/tab/src/App.tsx) `GLOBAL_CSS`
  and per-component styles use mostly fixed paddings + `repeat(auto-fill/auto-fit,
  minmax(...))` grids without breakpoints; the agents panel + deal drawer are
  fixed-width, so narrow/embedded Teams panels and wide desktops render very
  differently.
- **Approach:** introduce a small set of breakpoints (e.g. ≤768, ≤1200) — collapse
  the agents panel to an overlay on narrow widths, make the deal drawer full-width
  on mobile, and normalise the KPI/deal grids. Validate in the Teams tab (narrow)
  and standalone web console (wide).
- **Effort:** M.

---

## F · Documentation

### F1 · Add agent + skills documentation to the repo
- **Problem:** the agent roster and their skills aren't documented in one browsable
  place.
- **Analysis:** the pieces exist but are scattered — persona definitions in
  [app/data/personas.js](../app/data/personas.js), the per-stage **skills** in
  [app/data/flow.js](../app/data/flow.js) (e.g. `@deal-screening`, `@ic-memo`), the
  agent objectives + sovereignty class in
  [agentSovereignty.js](../app/lib/agentSovereignty.js), and the Foundry agent
  builders in `app/scripts/create_*_agent.py`.
- **Approach:** add `docs/AGENTS.md` — one table of every agent (deal analyst · 10
  personas · news scout · Fabric), each with its **objective**, **class**
  (internal-data / external-web), **tools/skills**, and the stage(s) it serves;
  link it from the README. Keep it generated-friendly (mirror the registry so it
  doesn't drift).
- **Effort:** S.

---

## Suggested sequencing

1. **Quick UX wins (same top-bar/agents area):** B1 + B2 + B3, then D1.
2. **Correctness:** C1 (totals follow identity).
3. **Responsive pass:** E1.
4. **Docs:** F1 (and this backlog stays the tracker).
5. **WorkIQ go-live:** A1 → A2 → A3 (A2 is mostly tenant-admin; A1 unblocks agent calls).

---

## G · CoWork as the agentic document engine + a WorkIQ surface

- **Ask (2026-07-24):** integrate **CoWork** for WorkIQ and use it as the **engine for
  Word / Excel / PowerPoint** generation.
- **⚠️ Naming to confirm:** the [anthropics/financial-services](https://github.com/anthropics/financial-services)
  repo (item H) is built for **Claude Cowork** + the **Claude-for-Microsoft-365 add-in**
  (Claude running *inside* Word/Excel/PowerPoint/Outlook). Confirm whether "Microsoft
  CoWork" means that add-in, a Microsoft-badged agentic Office capability, or Claude
  Cowork specifically — the integration surface differs.
- **Today:** Office output is **hand-rolled** — [office.js](../app/lib/m365/office.js)
  builds the IC memo (Word) and returns model (Excel) with `docx`/`exceljs`, one bespoke
  template each, **no PowerPoint**, published to SharePoint or downloaded.
- **Target:** swap the bespoke generators for an **agentic document engine** that authors
  **branded Word memos, live Excel models and PowerPoint IC/pitch decks** from the live
  deal record + skills, and expose that engine as a **WorkIQ execution surface** (WorkIQ
  today is read-only — SharePoint/Teams/mail; CoWork adds *produce/edit* over the same
  M365 documents). Keep the app's model: outputs are **staged for human sign-off**,
  governed as **internal-data**.
- **Approach:** (1) an adapter behind the existing `/api/deals/:id/documents/:kind` seam
  that calls the CoWork/add-in engine instead of `office.js` when configured (feature-flag,
  fall back to the current generators); (2) a `/ppt-template` equivalent so decks match the
  firm's branding; (3) surface it in **Settings → Data Sources** next to Work IQ.
- **Effort:** L (engine integration + M365 add-in / tenant provisioning). **Depends on:**
  confirming the CoWork product + tenant availability.

## H · Claude financial-services skills & agents — enrich the Deal Room

Brainstorm of how [anthropics/financial-services](https://github.com/anthropics/financial-services)
("Claude for Financial Services", **Apache-2.0**, file-based markdown/YAML) can flesh out
our agents. It ships **named agents + vertical *skills* + MCP connectors**, installable as
**Claude Cowork** plugins or via the **Managed Agents API** — same system prompt + skills
either way.

**Why it fits:** its **private-equity** vertical is *sourcing → screening → diligence
checklists → IC memos → portfolio monitoring* — the Deal Room's exact lifecycle — and its
**financial-analysis** core (comps, DCF, LBO, 3-statement, deck QC, Excel audit) is precisely
the modeling our fund-CFO / analyst personas do. Their governance stance ("agents draft work
product for human sign-off; never execute, post, or approve") **matches ours**.

**Four ways to use it (ranked by value/effort):**

1. **Adopt the *skills* into our persona instructions (S, do first).** Skills are markdown
   domain-method files. Vendor the relevant ones (Apache-2.0, attribute) and fold their
   methods/conventions into the Foundry persona prompts — mapping onto
   [AGENTS.md](AGENTS.md) / [personas.js](../app/data/personas.js):
   | Their skill / agent | Our persona |
   |---|---|
   | `financial-analysis` — LBO, DCF, 3-statement | Fund CFO |
   | `financial-analysis` — comps, deck QC | Analyst · Principal |
   | `private-equity` — IC memo, diligence checklist | Partner · Principal |
   | `private-equity` — portfolio monitoring | Operating Partner · IR |
   | Earnings Reviewer · Market Researcher | Analyst · News Scout |
   | KYC Screener | Legal / GC |
   Low-risk, high-value: no runtime dependency, immediately deepens every persona.
2. **Adopt their slash-commands as persona quick-actions (S).** `/comps` · `/dcf` · `/lbo`
   · `/ic-memo` · `/ppt-template` map onto our per-stage `skills` in
   [flow.js](../app/data/flow.js) and the persona `actions`.
3. **Expand the connector registry (S).** They centralize the **same MCPs we already use**
   (Morningstar, LSEG, Moody's) and add **FactSet, PitchBook, S&P/Kensho, Daloopa, Box,
   Egnyte** — drop these into [connectors.js](../app/lib/connectors.js) the same way as the
   existing MCP connectors (and Work IQ). Subscription-gated.
4. **Delegate to their named agents (L).** Deploy select agents (Pitch Agent, Model Builder,
   Valuation Reviewer) via the **Managed Agents API** as sub-agents behind our orchestrator
   (handoff), or run them in Claude Cowork / the M365 add-in alongside the Deal Room. This is
   where H meets **G** — the Model Builder / Pitch Agent *are* the Word/Excel/PPT engine.

**Governance:** all of the above are **internal-data**; route any of their MCP connectors and
agents through our sovereignty guard + Work IQ delegation so they honour need-to-know and the
external/internal boundary.

**Effort:** M overall (skills = markdown; connectors = config; agent handoff = larger).
**First step:** vendor the `private-equity` + `financial-analysis` skills and merge into the
persona prompts (item 1), then add the missing connectors (item 3).

---

## I · Agents, identity & the purpose-based topology

### I1 · Agents can't bypass RBAC — ✅ done
- **Ask:** users may only get answers/data through agents **for their own role** — an agent
  must never be a side-channel to a deal or figure the caller couldn't otherwise see.
- **Gaps found + closed (verified live):**
  1. **Chat carried no identity.** `ChatPanel` used plain `fetch` and the chat endpoints went
     through the generic proxy, so the caller's identity never reached the backend — chat ran
     as the *default* role. Fixed: `ChatPanel` uses the identity-aware `af`, and the Teams
     server now has explicit `/api/deal-agent/chat` + `/api/persona-agents/:persona/chat`
     routes that inject `requestingUser` + the bot key (like `/api/teams/context`). Analyst
     chat on a confidential deal now returns **403** (was a full summary).
  2. **Portfolio `get_deal` was unfiltered.** Threaded identity + view-as through
     [dealAgent.js](../app/lib/dealAgent.js) / [personaAgent.js](../app/lib/personaAgent.js) into
     [dispatchTool](../app/lib/dealTools.js): `get_deal` refuses / redacts by `dealAccessLevel`;
     `list_deals` / `search_deals` return only the caller's visible deals.
  3. **Hosted-MCP side-channel.** The agents actually read via the hosted MCP
     ([dealServer.js](../app/lib/mcp/dealServer.js)), which Foundry calls with the *agent's*
     credentials — the end-user identity is lost at that hop, so function-tool gating didn't
     apply. Conservative fix: the shared MCP **never returns a confidential deal's detail**
     (`get_deal` / artifacts / returns / value-creation / risk / IC-readiness all refuse
     confidential deals). Verified: analyst `get_deal(demo-sterling)` → `access-denied`, no leak.
- **Known trade-off:** because the shared MCP can't resolve per-user need-to-know, blocking
  confidential deals there also limits **admin** *agent-chat* on those deals (admin still sees
  them via the identity-gated UI / `/api/deals/:id`). The proper fix is to **propagate the
  end-user identity into the MCP call** so it can gate per-user — folded into **I2** (the
  purpose-based rebuild threads identity through the orchestrator→agent→tool path).

### I2 · Purpose-based agents + orchestrator delegation — 📋 planned
- **Direction:** move from **persona** agents (one per role, much overlap) to a small set of
  **purpose** agents (Sourcing · Screening · Diligence · Modeling · IC-Memo ·
  Portfolio-Monitoring), with the **Deal Room Analyst as orchestrator** delegating tasks and
  threading identity. Personas become a *lens*, not an agent each. See
  [AGENTS.md § Direction](AGENTS.md#direction--purpose-based-agents--orchestrator-delegation).
- **Approach:** define the task agents in **Foundry** (`create_*_agent.py`), each bundling the
  skills it needs from [SKILLS.md](../SKILLS.md); wire orchestrator→agent **handoff** (maps onto
  the Managed-Agents / Cowork model in H); integrate **Cowork** for document authoring (G). Keep
  the governed tools + the I1 data-protection guarantees unchanged.
- **Effort:** L (agent rebuild + orchestration seam). **Depends on:** H (skills) + G (Cowork).

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
| A2 · WorkIQ endpoint + admin consent | ⏳ tenant-admin |
| A3 · per-user OBO for WorkIQ | ⏳ pending |

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
- **Approach:** stand up (or point at) a WorkIQ MCP endpoint; set its URL in
  **Settings → Data Sources → Work IQ**; complete the delegated `workiq` sign-in;
  grant admin consent for `Mail.Read`, `Sites.Read.All`/`Files.Read.All`,
  `ChannelMessage.Read.All`. Restrict mailbox access with an Exchange Application
  Access Policy (mirrors [app/graph/README.md](../app/graph/README.md)).
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

# Demo runbook

A ~18-minute guided demo of The Deal Room for delivery teams. It showcases the
**AI-native PE deal flow**, the **identity-aware access model**, the **full deal
lifecycle**, the **specialist agents**, the **decision artifacts**, and the
**post-IC fund & portfolio lens** — all grounded in a live (seeded) deal record.

> Prefer a story to a checklist? See the [demo walkthrough](DEMO-WALKTHROUGH.md) —
> the same material told as one deal's end-to-end journey.

## Before you start

- **Deploy in demo mode** (`azd up`) with `DEPLOY_DEMO_PROFILES=true`, or use an
  existing demo environment.
- Open the **web console** at `https://<teams-fqdn>/` (or the tab inside Teams).
- No sign-in needed in demo mode — you'll use the **"sign in as"** switcher.
- **You land on the Deals Overview — deals first, not market trends.** The overview
  opens on the **Business value band** (analyst-hours saved, faster-to-IC, deals
  processed, average IC readiness) and the **live pipeline**; **market intelligence
  sits deliberately last**. Lead the demo with the *work* (screening → diligence → IC),
  not the news feed.

> Everything is grounded in the live deal record. If asked "is this real?",
> point out the answers cite the tools (`list_deals`, `get_deal`, `get_returns`…).

---

## 1 · The pitch (30s)

> "The Deal Room is an AI-native private-equity workspace that lives inside
> Microsoft Teams — and the *same* console runs standalone on the web. Deal teams
> source, screen, run diligence, and take deals to IC, with every answer grounded
> in the live deal record and **scoped to who is asking**."

## 2 · Identity-aware access (2 min) — *the differentiator*

The demo roster is **The Good Place** — one character per RBAC tier, so the access
**separation and guardrails** are the story. Use the single top-bar **"sign in as"**
dropdown (it shows **Name — Role**, no clutter):

1. **Michael Realman — Administrator.** Agents panel shows **every** specialist agent; sees
   **all 9 deals** including the two **confidential** ones; every stage open.
2. **Tahani Al-Jamil — Deal Team.** Deal-team agents; **Stage-2 diligence unlocked**; writes
   findings and the value-creation plan.
3. **Chidi Anagonye — Analyst.** The rail collapses to **his own agent** (read-only), the
   **"Live deals" total drops to 7** — the two **confidential** deals vanish — and Stage-2 locks.
4. **Jason Mendoza — Member.** The **guardrail floor**: view-only, **zero persona agents**,
   dashboard only.

> Two things to call out: the **totals follow the identity** — switch persona and the
> "Live deals" KPI changes *with* the deal list, not just the stage views; and outside demo
> mode a real user sees only **their own** persona agent, not the whole tier. Access is
> resolved **server-side** from the requesting identity — a client can never widen its own
> powers.

## 3 · The full deal lifecycle (2 min)

1. Open the **Lifecycle** tab.
2. Walk the **3 phases / 15 stages**, calling out the **6 decision gates (⛔)**:
   PURSUE → **IOI** → **LOI** → **IC** → **Signing** → **Exit**.
3. Note each stage's **owner persona** and the artifacts it produces.

> "This is the real institutional buyout process — not a demo toy. Each gate is
> where capital or resources get committed."

## 4 · A deal, end to end (4 min)

> Start on the **Deals Overview** you landed on: call out the **Business value band**
> and the **live pipeline** (screening → diligence → IC) — the story is the deals in
> flight, with **market intelligence intentionally at the bottom**. Then open a deal.

1. From **Deals Overview**, open a deal (e.g. the top consumer deal). Each stage shows a
   **"Who's on this stage"** specialist rail (👤 owner · 🤖 agent) so it's clear which
   persona and agent own the work.
2. **Decision artifacts** tab — show the four cards:
   - **LBO / Returns** — entry multiple, sources & uses, base/upside/downside **IRR & MOIC** vs the hurdle. Click **Returns model (Excel)** to download the real workbook (Summary · Sources & Uses · Scenarios · Sensitivity).
   - **Value creation** — the EBITDA bridge + quantified levers + 100-day plan.
   - **Risk register** — open risks by severity × likelihood, red/amber/green.
   - **IOI / LOI** — the non-binding indication and letter of intent.
3. **IC readiness** tab — the decision-grade board + verdict.

> "Every number is derived from the live record — change the deal and the returns,
> risks and memo change with it."

## 5 · Fund & portfolio — monitor what you own (2 min)

Open the **Fund & Portfolio** tab — the *post-IC* lens most tools stop short of.

1. **Fund / LP headline** — committed capital, % deployed, dry powder, and
   **TVPI · DPI · RVPI** with gross & net **MOIC / IRR** (Fund IV, $2.6B).
2. **Portfolio monitoring** — each owned company with hold period, entry→current
   multiple, **current MOIC & IRR**, value-creation progress and an
   **on-track / watch / underperform** status. Expand one to see the levers, the
   100-day plan and **KPIs vs the underwriting plan** (and an honest underperformer).
3. **Concentration vs LPA limits** — sector & single-position exposure against the
   mandate's hard caps — compliance-by-design.
4. As **IR** or **Operating Partner**, ask the agent: *"How does the fund read to
   our LPs?"* or *"Where's the biggest EBITDA-bridge lever across the portfolio?"*
   (backed by `get_fund_overview` / `get_portfolio`).

> "The deal didn't end at IC — it became a company we own, and the same governed
> record now tracks its value creation, its marks and its fit to the mandate."

## 6 · Talk to the specialists (3 min)

Two ways to chat — both grounded in the live record and persona-framed:

- **Portfolio-wide:** open the **agents** panel (as **Michael** or **Eleanor** so the full
  roster shows) and ask across deals.
- **Inside a deal:** open a deal and hit **💬 Ask agents** — the chat now opens **inside the
  Deal Room drawer**, scoped to that one deal (it no longer bounces back to the main screen).

Ask:
- **Fund CFO:** *"Pull the returns model — base IRR and MOIC, and does it clear the hurdle?"*
- **Operating Partner:** *"What are the top value-creation levers across the portfolio?"*
- **Deal Room Analyst:** *"What's blocking this deal from going to IC?"*

> The agents are Foundry agents that read the pipeline through the governed MCP
> tools — grounded, cited, and persona-framed.

> **One assistant, many specialists.** The user talks to a single **Deal Room
> Assistant**; behind it the **orchestrator** decides whether to answer directly or
> pull in the right **stage specialists** — sourcing, screening, diligence, modeling,
> IC-memo, value-creation — consults them in parallel, and **composes one answer**
> (the reply reports which agents it used). Ask a modeling + IC question and watch it
> bring in the **modeling** and **ic-memo** specialists together. It's on by default
> (`ORCHESTRATION=purpose`) and falls back to the single analyst agent if a specialist
> is unavailable.

## 7 · The Deal Room Report — Power BI, integrated in the app (1 min)

Open the **Report** tab inside the app (top nav). Reporting is now a **first-class
function of the console itself** — not a separate pinned tab. The app serves the fund's
**real Power BI report** — Portfolio Overview · Sector & Industry · Pipeline by Stage ·
Deal Value & Valuation · Time-based metrics — **embedded** for signed-in users
(user-owns-data), with an **Open in Power BI** deep link and a live native summary as a
fallback. (A channel tab pinned to the old `?view=report` link still opens straight to
this in-app Report tab.)

## 8 · Work IQ — agents over SharePoint / Teams / mail (1 min)

Open **Settings (⚙) → Data Sources → Work IQ**: paste the MCP endpoint and **Connect**. Once
connected, the internal-data agents gain **governed, delegated** M365 tools —
`workiq_search_files` (SharePoint/OneDrive), `workiq_read_channel` (Teams) and
`workiq_search_mail` (Outlook) — so a diligence question can be grounded in the deal's real
documents, channel discussion and correspondence. The **external** news scout can **never**
call them: the data-sovereignty guard refuses any boundary crossing and audit-logs it.

> **Add your own provider.** In **Data Sources**, the **Add a data source** form registers any
> provider the platform doesn't ship a built-in for (PitchBook, Morningstar Direct, an internal
> API) — name it, pick its sourcing role, drop in an endpoint, and it appears as a governed
> connector with an honest **reachability** test (never a faked "connected"). A name that
> duplicates a built-in is rejected; remove a custom source anytime.

## 9 · Documents on your own license (1 min)

- In a deal's **Documents** tab, generate the **IC memo (Word)** and **Deal model
  (Excel)** — built on the requester's own M365 license (full mode), or downloaded
  as a personal working copy. Show the **live-refreshable** Excel model.

## 10 · Real data, no paid provider (1 min) *(optional)*

- Hit `GET /api/company/Apple/fundamentals?ticker=AAPL` — **real SEC/XBRL
  fundamentals** stand in for a paid data provider, so demos show live numbers
  with **no license**. (`/api/providers/keyless` lists SEC, GLEIF, GDELT.)

## 11 · Close (30s)

> "One command deploys the whole thing — `azd up`. It's a parameterised Azure
> accelerator: bring your own roles, personas and data; the lean blob store
> (**Cosmos is optional**) means a demo costs almost nothing; and you can add your
> own Foundry agents from a template. It takes a deal from the first signal all the
> way to a **monitored portfolio company** — all Microsoft-native: Teams, Foundry,
> Graph, managed identity."

---

## Quick reference

| Feature | Where |
|---|---|
| RBAC / demo roster (5 Good Place tiers) | top-bar **"sign in as"** (single dropdown, Name — Role) |
| Lifecycle (15 stages, 6 gates) | **Lifecycle** tab · `GET /api/lifecycle` |
| Decision artifacts | deal → **Decision artifacts** tab · `/api/deals/:id/{returns,value-creation,risk-register,ioi,loi}` |
| Returns Excel | deal → **Documents** → *Returns model (Excel)* |
| Fund & portfolio (post-IC) | **Fund & Portfolio** tab · `/api/fund/{overview,portfolio,value}` |
| Specialist agents | **agents** panel + in-deal **💬 Ask agents** · `GET /api/persona-agents` |
| Orchestrated delegation | one assistant → orchestrator delegates to stage specialists → composes (`ORCHESTRATION=purpose`) |
| Deal Room Report (Power BI) | in-app **Report** tab (top nav) |
| Add a custom data source | **Settings ⚙ → Data Sources → Add a data source** · `POST /api/connectors` |
| Work IQ (M365 for agents) | **Settings ⚙ → Data Sources → Work IQ** |
| Keyless data | `/api/company/:name/fundamentals`, `/api/entity/:name/lei`, `/api/news/gdelt` |

## Troubleshooting

- **Agents say "temporarily unavailable"** — the Foundry agents weren't provisioned. Run `app/scripts/create_persona_agents.py` (or re-`azd up` with `DEALROOM_AGENTS` unset).
- **No demo profiles in the switcher** — set `DEPLOY_DEMO_PROFILES=true` and redeploy; the console caches the roster, so restart the console container after enabling.
- **Empty pipeline** — the store is empty; in demo mode the seed loads on boot. Confirm `GET /api/analytics` returns deals.

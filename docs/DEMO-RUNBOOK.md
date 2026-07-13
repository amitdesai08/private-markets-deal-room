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

> Everything is grounded in the live deal record. If asked "is this real?",
> point out the answers cite the tools (`list_deals`, `get_deal`, `get_returns`…).

---

## 1 · The pitch (30s)

> "The Deal Room is an AI-native private-equity workspace that lives inside
> Microsoft Teams — and the *same* console runs standalone on the web. Deal teams
> source, screen, run diligence, and take deals to IC, with every answer grounded
> in the live deal record and **scoped to who is asking**."

## 2 · Identity-aware access (2 min) — *the differentiator*

1. In the top bar, open **"sign in as"** and choose **Sam Rivera — Administrator**.
   - Open the **agents** panel: the admin sees **all 10 specialist agents**.
2. Switch to **Maya Olsen — Analyst**.
   - The rail collapses to **1 agent** (read-only), and Stage-2 deals show a lock.
3. Switch to **Eleanor Bishop — Partner**, then use **"view as"** to drop to *Analyst*.
   - Same session, but she now sees exactly what an analyst would — **view-as only
     ever goes down, never up**, and it's enforced server-side.

> "Access isn't a UI toggle — it's resolved on the server from the requesting
> identity. A client can never widen its own powers."

## 3 · The full deal lifecycle (2 min)

1. Open the **Lifecycle** tab.
2. Walk the **3 phases / 15 stages**, calling out the **6 decision gates (⛔)**:
   PURSUE → **IOI** → **LOI** → **IC** → **Signing** → **Exit**.
3. Note each stage's **owner persona** and the artifacts it produces.

> "This is the real institutional buyout process — not a demo toy. Each gate is
> where capital or resources get committed."

## 4 · A deal, end to end (4 min)

1. From **Deals Overview**, open a deal (e.g. the top consumer deal).
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

Open the **agents** panel and ask (as **Partner** or **Admin** so all agents show):

- **Fund CFO:** *"Pull the returns model — base IRR and MOIC, and does it clear the hurdle?"*
- **Operating Partner:** *"What are the top value-creation levers across the portfolio?"*
- **Deal Room Assistant:** *"What's blocking this deal from going to IC?"*

> The agents are Foundry agents that read the pipeline through the governed MCP
> tools — grounded, cited, and persona-framed.

## 7 · Documents on your own license (1 min)

- In a deal's **Documents** tab, generate the **IC memo (Word)** and **Deal model
  (Excel)** — built on the requester's own M365 license (full mode), or downloaded
  as a personal working copy. Show the **live-refreshable** Excel model.

## 8 · Real data, no paid provider (1 min) *(optional)*

- Hit `GET /api/company/Apple/fundamentals?ticker=AAPL` — **real SEC/XBRL
  fundamentals** stand in for a paid data provider, so demos show live numbers
  with **no license**. (`/api/providers/keyless` lists SEC, GLEIF, GDELT.)

## 9 · Close (30s)

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
| RBAC / demo profiles | top-bar "sign in as" + "view as" |
| Lifecycle (15 stages, 6 gates) | **Lifecycle** tab · `GET /api/lifecycle` |
| Decision artifacts | deal → **Decision artifacts** tab · `/api/deals/:id/{returns,value-creation,risk-register,ioi,loi}` |
| Returns Excel | deal → **Documents** → *Returns model (Excel)* |
| Fund & portfolio (post-IC) | **Fund & Portfolio** tab · `/api/fund/{overview,portfolio,value}` |
| Specialist agents (10) | **agents** panel · `GET /api/persona-agents` |
| Keyless data | `/api/company/:name/fundamentals`, `/api/entity/:name/lei`, `/api/news/gdelt` |

## Troubleshooting

- **Agents say "temporarily unavailable"** — the Foundry agents weren't provisioned. Run `app/scripts/create_persona_agents.py` (or re-`azd up` with `DEALROOM_AGENTS` unset).
- **No demo profiles in the switcher** — set `DEPLOY_DEMO_PROFILES=true` and redeploy; the console caches the roster, so restart the console container after enabling.
- **Empty pipeline** — the store is empty; in demo mode the seed loads on boot. Confirm `GET /api/analytics` returns deals.

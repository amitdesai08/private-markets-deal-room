# Demo runbook

> **Which document do I want?**
> - Presenting to a private equity audience and not technical? Use the
>   [demo walkthrough](DEMO-WALKTHROUGH.md). It names every screen exactly as it appears
>   and assumes no software knowledge. **You do not need this document.**
> - Ten minutes and one screen? Use the [lightning demo](DEMO-LIGHTNING.md).
> - Setting the environment up, or answering a technical question? You are in the right
>   place. The second half of this document is written for engineers and says so.
>
> **All three run the same 25-minute story.** The lightning cut is the same story in 10.

A 25-minute guided demo of The Deal Room for delivery teams. It follows a
real institutional deal flow — **who can see what**, the **full lifecycle and its
gates**, the **senior expertise on every workstream**, the **artifacts an IC votes
on**, and how the **fund monitors the company after close** — all drawn from the
fund's own deal record.

> Prefer a story to a checklist? See the [demo walkthrough](DEMO-WALKTHROUGH.md) —
> the same material told as one deal's end-to-end journey, screen by screen. If you
> have never driven the product before, read that one first: it names every screen
> exactly as it appears and assumes no technical knowledge.

## The layout, in one table

Five tabs across the top. That is the whole product; there is nothing else to find.

| Tab | In one sentence |
|---|---|
| **Home** | What needs you today. |
| **Sourcing & screening** | Companies you are looking at but have not committed to. |
| **Deals in flight** | The deals you are actually running. |
| **Fund & Portfolio** | The fund's money, and the companies it already owns. |
| **Report** | The numbers you would send to an investor — issued as a draft until somebody certifies it. |

Open a deal and you get nine tabs, in the same order on every deal: **Deal brief ·
Thesis & key figures · IC readiness · Returns, plan & risk · Progress & follow-ups ·
Work the deal · Diligence workstreams · Documents · More ▾**.

If you get lost at any point, press a main tab. There are only five and they always
work.

## Before you start

- **Deploy in demo mode** (`azd up`) with `DEPLOY_DEMO_PROFILES=true`, or use an
  existing demo environment.
- Open the **web console** at `https://<teams-fqdn>/` (or the tab inside Teams).
- No sign-in needed in demo mode — you'll use the **"sign in as"** switcher.
- **You land on the Home — deals first, not market trends.** The overview
  opens on the **the headline figures** (live deals, pipeline value, average IC readiness,
  next to committee), a **Needs attention** list (the deals slipping toward IC, with a
  plain-language *why* and one-click Open / Ask), and the **deals-by-stage** capital
  view; **market intelligence sits deliberately last**. Lead the demo with the *work*
  (screening → diligence → IC), not the news feed — and note there is **no ROI /
  hours-saved framing**: the audience is the deal team, so every surface is
  decision-data-first.

> Everything comes from the fund's own deal record. If asked "is this real?",
> show that each answer traces back to a source you can open — nothing is invented.

---

## The canonical spine (tell it in this order)

Whatever the time budget, run the story in **one** order — all three demo assets map to it,
so you never mix “feature order” with “act order” mid-demo:

1. **Open & access** — the 30s pitch, then **“sign in as”** (who sees what).
2. **Source & screen** — Sourcing & screening funnel: signal → candidate → auto-screen → **PURSUE** gate.
3. **Diligence** — Diligence workstreams: red/amber/green workstreams, findings, **Apply ▸**.
4. **IC pack & decision** — Decision artifacts + the **pre-populated, firm-branded IC pack** +
   the **IC-readiness verdict** *(this is the wow — the blank page is gone)*.
5. **Own & monitor** — Fund & Portfolio: marks, watchlist, LPA limits.
6. **Safe & real** — one line each: access enforced server-side, Files, chats & email over M365, keyless real data.
7. **Close & ask** — the source-to-own loop, then *“let's run this on your tenant next.”*

> **Safe fallback (~7 min):** beats **1 → 2 → 4 → 5 → 7** — skip live diligence *Apply* and the
> integrations. If a beat is fragile, narrate it rather than clicking it.

> **Data note — say this once:** everything is the fund's **seeded demo record** (realistic,
> self-contained, and it resets clean); only the **keyless connectors** (SEC/XBRL (the tagged-figures format regulators publish accounts in), GLEIF (the global register of legal entity identifiers), GDELT (a public worldwide news index))
> pull **real external data live**. If a live source is slow, fall back to the seeded view and keep
> moving — the story never depends on an external call.

> **60-second pre-flight (before the room):** confirm the **“sign in as”** switcher flips the deal
> counts (**9 → 7** for the analyst), the top consumer deal opens with **returns/risks populated**,
> and one **Apply ▸** writes to the **Activity** trail. If *Apply* is flaky, treat it as optional.

---

## 1 · The pitch (30s)

> "The Deal Room is where deal teams source, screen, run diligence, and take
> deals to IC — all in one place, inside Microsoft Teams or the browser. Every
> answer comes from the fund's own record, and **each person sees only what their
> role allows**."

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

> Two things to call out: **what you see follows who you are** — switch persona and the
> "Live deals" KPI changes *with* the deal list, not just the stage views; and outside demo
> mode a real user sees only **their own** view, not the whole tier. No one can grant
> themselves access they weren't given — it's the information barrier a fund has to
> enforce, not just display.

## 3 · The full deal lifecycle (2 min)

1. Open the **Lifecycle** tab.
2. Walk the **3 phases / 15 stages**, calling out the **6 decision gates (⛔)**:
   PURSUE → **IOI** → **LOI** → **IC** → **Signing** → **Exit**.
3. Note each stage's **owner persona** and the artifacts it produces.

> "This is the real institutional buyout process — not a demo toy. Each gate is
> where capital or resources get committed."

## 4 · A deal, end to end (4 min)

> Start on the **Home** you landed on: call out the **the headline figures** and the
> **Needs attention** list (deals slipping toward IC), then the **deals-by-stage** capital
> view — the story is the deals in flight, with **market intelligence intentionally at
> the bottom**. Then open a deal.

1. From **Home**, open a deal (e.g. the top consumer deal). Each stage names its
   **👤 owner persona** — the senior expertise stays in the background, so the
   surface reads like a deal team's own workspace, not a chatbot.
2. On the deal's **Overview**, call out the **Deal brief**:
   - **IC readiness breakdown** — the **READY / CONDITIONAL / NOT-READY** verdict, the
     readiness %, days-to-IC, and the **top 3 blockers**, each with a one-click **Resolve ▸**.
   - **“What changed since last check?”** — a the what-changed line showing readiness/verdict moves
     and newly-blocking vs resolved items since the last review (no history table — a lean
     single mark that only rewrites on real change).
   - **Next best action** — a deterministic strip that jumps to the exact tab to act.
3. **Workspace** tab — the **diligence workbench**: every workstream as a **red/amber/green** row
   (red/amber/green) with owner, progress and the blocking reason, plus a persistent
   **“N at risk”** count.
4. **Decision artifacts** tab — show the four cards:
   - **LBO / Returns** — entry multiple, sources & uses, base/upside/downside **IRR & MOIC** vs the hurdle. Click **Returns model (Excel)** to download the real workbook (Summary · Sources & Uses · Scenarios · Sensitivity).
   - **Value creation** — the EBITDA bridge + quantified levers + 100-day plan.
   - **Risk register** — open risks by severity × likelihood, red/amber/green.
   - **IOI / LOI** — the non-binding indication and letter of intent.
5. **IC readiness** tab — the full decision-grade board + verdict.
6. **Compare** — back on Home, tick **2–4 deals** and open the side-by-side
   grid (stage, IC readiness, days-to-IC, size, priority, recommended action); hit
   **⧉ Copy table** to paste it straight into a note.

> "Every number is the deal's real number — change the deal and the returns, the
> risks, the IC verdict and the delta all move with it. Nothing is static or hand-typed."

## 5 · Fund & portfolio — monitor what you own (2 min)

Open the **Fund & Portfolio** tab — the *post-IC* lens most tools stop short of.

1. **Fund / LP headline** — committed capital, % deployed, dry powder, and
   **TVPI · DPI · RVPI** with gross & net **MOIC / IRR** (Fund IV, $2.6B).
2. **Portfolio monitoring** — each owned company with hold period, entry→current
   multiple, **current MOIC & IRR**, value-creation progress and an
   **on-track / watch / underperform** status. Expand one to see the levers, the
   100-day plan and **KPIs vs the underwriting plan** (and an honest underperformer).
   Call out the **Watchlist** at the top — the deteriorating names ranked, each with
   its **primary driver** (the worst KPI vs plan) and a **Review ▸** into the detail.
3. **Concentration vs LPA limits** — sector & single-position exposure against the
   mandate's hard caps — compliance-by-design.
4. As **IR** or **Operating Partner**, ask the agent: *"How does the fund read to
   our LPs?"* or *"Where's the biggest EBITDA-bridge lever across the portfolio?"*
   (backed by `get_fund_overview` / `get_portfolio`).

> "The deal didn't end at IC — it became a company we own, and the same governed
> record now tracks its value creation, its marks and its fit to the mandate."

## 6 · Talk to the specialists (3 min)

Two ways to chat — both answer from the live record and in the right specialist's voice:

- **Portfolio-wide:** open the **agents** panel (as **Michael** or **Eleanor** so the full
  roster shows) and ask across deals.
- **Inside a deal:** open a deal and hit **💬 Ask agents** — the chat now opens **inside the
  Deal Room drawer**, scoped to that one deal (it no longer bounces back to the main screen).

Ask:
- **Fund CFO:** *"Pull the returns model — base IRR and MOIC, and does it clear the hurdle?"*
- **Operating Partner:** *"What are the top value-creation levers across the portfolio?"*
- **Deal Room Analyst:** *"What's blocking this deal from going to IC?"*

> Each specialist answers from the live pipeline and shows its sources — so you get
> a partner-, CFO- or analyst-level view you can actually trust and trace.

> **One assistant, the whole deal team behind it.** The user talks to a single **Deal
> Room Assistant**; behind that one answer, the right experts get pulled in
> automatically — sourcing, screening, diligence, modeling, IC-memo, value-creation —
> and their views are combined into a single reply that tells you who weighed in. Ask a
> modeling + IC question and watch the **modeling** and **ic-memo** experts come in
> together. You get the whole deal team's judgment from one question.

> **Approve-to-apply + the audit trail (🆕).** Inside a deal, the assistant doesn't just
> answer — it **proposes concrete next steps** grounded in the deal's state (e.g. *“Log
> this blocking workstream as an issue”*, *“Mark this issue resolved”*). It **never acts
> on its own**: each proposal is a chip you **Apply ▸**. Applying writes the change to the
> live record and a **fully-attributed audit entry** — open the deal's **Activity** tab to
> show *who did what, when*, with a **“via assistant · you approved”** badge on every
> assistant-applied change. That's the governance answer to “can the AI change things?” —
> yes, but only when a human approves, and always on the record.

## 7 · The Deal Room Report — Power BI, integrated in the app (1 min)

Open the **Report** tab inside the app (top nav). Reporting is now a **first-class
function of the console itself** — not a separate pinned tab. The app serves the fund's
**real Power BI report** — Portfolio Overview · Sector & Industry · Pipeline by Stage ·
Deal Value & Valuation · Time-based metrics — **embedded** for signed-in users
(user-owns-data), with an **Open in Power BI** deep link and a live native summary as a
fallback. (A channel tab pinned to the old `?view=report` link still opens straight to
this in-app Report tab.)

## 8 · Files, chats & email — agents over SharePoint / Teams / mail (1 min)

Open **Settings (⚙) → Data Sources → Files, chats & email**: paste the MCP endpoint and **Connect**. Once
connected, the internal-data agents gain **governed, delegated** M365 tools —
`workiq_search_files` (SharePoint/OneDrive), `workiq_read_channel` (Teams) and
`workiq_search_mail` (Outlook) — so a diligence question can draw on the deal's real
documents, channel discussion and correspondence. Your **external** news tool can
**never** reach inside your firm's documents: the boundary between outside data and
your confidential estate is enforced and logged, so nothing leaks across it.

> **Add your own provider.** In **Data Sources**, the **Add a data source** form registers any
> provider the platform doesn't ship a built-in for (PitchBook, Morningstar Direct, an internal
> API) — name it, pick its sourcing role, drop in an endpoint, and it appears as a governed
> connector with an honest **reachability** test (never a faked "connected"). A name that
> duplicates a built-in is rejected; remove a custom source anytime.

## 9 · Board-ready documents, in your firm's house style (1 min)

- Every deal's data room **arrives pre-populated**: a full **IC pack** — memo (Word), deck
  (PowerPoint) and deal & returns models (Excel) — plus a plain-English **data-room guide** are
  drafted from the live record and dropped straight into the room, so the team opens to a finished
  first draft, not a blank page. Open a deal's **Documents** tab and the seeded **IC Materials** folder.
- The memo is a real committee paper — thesis, merits, risks, valuation & returns, value creation,
  diligence findings and the IC ask — so a partner starts from something to polish, not to write.
- Open **Settings → Document templates**: set the **fund name, brand colours, confidentiality
  wording and which sections appear**, and every future document follows suit — *"it looks like your
  firm's paper, not a vendor's; you adopt it without re-templating a thing."*
- Generate on the requester's own M365 license, or download a personal working copy.

## 10 · Real data, no paid provider (1 min) *(optional)*

- Hit `GET /api/company/Apple/fundamentals?ticker=AAPL` — **real SEC/XBRL
  fundamentals** stand in for a paid data provider, so demos show live numbers
  with **no license**. (`/api/providers/keyless` lists SEC, GLEIF, GDELT.)

## 11 · Close (30s)

> "It stands up fast on your own Microsoft tenant and is inexpensive to pilot — get a current figure from the delivery team before you quote one —
> shaped to your roles, your senior personas and your data. And it carries a deal the
> whole way: from the first sourcing signal to a portfolio company you actively
> monitor, inside the tools your firm already runs."

> **The ask:** *"Let's stand this up on **your** tenant, with **your** deal process — a short
> pilot on one live deal, shaped to your roles and personas."*

---

## Quick reference

| Feature | Where |
|---|---|
| RBAC / demo roster (5 Good Place tiers) | top-bar **"sign in as"** (single dropdown, Name — Role) |
| Deal brief (verdict + top blockers + “what changed” delta + next best action) | deal → **Overview** |
| Diligence workbench (red/amber/green workstreams) | deal → **Workspace** tab |
| Side-by-side compare (2–4 deals + Copy table) | **Home** → tick **+ Compare** |
| Assistant approve-to-apply + audit trail | in-deal **💬 Ask** → **Apply ▸** · deal **Activity** tab · `POST /api/deals/:id/assistant-actions` · `GET /api/deals/:id/activity` |
| Lifecycle (15 stages, 6 gates) | **Lifecycle** tab · `GET /api/lifecycle` |
| Decision artifacts | deal → **Decision artifacts** tab · `/api/deals/:id/{returns,value-creation,risk-register,ioi,loi}` |
| Returns Excel | deal → **Documents** → *Returns model (Excel)* |
| Fund & portfolio (post-IC) | **Fund & Portfolio** tab · `/api/fund/{overview,portfolio,value}` |
| Specialist agents | **agents** panel + in-deal **💬 Ask agents** · `GET /api/persona-agents` |
| Orchestrated delegation | one assistant → orchestrator delegates to stage specialists → composes (`ORCHESTRATION=purpose`) |
| Deal Room Report (Power BI) | in-app **Report** tab (top nav) |
| Add a custom data source | **Settings ⚙ → Data Sources → Add a data source** · `POST /api/connectors` |
| Files, chats & email (M365 for agents) | **Settings ⚙ → Data Sources → Files, chats & email** |
| Keyless data | `/api/company/:name/fundamentals`, `/api/entity/:name/lei`, `/api/news/gdelt` |

## Troubleshooting

- **Agents say "temporarily unavailable"** — the Foundry agents weren't provisioned. Run `app/scripts/create_persona_agents.py` (or re-`azd up` with `DEALROOM_AGENTS` unset).
- **No demo profiles in the switcher** — set `DEPLOY_DEMO_PROFILES=true` and redeploy; the console caches the roster, so restart the console container after enabling.
- **Empty pipeline** — the store is empty; in demo mode the seed loads on boot. Confirm `GET /api/analytics` returns deals.

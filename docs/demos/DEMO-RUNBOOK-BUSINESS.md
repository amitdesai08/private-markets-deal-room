# Demo runbook — business audience

> **Which document do I want?**
> - Presenting to a CEO, CFO, Managing Partner or Managing Director, and not delivering it
>   yourself? Use the [business demo walkthrough](DEMO-WALKTHROUGH-BUSINESS.md). It names
>   every screen exactly as it appears. **You do not need this document.**
> - Ten minutes and one screen? Use the [business lightning demo](DEMO-LIGHTNING-BUSINESS.md).
> - Delivering it yourself, or need the underlying feature/API mapping? You are in the right
>   place.
> - Presenting to a technical or deal-team audience instead? Use the
>   [technical runbook](DEMO-RUNBOOK-TECHNICAL.md) or the [PE-audience runbook](DEMO-RUNBOOK.md).
>
> **All three business assets tell the same story.** The walkthrough runs 15 minutes, the
> lightning cut 10.

A 15-minute guided demo of The Deal Room for a firm's leadership — CEO, CFO, Managing Partner,
Managing Director. It is framed around **operating capacity**: six manual tasks a firm
performs today, and the mechanic in the product that removes each one. It does not use
invented percentages anywhere — every claim below names the specific task it replaces, and
that discipline should hold in the room too. If you cannot name the mechanic, do not make the
claim.

## Before you start

- **Deploy in demo mode** (`azd up`) with `DEPLOY_DEMO_PROFILES=true`, or use an existing demo
  environment. Sign in as **Eleanor Shellstrop — Partner**.
- **Say this once, out loud:** "Everything on screen is an invented demonstration book. What
  I want you to watch is not the data — it's the six places this removes a manual task your
  team does today."
- This runbook does not cover access control or the Azure footprint in depth — if leadership
  asks a security or IT question, offer a follow-up with their technical team rather than
  answering it here; the [technical runbook](DEMO-RUNBOOK-TECHNICAL.md) is written for exactly
  that conversation.

---

## The canonical spine (tell it in this order)

1. **Open** — the 30-second pitch: hours back, not features.
2. **The day starts triaged** — the daily briefing and **Needs attention**.
3. **Screening at scale** — Sourcing & screening, mandate-gated automatically.
4. **The blank page is gone** — the IC pack, drafted; **The case**'s readiness verdict.
5. **Nothing forgotten** — **Untracked follow-ups**.
6. **One system, source to exit** — Fund & Portfolio; the CRM connector if relevant.
7. **Reporting without the scramble** — Firm reporting, certified or plainly draft.
8. **Close & ask** — the operating-capacity recap, then a working session on their own numbers.

> **Safe fallback (~8 min):** beats **2 → 4 → 5 → 8** — skip live screening and the CRM
> connector detail if time is short.

> **60-second pre-flight:** confirm the daily briefing paragraph and **Needs attention** load
> on Home, a deal's **Papers** tab shows a pre-populated IC pack, and **Untracked follow-ups**
> has at least one entry to point at.

---

## 1 · The pitch (30s)

> "I want to walk this the way you would — not for the features, for the hours it gives back.
> Every saving I show you today is one specific manual task this removes. None of it is a speed
> claim I'm asking you to take on faith."

## 2 · The day starts already triaged (2 min)

1. Point at the daily briefing paragraph at the top of **Home**.

> "Most firms start the day with someone assembling what needs attention. This paragraph is
> that same work, done automatically from the deal record every time the page loads."

2. Point at **Needs attention**; press **🔍 Evidence** on one line.

> "The list a partner used to ask three people to compile before a Monday pipeline call —
> here, current on load, and every figure opens to its source."

## 3 · Screening at scale, not by headcount (2 min)

Open **Sourcing & screening**.

> "Every signal is screened against the fund's mandate automatically, before an analyst spends
> an afternoon on a company the fund was never permitted to buy. The hour that used to go to
> that afternoon now goes to the deals that clear the mandate."

## 4 · The blank page is gone (3 min)

1. Open a deal → **Papers**.

> "The IC pack — memo, deck, returns model — is already drafted from the live record, in the
> fund's own house style. That person's job changes from writing the first draft to improving
> one that already exists."

2. Open **The case**.

> "A Ready, Conditional or Not-ready verdict, with named blockers. The pre-IC status meeting
> that used to exist just to establish readiness can become a meeting to decide something."

## 5 · Nothing promised gets forgotten (2 min)

Back on **Home**, point at **Untracked follow-ups**.

> "A commitment made in a Teams thread that nobody wrote down, surfaced automatically across
> every deal — not chased, simply noticed and put in front of a person."

## 6 · One system, source to exit (3 min)

1. Open **Fund & Portfolio**.

> "A closed deal doesn't hand off to a different system to monitor — same governed record,
> before and after close."

2. If relevant: open **Settings → Data sources → Your CRM**.

> "If the firm already runs a CRM for pipeline, this connects directly — existing deals pull
> in once, and every IC decision pushes back out automatically. No re-keying between the two
> systems."

## 7 · Reporting without the scramble (2 min)

Open **Firm reporting**.

> "Reporting to an LP is normally a manual pull-together at quarter end. Here it's a live view
> of the same record, certified by a named partner with one action — 'certified for LP use' or
> plainly marked 'draft,' never ambiguous, and nothing to rebuild from scratch every quarter."

## 8 · Close (30s)

> "Every saving today came from removing a manual assembly step — the briefing, the first
> draft, the follow-up, the re-keying, the quarterly report. It runs inside Microsoft Teams, so
> it isn't a new place for your team to learn to work."

**The ask:** *"A working session with your deal team to map these six tasks against how your
firm runs them today, or a pilot on one live deal."*

---

## Quick reference

| Feature | Where |
|---|---|
| Daily briefing / Needs attention | **Home** · `GET /api/analytics` |
| Sourcing & screening, mandate gate | **Sourcing & screening** tab |
| IC pack, pre-drafted | deal → **Papers** |
| Readiness verdict + blockers | deal → **The case** |
| Untracked follow-ups | **Home** → **Untracked follow-ups** |
| Fund & portfolio (post-close) | **Fund & Portfolio** tab · `/api/fund/{overview,portfolio,value}` |
| CRM / system-of-record connector | **Settings ⚙ → Data sources → Your CRM** |
| Firm reporting, certify | **Firm reporting** tab |

## Troubleshooting

- **Untracked follow-ups is empty** — the seeded demo record includes several by design;
  confirm the demo store hasn't been reset mid-session.
- **A leadership question drifts into security/architecture territory** — hand off to the
  [technical runbook](DEMO-RUNBOOK-TECHNICAL.md) or offer a follow-up with their IT team rather
  than answering it here.
- **Asked for a specific hours-saved or cost figure** — do not improvise one; offer to map the
  six mechanics in this runbook against the firm's own current process in a follow-up session.

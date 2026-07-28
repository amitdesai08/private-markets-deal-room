# PE personas — who uses the Deal Room, and what they need

Written for a builder with **no private-equity (PE) background**. It explains the real
roles at a mid-market PE firm, what each one actually does, what they want from an AI
assistant, and how that maps to the Deal Room's **Entra ID roles**, **agents** and **deal
stages**. Pair with [EXPLAINER.md](EXPLAINER.md) (the plain-English tour + glossary) and
[AGENTS.md](AGENTS.md) (the agent reference).

## The 60-second mental model

A PE fund raises money from **LPs** (limited partners — pensions, endowments), pooled into a
**fund** run by the **GP** (the PE firm). The firm **sources** companies, **screens** them,
runs **diligence**, takes the good ones to the **Investment Committee (IC)** for a go/no-go,
**buys** them (often with debt — a leveraged buyout, **LBO**), spends 3–6 years growing them
(**value creation**), then **exits** (sells) for a profit. Returns are measured as **IRR**
(annualised %) and **MOIC** (multiple of money). The Deal Room is the workspace for that whole
journey — and every person below sees a different slice of it.

## The roster

| Persona | What they do | What they want from AI | Deal stage | Entra role (suggested) | App role tier |
|---|---|---|---|---|---|
| **Managing Partner** | Runs the firm; final IC vote; owns LP relationships | Portfolio-wide go/no-go read; the LP narrative; where to lean in | All | `DealRoom.ManagingPartner` | admin / partner |
| **Deal Partner / MD** | Sponsors deals; chairs IC for their sector | "Is this deal IC-ready? What conditions would I require?" | All | `DealRoom.Partner` | partner |
| **Principal / VP** | Runs deals day-to-day; leads diligence; drafts IOI/LOI | Diligence status + gaps; draft the IOI; model updates | 1–3 | `DealRoom.Principal` | deal-team |
| **Associate / Analyst** | Sourcing, screening, modelling, research, memo drafting | "Screen this target"; "build the LBO"; "summarise the CIM" | 1–2 | `DealRoom.Analyst` | analyst |
| **Operating Partner** | Value creation inside owned companies; board work | "Draft the 100-day plan"; "which company is off-plan?" | 4 | `DealRoom.OperatingPartner` | deal-team |
| **Fund CFO / Finance** | Fund accounting, returns, LP reporting, NAV | "Fund IRR/MOIC"; "returns sensitivity"; "sources & uses" | 2–4 | `DealRoom.FundCFO` | deal-team |
| **Investor Relations (IR)** | LP communications, fundraising, ILPA reporting | "LP exposure & concentration"; "the LP-facing read" | All | `DealRoom.IR` | partner |
| **General Counsel / Legal** | Deal execution, SPA, compliance, KYC/AML | "Summarise the SPA issues"; "run the KYC check" | 2–3 | `DealRoom.Legal` | deal-team |

> **Narrow scoping is the point.** An Associate lives in sourcing/screening/modelling; an
> Operating Partner lives in the portfolio. Each persona's assistant is tuned to *their* jobs,
> *their* stage, and *their* access — not a generic chatbot.

## Persona → Entra role → access (how it's enforced)

**Why it matters:** because each role sees a different, need-to-know slice of the fund, here's how a
real person maps to exactly what they can see and do.

The Deal Room resolves a user's role from their **Entra identity** (object id, UPN, or an
Entra **group**) in [userPolicy.js](../app/lib/userPolicy.js) (`roleForUser`). The role decides
three things, all enforced server-side (a client can never widen them):

1. **Which agents/skills** they can use (their capability set — ask the assistant "what can you
   do?" to see it, scoped to the role).
2. **Which deals** they can see — confidential deals outside their team are hidden, and Stage-2
   detail is limited to the deal team (`dealAccessLevel`).
3. **Whether they can act** (write) vs read-only (analyst/observer).

To wire real users: set the Entra object ids / group ids for `adminIds`, `partnerIds`,
`dealTeamIds`, `analystIds` at deploy (or in the in-app Admin → Access screen). The suggested
`DealRoom.*` roles above are the recommended granular mapping; the app ships 5 built-in tiers
(admin · partner · deal-team · analyst · member) and supports custom roles, so you can add the
finer PE titles as custom Entra-mapped roles.

## What "interaction they're looking for" means in practice

PE professionals don't want a search box — they want **decision-grade answers grounded in the
live deal record**, in their language, with the sources shown. The recurring asks:

- **Partners:** synthesis + judgement. "Give me your go/no-go read and the two conditions I'd
  require." "How does this read to our LPs?"
- **Principals/Associates:** leverage on the grunt work. "Summarise this 140-page CIM." "Build
  the base/bull/bear LBO." "Draft the screening one-pager, cited."
- **Operating Partners:** the plan and the exceptions. "Where's the biggest EBITDA-bridge lever
  across the portfolio?" "Which company is off-plan and why?"
- **Finance/IR:** the numbers and the narrative. "Fund TVPI/DPI and net IRR." "Concentration vs
  the LPA limits."

Every one of those is a governed tool call against the real record — never a guess.

## Mini-glossary (the PE words you'll hear)

- **GP / LP** — General Partner (the PE firm) / Limited Partner (the investors).
- **Fund / Mandate / LPA** — the pool of capital; the rules it must invest within (Limited
  Partnership Agreement).
- **Sourcing / Screening / Diligence** — find deals / qualify them / investigate them.
- **IC (Investment Committee)** — the go/no-go decision body. **IC memo** = the write-up that
  goes to it.
- **IOI / LOI / SPA** — Indication of Interest / Letter of Intent / Sale & Purchase Agreement —
  the escalating deal documents.
- **LBO** — Leveraged Buyout (buying with debt). **DCF** — Discounted Cash Flow valuation.
  **Comps** — comparable companies/transactions.
- **IRR / MOIC** — Internal Rate of Return (%/yr) / Multiple On Invested Capital (×).
- **TVPI / DPI / RVPI** — Total value / Distributed / Residual value, ÷ paid-in capital — how
  LPs judge a fund. **Dry powder** — committed capital not yet invested.
- **EBITDA bridge** — how you get from today's profit to exit profit (the value-creation levers).
- **100-day plan** — the post-acquisition action plan. **Hold period** — how long you own it.

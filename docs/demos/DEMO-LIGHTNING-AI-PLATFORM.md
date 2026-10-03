# Lightning demo — AI platform audience — 6 to 8 minutes

A short cut for someone evaluating **the Microsoft AI stack**, not private equity. The deal
domain is just the worked example; every beat here is about a Microsoft capability and how it
is wired. For the PE-audience cut see [DEMO-LIGHTNING.md](DEMO-LIGHTNING.md); for the
infrastructure and security review see [DEMO-LIGHTNING-TECHNICAL.md](DEMO-LIGHTNING-TECHNICAL.md).

**No recording for this one.** It's a live click-through, led by a person. The clicks sit
inline with the words, so you can read it top to bottom while you present: **Do** is stage
direction, the quoted lines are what you say. Run it against the deployed app in Teams, or
standalone in a browser.

**Say this before you click anything:**

> "I'm going to skip most of what this product does for a deal team, because that's not what
> you're here for. What I want to show you is the Microsoft AI platform underneath it, and
> specifically the parts you'd have to build yourself if you started from a chat endpoint.
> Everything on screen is an invented demonstration book, so don't read the numbers."

---

## The route, at a glance

Home → briefing badge → Evidence → open a deal → Ask the assistant → Settings, Data sources →
back to the deal → Audit trail. Eight stops, one pass, no backtracking.

| # | Beat | Time | Lands on |
|---|---|---|---|
| 1 | Where it runs | 40s | Home |
| 2 | Generation that labels itself | 50s | Daily briefing |
| 3 | One assistant, several agents | 60s | A deal, assistant open |
| 4 | Tools, not prompt text | 45s | Same panel, mid-answer |
| 5 | A boundary a prompt can't cross | 50s | Settings → Data sources |
| 6 | Microsoft 365 as a first-class source | 50s | Same page, scrolled |
| 7 | Ask your fund data | 45s | Same page |
| 8 | Governed and measured | 60s | Deal → Audit trail |

---

## The walk

Each beat is what to **do**, then what to **say**. Read the quoted lines; the rest is stage
direction.

### 1 · Where it runs · 40s

**Do** — land on **Home** (`#/overview`) and let it finish loading before you speak.

> "This is running in a resource group in our own Azure subscription, signed in with our own
> Entra tenant. It isn't multi-tenant SaaS, and the data never leaves. The model behind it is
> Azure OpenAI, and the agents are Microsoft Foundry agents provisioned into that same project."

**Do** — point at the small **Powered by** pills on the cards.

> "Watch the small pills on these cards. Each one names where that panel's content actually came
> from: Microsoft Fabric, Teams and SharePoint, live web search. That's deliberate. If you're
> going to put generated content in front of someone, they need to know what produced it."

*Proves: your tenant, your subscription, and provenance on every generated panel.*

### 2 · Generation that labels itself · 50s

**Do** — stay on Home. Point at the **▤ Composed** badge on the daily briefing.

> "This paragraph was written for whoever is signed in. The badge says **Composed**, which
> means the platform assembled it from the record using a fixed template. No model touched it,
> so it can't change a deal's status and it can't hallucinate.
>
> Where a badge says **AI** instead, a language model genuinely wrote the prose. Two different
> kinds of writing, labelled differently, because a reader can't tell by looking.
>
> And every numbered claim opens back to its source."

**Do** — press **🔍 Evidence**. Let the sources open before you carry on.

> "That's the question that stops every committee: where did this number come from. It isn't a
> footnote we wrote, it's a link back into the record the sentence was built from."

*Proves: deterministic text and model text are distinguishable on screen, and both are traceable.*

### 3 · One assistant, several agents · 60s

**Do** — open a deal (**Helvetia Diagnostics** works well), then press **💬 Ask the assistant**.
Type *"What are the top risks and the compliance status?"* and send it. Keep talking while it
runs.

> "One assistant, one box. Behind it there's a Deal Room orchestrator agent running on Foundry.
> It reads the question and decides which stage specialists need to weigh in: sourcing,
> screening, diligence, modelling, IC memo, value creation. Then it calls only those and
> composes a single answer.
>
> It's capped at two specialists a turn, because fan-out costs latency and quota, and most
> questions don't need six opinions.
>
> Notice what we're not doing: there's no dropdown of agents to pick from. Making a user choose
> the right specialist is making them do the routing, and they'll get it wrong. The routing is
> a fixed decision tree in code, not something a prompt can talk its way around."

**Do** — when the answer lands, read out the part where it names who it consulted.

*Proves: real multi-agent delegation on Foundry, behind one conversation.*

### 4 · Tools, not prompt text · 45s

**Do** — stay in the panel. Point at the status line as it works, or scroll back to it if the
answer has already arrived.

> "That status line is the agent calling tools. They're published as a hosted, read-only MCP
> server, and Foundry runs the tool loop itself — we hand it a tool surface, it decides what to
> call.
>
> The loop is bounded: five round trips a question, four calls a trip, and each tool payload is
> capped before it goes back to the model. Those limits aren't decoration. An unbounded tool
> loop is how a single question quietly costs you a hundred thousand tokens.
>
> The important part is that the data reaches the model as a tool result, not as text somebody
> pasted into a prompt. That's what makes the next beat possible."

*Proves: a governed tool surface over MCP, with the loop bounded on purpose.*

### 5 · A boundary a prompt can't cross · 50s

**Do** — close the assistant, open Settings **⚙**, then **Data sources**. Point at **Live web &
news** sitting beside the internal sources.

> "Every agent belongs to one of two classes, set in a registry. Internal-data agents read the
> fund's governed record and have no path to the public web. The one external-web agent, the
> news scout, searches the open internet and has no internal tools at all. It can't read a
> deal record, so nothing internal can leave through it.
>
> That's checked server-side on every single tool call, before it runs. It isn't a system
> prompt asking nicely. If the model emits a web call from an internal agent, the call is
> refused and the refusal is logged.
>
> This is the thing I'd push on if I were you, because 'don't let the agent exfiltrate data' is
> the requirement everyone writes down and very few enforce below the prompt."

*Proves: two agent classes, enforced server-side on every tool call.*

### 6 · Microsoft 365 as a first-class source · 50s

**Do** — scroll down the same page to **files, chats and email**.

> "This is Work IQ. It lets an internal agent read this firm's own SharePoint files, Teams
> channel messages and mail, through Microsoft Graph.
>
> It's not a connector we invented. It's the same Graph app registration Teams already uses, so
> a read runs as the signed-in user whenever we have a user token. Microsoft 365 then enforces
> that person's own file and mailbox permissions, on top of the product's own need-to-know
> model. Two layers, and we didn't write either one.
>
> So the assistant can genuinely open the deal's real documents and the channel discussion
> around them. Ask the external news agent the same question and it has no path to any of it,
> because that boundary from a moment ago holds here too."

*Proves: Graph reads run as the signed-in user, so M365 enforces their permissions too.*

### 7 · Ask your fund data · 45s

**Do** — on the same page, point at **Ask your fund data**.

> "This one is a Microsoft Fabric data agent. You ask a question in plain English, it answers
> over the fund's lakehouse, and the citations come back from OneLake.
>
> What I'd point out is the honesty of the modes. With a published Fabric agent bound, it posts
> the question there and returns that agent's grounded answer. Without one, it answers over the
> same lakehouse snapshot through the model, and it says on screen that's what it's doing. With
> neither available it tells you it can't answer.
>
> It never fabricates a number to fill the gap, which is the only behaviour that makes a data
> agent safe to put in front of someone who'll act on it."

*Proves: natural language over a Fabric lakehouse, cited back to OneLake, honest when unbound.*

### 8 · Governed and measured · 60s

**Do** — go back to the deal and open **Audit trail**. Leave it on screen for the rest of the
demo.

> "Last thing, and it's the one that matters most if this goes into production.
>
> The assistant proposes. A person presses Apply. That write is governed by the caller's own
> role, exactly as if they'd typed it themselves, and the audit trail records who did what and
> when, with a 'via assistant, you approved' badge on anything the assistant touched. You can
> always answer 'who changed this, and did a human agree to it'.
>
> There's also an Azure AI Content Safety check on the model path, and token accounting on
> every call — prompt, completion, cached and reasoning tokens, broken down per feature, behind
> an admin-only endpoint. That last one isn't a screen, it's an API, so I'll show you the
> numbers rather than click it.
>
> That's the point. Measuring what the model costs is how the prompts got reordered so Azure
> OpenAI's prompt cache can actually serve them: the deal record moved ahead of the
> conversation, because the cache only matches an identical prefix. You can't tune what you're
> not measuring."

*Proves: every model-proposed write is attributed to a person, and the spend is measured.*

---

## If they ask

| Question | Answer |
|---|---|
| "Which model?" | Azure OpenAI, `gpt-5-mini` by default, set per deployment. The Foundry agents use the same project. |
| "Is any of this fine-tuned?" | No. It's grounding, tool use and routing, not a custom model. |
| "How do the agents get the user's identity?" | Foundry calls the hosted MCP with the agent's own credentials, so end-user identity stops at that hop. The shared server refuses confidential-deal detail outright as the mitigation; per-user identity through MCP is the open item. |
| "What if Speech, Fabric or Content Safety aren't configured?" | Each degrades to a labelled, honest mode rather than failing or pretending. That's a deliberate property, and worth demoing if you have time. |
| "Can we see the cost numbers?" | `POST /api/admin/token-usage`, admin only. Returns prompt, completion, cached and reasoning tokens with a per-feature breakdown. |

## Timing

Eight beats, roughly 6 minutes 40 seconds of talking. Beats 3 and 8 are the two to protect if
you're short — orchestration and governance are the two things an AI platform audience
remembers. Beat 7 is the first to cut.

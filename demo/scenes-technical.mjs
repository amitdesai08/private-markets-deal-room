// The technical/IT-audience demo, as data — captured on its own, not cut from the PE
// walkthrough. Same mechanics as scenes.mjs (capture.mjs drives it, narrate.mjs voices it,
// build-player.mjs assembles it), same running product, different lens: this one is for
// the people who have to approve, deploy and operate the platform, not the people who use
// it to run a deal. Narration follows docs/demos/DEMO-WALKTHROUGH-TECHNICAL.md act for act.
//
//   node demo/capture.mjs      --scenes scenes-technical.mjs --manifest scenes-technical.json
//   node demo/narrate.mjs      --manifest scenes-technical.json
//   node demo/build-player.mjs --manifest scenes-technical.json --out technical.html
//   node demo/build-video.mjs  --manifest scenes-technical.json --out technical.mp4

export { BASE } from './scenes.mjs';

export const ACTS = [
  { n: 100, title: 'Opening — whose tenant this runs in' },
  { n: 101, title: 'The identity trust seam' },
  { n: 102, title: 'Data sovereignty — two classes of agent' },
  { n: 1025, title: 'Agentic workflows — one orchestrator, many specialists' },
  { n: 103, title: 'Connector governance, and Work IQ' },
  { n: 104, title: 'The audit trail and approve-to-apply' },
  { n: 105, title: 'The Azure footprint and the network boundary' },
  { n: 106, title: 'Deploy, extend, jumpstart' },
];

export const SCENES = [
  // ─── Opening ────────────────────────────────────────────────────────────────
  {
    id: 'tc-00-open',
    act: 100,
    title: 'One tenant, one backend, no keys',
    seat: 'admin',
    steps: [{ goto: '#/overview' }, { waitText: 'Daily briefing' }, { scrollTop: 0 }],
    say: `This is the Deal Room, looked at from the platform side rather than the deal side. It deploys with one
      command into your own Azure subscription and your own Microsoft Entra tenant. It's not multi-tenant SaaS,
      and your data never leaves a resource group you control. Everything on screen is an invented demonstration
      book, but the architecture underneath it is the real, deployed thing. We're signed in as Michael Realman, an
      administrator, because the next few minutes are about what an administrator and an engineer can see and
      control.`,
  },
  {
    id: 'tc-01-layout',
    act: 100,
    title: 'The product surface is small; the platform is not',
    seat: 'admin',
    steps: [{ scrollTop: 0 }],
    spotlight: 'nav.maintabs',
    say: `Five tabs are the whole product surface a deal team sees. That smallness is deliberate, and it's also
      not the interesting part of this walk-through. What sits behind those five tabs is one shared backend, a
      server-side identity boundary, two classes of AI agent that can't cross into each other's data, and a
      subscription-scoped Azure footprint with no secrets anywhere in the path. That's what an infrastructure or
      security review actually needs to see, and it's what the rest of this covers.`,
    click: 'nav.maintabs',
  },

  // ─── Act 101 · Identity trust seam ──────────────────────────────────────────
  {
    id: 'tc-02-seat-switch',
    act: 101,
    title: 'Access is resolved on the server, never trusted from the client',
    seat: 'admin',
    steps: [{ clickText: 'All deals' }, { wait: 2500 }, { scrollTop: 0 }],
    say: `Every deal read resolves through Microsoft Entra ID on the server before a single row is sent to the
      browser. A client can state who it is, but it can never widen its own access. The resolved identity is
      honoured only when the request carries a shared trust key the client can't forge. This administrator seat
      sees twenty-one deals, and that number isn't a filter applied in the browser after the fact. It's the number
      of rows the server ever sent.`,
    click: 'text:All deals',
  },
  {
    id: 'tc-03-seat-analyst',
    act: 101,
    title: 'The same boundary, a narrower seat',
    seat: 'analyst',
    keepBanner: true,
    steps: [{ selectSeat: 'analyst' }, { wait: 4000 }, { clickText: 'All deals' }, { wait: 3000 }, { scrollTop: 0 }, { openDeal: 'Onyx' }, { wait: 3000 }],
    say: `Switch the signed-in identity to an analyst, and the same server, the same code path, the same API
      route now returns eight deals instead of twenty-one. Nothing client-side decided that. There's no
      permissions table in this application at all; the role, the group memberships and the need-to-know grants
      all live in Microsoft Entra ID, the same directory that already governs this firm's Teams and SharePoint.
      This seat also opens Project Onyx, a confidential carve-out, in full. Not because of rank, but because this
      analyst is one of the named people on its deal team.`,
  },
  {
    id: 'tc-04-restricted-deal',
    act: 101,
    title: 'Restricted data is never sent to the browser',
    seat: 'admin',
    keepBanner: true,
    steps: [{ selectSeat: 'admin' }, { wait: 4000 }, { gotoConfidential: true }, { wait: 2500 }],
    say: `Now open that same Project Onyx link directly as the administrator, the highest ordinary seat in the
      switcher. The product answers with deal unavailable, and it won't say whether that's because the deal
      doesn't exist or because this seat isn't on its team. It never renders a blurred card or a locked icon. The
      record is simply never transmitted, and there's nothing in the page's own network traffic to inspect. That's
      the distinction a security review usually asks about directly: is this a display rule, or is it enforced
      before the response leaves the server? Here, it's the latter, and not even seniority overrides it.`,
  },

  // ─── Act 102 · Data sovereignty — agent isolation ───────────────────────────
  {
    id: 'tc-05-assistant-scope',
    act: 102,
    title: 'Two classes of agent, a hard line between them',
    seat: 'admin',
    steps: [{ selectSeat: 'admin' }, { wait: 3000 }, { openDeal: 'Helvetia' }, { wait: 3000 }, { clickText: '💬 Ask the assistant' }, { wait: 2500 }],
    click: 'text:💬 Ask the assistant',
    say: `Every agent in this platform belongs to one of exactly two classes, set from a registry entry rather
      than asserted by the model itself. An internal-data agent, like the deal analyst or the fund's own reporting
      agent, can read this firm's governed record but has no reachable path to the public web. The one
      external-web agent, the news-sourcing scout, can reach the open internet but has no reachable path back into
      a deal record. That boundary gets checked on every tool call, server-side, before the call runs, so a
      manipulated prompt can't use either agent to move data across the line in either direction.`,
  },

  // ─── Act 1025 · Agentic workflows ────────────────────────────────────────────
  {
    id: 'tc-05b-agentic',
    act: 1025,
    title: 'One orchestrator, many specialists, one governed answer',
    seat: 'admin',
    keepBanner: true,
    steps: [{ wait: 500 }],
    say: `What you're looking at isn't one large model guessing at everything. A Deal Orchestrator reads the
      question first and decides which specialists actually need to weigh in, modelling, diligence, the IC memo,
      value creation, and so on, then calls only those, and only in that scope. It composes their answers into
      one reply and names which specialists it consulted, so the response is auditable rather than a black box.
      That routing is a fixed decision tree the model doesn't get to override, which is what stops a clever prompt
      from talking its way into a tool call it was never routed to make.`,
  },

  // ─── Act 103 · Connector governance, and Work IQ ─────────────────────────────
  {
    id: 'tc-06-datasources',
    act: 103,
    title: 'Every outside source is switchable, and honestly tested',
    seat: 'admin',
    steps: [{ closeOverlay: true }, { clickText: '⚙' }, { wait: 2000 }, { clickText: 'Data sources' }, { wait: 2500 }, { scrollTop: 0 }],
    say: `Settings, Data sources, lists every connector this deployment can reach: free public filings and news,
      subscription market-data providers reached over OAuth, the firm's own Microsoft 365 files and mail, and
      anything the fund registers itself. None of them report connected until a real round trip actually
      succeeds, a token refresh, a live request, an honest failure message if it doesn't. Nothing here is a
      static badge that says connected just because someone typed a name into a form.`,
    click: 'text:Data sources',
  },
  {
    id: 'tc-06b-workiq',
    act: 103,
    title: 'Work IQ — the firm\u2019s own files, chats and mail, governed',
    seat: 'admin',
    steps: [{ scrollTo: 'files, chats and email' }],
    spotlight: 'text:files, chats and email',
    say: `Scroll down and there's a second kind of connector entirely. This is Work IQ, the set of tools that let
      an internal agent read this firm's own SharePoint files, Teams channel messages and mail through Microsoft
      Graph. It isn't a bolt-on integration; it's the same Graph app registration Teams already uses, so a read
      runs as the signed-in user whenever a user token is available, and Microsoft 365 enforces that person's own
      file and mailbox permissions on top of the deal's own need-to-know model. Ask a diligence question and the
      agent can genuinely open the deal's real documents and channel discussion. Ask the external news agent the
      same question and it has no path to any of this, because that boundary from a moment ago holds here too.`,
  },
  {
    id: 'tc-07-connector-approval',
    act: 103,
    title: 'A self-registered source is pending until an administrator approves it',
    seat: 'admin',
    steps: [{ scrollTo: 'Add a data source' }],
    spotlight: 'text:Add a data source',
    say: `A data source the fund adds itself, an internal API or a provider without a built-in connector, is
      registered here but marked pending. It can't be tested, enabled, or used by any agent until an administrator
      approves it. That approval gate exists for exactly the reason a security reviewer would raise it: a
      self-registered outbound connection is a real attack surface, and this platform won't let one go live
      silently.`,
  },
  {
    id: 'tc-08-crm-connector',
    act: 103,
    title: 'The same governance extends to a firm\u2019s own CRM',
    seat: 'admin',
    steps: [{ wait: 500 }],
    say: `The newest connector this registry supports is the one most infrastructure teams ask about first: a
      firm's existing CRM or deal database, DealCloud, Salesforce, Allvue, or an internal system. Connecting it is
      administrator-only, needs a real API credential, either an OAuth client-credentials grant or an API key,
      and stays pending until approved, just like the source on screen now. Once approved, it pulls the firm's
      existing pipeline in, matched by connector and native record id rather than by company name, so a re-sync
      can't create a duplicate. It pushes investment-committee decisions back out the moment a deal clears a
      gate, and it never blocks that decision just because the CRM happens to be unreachable at that moment.`,
  },

  // ─── Act 104 · Audit trail and approve-to-apply ──────────────────────────────
  {
    id: 'tc-09-apply',
    act: 104,
    title: 'The assistant proposes; a person applies',
    seat: 'partner',
    steps: [{ closeOverlay: true }, { selectSeat: 'partner' }, { wait: 3000 }, { openDeal: 'Helvetia' }, { wait: 3000 }, { clickText: '💬 Ask the assistant' }, { wait: 2500 }],
    click: 'text:💬 Ask the assistant',
    say: `Inside a deal, the assistant doesn't act on the record on its own initiative. It proposes a concrete
      next step as a chip, and a person presses Apply. That write is then governed by the caller's own role,
      server-side, exactly as if a human had typed it directly. The assistant can't use its own reach to bypass
      the access model it operates inside.`,
  },
  {
    id: 'tc-10-audit',
    act: 104,
    title: 'Every applied change is a named, timestamped entry',
    seat: 'partner',
    keepBanner: true,
    steps: [{ clickText: 'Audit trail' }, { wait: 2500 }],
    click: 'text:Audit trail',
    say: `The deal's audit trail records who did what and when, on every mutating action, including a badge
      reading "via assistant, you approved" on anything the assistant proposed and a person applied. There's no
      unattributed write anywhere in this platform. A compliance or security review asking "can we reconstruct who
      changed what" gets an answer that already exists, not a feature request.`,
  },

  // ─── Act 105 · Azure footprint and network boundary ──────────────────────────
  {
    id: 'tc-11-architecture',
    act: 105,
    title: 'Six resource groups, no secrets in the path',
    seat: 'admin',
    steps: [{ closeOverlay: true }, { scrollTop: 0 }],
    say: `The deployed footprint is subscription-scoped Bicep, split into six resource groups: app, ai, data,
      integration, core and network, so each domain can be governed and costed on its own. Every Azure-to-Azure
      call in this platform is authorised by one user-assigned managed identity and an RBAC role assignment scoped
      to exactly the resource it touches. There's no connection string, no API key and no secret anywhere in the
      running application or in this repository. The architecture diagrams in the documentation trace every one
      of those hops and colour-code exactly which lines carry identity rather than traffic.`,
  },
  {
    id: 'tc-12-network',
    act: 105,
    title: 'The data plane can leave the public internet entirely',
    seat: 'admin',
    steps: [{ wait: 500 }],
    say: `Private networking is one switch, not a re-architecture. Turn it on and the storage account and Cosmos
      DB sit behind private endpoints inside a virtual network, public network access is disabled, and private DNS
      resolves the lookups. The data plane never touches the public internet at all. It's off by default so a
      lean pilot deploys in minutes, and a security review can turn it on before anything production-grade goes
      live.`,
  },

  // ─── Act 106 · Deploy, extend, jumpstart ─────────────────────────────────────
  {
    id: 'tc-13-deploy',
    act: 106,
    title: 'One command, your tenant, your data from day one',
    seat: 'admin',
    steps: [{ wait: 500 }],
    say: `Standing this up is one command, azd up, against your own subscription. A demo deployment seeds an
      invented showcase book so the product is usable immediately. A customer jumpstart deployment turns that
      seeding off with a single flag, so the store boots empty and gets populated only by the firm's own
      connectors, the same CRM connector shown a moment ago among them. Nothing fake ever has to touch a real
      firm's Cosmos account.`,
  },
  {
    id: 'tc-14-close',
    act: 106,
    title: 'Built on what you already run',
    seat: 'admin',
    steps: [{ wait: 500 }],
    say: `Every identity decision runs through Entra ID you already operate. Every document lives in SharePoint
      you already govern. Every conversation is a Teams channel you already retain. There's no new identity
      system, no new document store and no new retention policy to reconcile with the ones this firm already has.
      The platform is additive to a Microsoft 365 and Azure estate you already run, not a parallel one to secure
      separately.`,
  },
];

// Alternative cuts of the walkthrough, assembled from screens already captured.
//
// A cut names scenes from scenes.mjs and gives them their own, tighter narration. No
// browser is involved: build-cut.mjs borrows the screenshots the walkthrough already took,
// so a cut costs a Speech call per line and nothing else. That reuse is a real trade-off —
// a cut inherits the framing and pacing of a screen shot for the 30-minute story, cursor
// included, which is why the lightning deck (docs/demos/DEMO-LIGHTNING.md) moved to its own
// standalone manifest, scenes-lightning.mjs, instead of living here. Keep this file for cuts
// that are genuinely fine reusing the walkthrough's frames, like the runbook below.
//
//   node demo/build-cut.mjs runbook
//   node demo/narrate.mjs      --manifest scenes-runbook.json
//   node demo/build-player.mjs --manifest scenes-runbook.json --out runbook.html
//   node demo/build-video.mjs  --manifest scenes-runbook.json --out runbook.mp4

export const CUTS = {
  // docs/demos/DEMO-RUNBOOK.md — the delivery team's spine. Opens on access rather than
  // closing on it, and covers four things the walkthrough never visits.
  runbook: {
    title: 'Demo runbook',
    source: 'docs/demos/DEMO-RUNBOOK.md',
    sources: ['scenes.json', 'scenes-runbook-raw.json'],
    acts: [
      { n: 1, title: 'The pitch' },
      { n: 2, title: 'Identity-aware access — the differentiator' },
      { n: 3, title: 'The full deal lifecycle' },
      { n: 4, title: 'A deal, end to end' },
      { n: 5, title: 'Work the deal together' },
      { n: 6, title: 'Fund & portfolio — monitor what you own' },
      { n: 7, title: 'Talk to the specialists' },
      { n: 8, title: 'Reporting, sources and documents' },
      { n: 9, title: 'Close' },
    ],
    scenes: [
      {
        use: '00-open', act: 1, title: 'The pitch',
        say: `The Deal Room runs a private equity deal end to end, on the Microsoft tools the firm already pays for.
          Almost everything here is an invented demonstration book, apart from a handful of real public companies the
          screener picked up from public filings. Thirty seconds on what it is, then straight into the thing that sells
          it: access.`,
      },
      {
        use: '22-seat-partner', act: 2, title: 'Start where it is strongest',
        say: `Signed in as the partner, the list reads twenty-four of twenty-four, which is everything this seat is
          cleared for.`,
      },
      {
        use: '23-seat-analyst', act: 2, title: 'The analyst sees eight',
        say: `An analyst covering the Northeast sees a different world: twenty-four becomes eight, and the filters
          change with it, one in origination, four in diligence, three in execution, with no Value and Exit at all,
          because he has no deal in that stage. The filters describe his world rather than the fund's.`,
      },
      {
        use: '23b-seat-analyst-locked', act: 2, title: 'It says what it is holding back',
        say: `And a deal he is not cleared for still appears, under status only: named, and where it stands, with no
          valuation and no documents. The restricted detail is never sent to the browser at all. Not a display setting —
          there is nothing to inspect and nothing to switch back on.`,
      },
      {
        use: '24-seat-analyst-onyx', act: 2, title: 'A name beats a rank',
        say: `Project Onyx, a confidential carve-out under a clean-team protocol, still opens in full for that same
          analyst, because he is named on it.`,
      },
      {
        use: '26-seat-admin-refused', act: 2, title: 'The administrator is refused',
        say: `The administrator, by contrast, holds twenty-one deals to the partner's twenty-four, and opening that
          same deal's own link directly gets the answer deal unavailable: either it does not exist, or the signed-in
          seat is not on its deal team. It refuses without ever confirming which is true, because on an unannounced
          take-private, the mere fact that there is something worth asking about is itself the leak, which is the
          part a compliance officer in the room would care about most.`,
      },
      {
        use: '12-deals-list', act: 3, title: 'The whole funnel, one row per deal',
        say: `The lifecycle. One row per deal: IC-ready or not, where it is in the sixteen steps, what is holding it up,
          the size and the committee date. Six filters, each with its count, from origination through to value and exit.`,
      },
      {
        use: '08-home-stages', act: 3, title: 'Sourcing through to exit',
        say: `And the same pipeline by phase — origination and screening, diligence and approval, execution and closing,
          value and exit. One platform from a first look to owning the company.`,
      },
      {
        use: '13-deal-brief', act: 4, title: 'Where to start',
        say: `Inside a deal. Five pages in the same order every time, and above them one line telling you where to start
          and what to do about it.`,
      },
      {
        use: '14-deal-case', act: 4, title: 'The readiness board is the record',
        say: `The case: past the IC decision, two obligations still outstanding, and the readiness board beside it lists
          them. That board is what decides whether the committee papers are complete.`,
      },
      {
        use: '15-deal-work', act: 4, title: 'Honest about a records gap',
        say: `The work. One behind, and two lanes closed at IC with no write-up on file. Signed off at committee with
          nothing written up afterwards — a records gap, not outstanding work, and the product says so rather than
          hiding it.`,
      },
      {
        use: '16-deal-dataroom', act: 4, title: 'Your SharePoint, opened from here',
        say: `And the data room: numbered folders, the named adviser on each workstream, the playbook templates. Not a
          copy — your SharePoint, opened from here. Nothing was migrated.`,
      },
      { use: 'rb-notifications', act: 5, title: 'What landed on me' },
      { use: 'rb-channel', act: 5, title: 'The conversation lives in the deal' },
      { use: 'rb-assistant-apply', act: 5, title: 'It proposes; a person approves' },
      { use: 'rb-audit', act: 5, title: 'Who did what, when' },
      {
        use: '18-fund-capital', act: 6, title: 'The fund',
        say: `Past IC, where most tools stop. Committed capital, deployed, dry powder, and the returns — TVPI, DPI, RVPI,
          gross and net multiple and IRR, each with a note on how it was worked out.`,
      },
      {
        use: '19-fund-monitoring', act: 6, title: 'The companies you own',
        say: `Portfolio monitoring: hold period, entry against current valuation, multiple, IRR, progress through the
          value creation plan, and an honest on-track, watch or underperform. The watchlist ranks what is deteriorating
          with the KPI driving it. The deal did not end at IC — it became a company you own.`,
      },
      {
        use: '20-fund-concentration', act: 6, title: 'Compliance by design',
        say: `And concentration against the hard caps in your own LPA. Sector and single-position exposure, measured
          against the mandate. That is the panel that ends a conversation with an LP before it starts.`,
      },
      { use: 'rb-specialists', act: 7, title: 'One assistant, the whole deal team' },
      {
        use: '21-report', act: 8, title: 'Reporting, and what it declares',
        say: `Firm reporting is a first-class part of the console, serving the fund's real Power BI report embedded for
          signed-in users. The header prints its own certification and names who signed it. Uncertified, it says draft
          on every page. And it states market data: not connected — declaring its own limits on the document you would
          send out.`,
      },
      { use: 'rb-sources', act: 8, title: 'Files, chats and email' },
      { use: 'rb-papers', act: 8, title: 'A finished first draft' },
      { use: 'rb-templates', act: 8, title: 'Your firm\u2019s paper' },
      {
        use: '28-close', act: 9, title: 'Close',
        say: `One place to run a deal, inside the tools your team already uses. Every number tells you where it came
          from, each person sees only what their role permits, and the deal material never leaves your tenant. Then ask
          for something — a working session with the deal team, or a conversation about loading their own deals.`,
      },
    ],
  },

  // docs/demos/DEMO-RUNBOOK-TECHNICAL.md — the delivery team's spine for an IT/security
  // audience. Reuses frames from scenes-technical.json (no fresh capture), denser and more
  // implementation-facing than the technical walkthrough, comfortable naming env vars and
  // API routes the walkthrough never mentions.
  'runbook-technical': {
    title: 'Demo runbook — technical audience',
    source: 'docs/demos/DEMO-RUNBOOK-TECHNICAL.md',
    sources: ['scenes-technical.json'],
    acts: [
      { n: 1, title: 'The pitch' },
      { n: 2, title: 'Identity trust seam' },
      { n: 3, title: 'Agent isolation, and agentic workflows' },
      { n: 4, title: 'Connector governance, and Work IQ' },
      { n: 5, title: 'Audit and approve-to-apply' },
      { n: 6, title: 'Azure footprint and network boundary' },
      { n: 7, title: 'Deploy and jumpstart' },
    ],
    scenes: [
      {
        use: 'tc-00-open', act: 1, title: 'One tenant, one backend, no keys',
        say: `Single-tenant deploy, your Azure subscription, your Entra directory. Not multi-tenant SaaS. Thirty
          seconds on the shape of it, then straight into identity, agentic workflows, connector governance and
          Work IQ, audit, and the footprint. Those are the things an architecture or security review actually
          asks about.`,
      },
      { use: 'tc-02-seat-switch', act: 2, title: 'Resolved server-side, not filtered in the browser' },
      { use: 'tc-03-seat-analyst', act: 2, title: 'Same route, same code, a narrower result set' },
      {
        use: 'tc-04-restricted-deal', act: 2, title: 'Not a display rule',
        say: `Confirm this live if asked: open the browser network tab on a restricted deal and there's nothing
          to find. The record was never sent. That's the difference between filtering in the client and
          authorising on the server, and it's worth pausing on for this audience specifically.`,
      },
      { use: 'tc-05-assistant-scope', act: 3, title: 'Registry-set agent class, checked every tool call' },
      {
        use: 'tc-05b-agentic', act: 3, title: 'purposeAgent.js — route, consult, compose',
        say: `Gated by ORCHESTRATION=purpose in app/lib/purposeAgent.js: the Deal Orchestrator routes a request
          to at most a couple of stage specialists, consults them in parallel, and composes one grounded answer
          that names who it consulted. It falls back to the single-agent chat automatically if unset. Point out
          that the routing is a fixed decision tree the model can't override — the differentiator against "one
          big prompt with tools bolted on."`,
      },
      { use: 'tc-06-datasources', act: 4, title: 'A real round trip, or an honest failure, never a static badge' },
      {
        use: 'tc-06b-workiq', act: 4, title: 'Work IQ — app/lib/m365/workIqGraph.js',
        say: `Work IQ backs four governed tools, search_files, read_channel_messages, search_mail and search,
          over Microsoft Graph. Delegated first: the Teams SSO token gets exchanged On-Behalf-Of, so reads run as
          the signed-in user and Microsoft 365 enforces their own file and mailbox permissions. App-only client
          credentials are the fallback for background agent work, and that path is read-only by design. Same MCP
          surface is exposed to Copilot and Copilot Studio via lib/mcp/workiqServer.js.`,
      },
      { use: 'tc-07-connector-approval', act: 4, title: 'Pending until an administrator approves it (advisor SC-5)' },
      {
        use: 'tc-08-crm-connector', act: 4, title: 'The CRM connector, same governance',
        say: `The system-of-record connector: POST to /api/connectors with kind sor, admin-gated end to end.
          Register, configure, enable and remove all require the administrator role server-side, not just in the
          UI. Pull is matched on connector id plus native record id, never on name. Push happens automatically the
          moment a deal crosses an IC gate, fired without being awaited on the decision path, so an unreachable
          CRM can never block or duplicate a decision already recorded here.`,
      },
      { use: 'tc-09-apply', act: 5, title: 'Approve-to-apply — the AI can\u2019t bypass its own access model' },
      {
        use: 'tc-10-audit', act: 5, title: 'GET /api/deals/:id/activity',
        say: `Every mutating action and every assistant-applied change writes a named, timestamped entry here.
          The "via assistant, you approved" badge is what a compliance reviewer will ask to see reproduced.`,
      },
      {
        use: 'tc-11-architecture', act: 6, title: 'Six resource groups, managed identity end to end',
        say: `Point at the architecture docs here if the room wants the diagrams: app, ai, data, integration,
          core, network, six Bicep resource groups, each Azure-to-Azure call authorised by one user-assigned
          managed identity and a scoped RBAC role assignment. No connection string or key anywhere in the path.`,
      },
      {
        use: 'tc-12-network', act: 6, title: 'enablePrivateEndpoints — one switch',
        say: `Off by default for a lean pilot. On, the storage account and Cosmos DB sit behind private endpoints
          in a VNet, public network access is disabled, and private DNS resolves the lookups. The data plane never
          touches the public internet.`,
      },
      {
        use: 'tc-13-deploy', act: 7, title: 'azd up, and SEED_DEMO_DATA=false for a real deployment',
        say: `One command against the target subscription. A demo deploy seeds the invented showcase book; a
          customer jumpstart sets seedDemoData to false before the first deploy, so the store boots empty and
          gets populated only through real connectors. Nothing fake ever reaches a real firm's Cosmos account.`,
      },
      { use: 'tc-14-close', act: 7, title: 'Additive to an estate you already secure' },
    ],
  },

  // docs/demos/DEMO-RUNBOOK-BUSINESS.md — the delivery team's spine for a CEO/CFO/Managing
  // Partner/Managing Director audience. Reuses frames from scenes-business.json.
  'runbook-business': {
    title: 'Demo runbook — business audience',
    source: 'docs/demos/DEMO-RUNBOOK-BUSINESS.md',
    sources: ['scenes-business.json'],
    acts: [
      { n: 1, title: 'The pitch' },
      { n: 2, title: 'The day starts triaged' },
      { n: 3, title: 'Screening at scale' },
      { n: 4, title: 'The blank page is gone' },
      { n: 5, title: 'Nothing forgotten' },
      { n: 6, title: 'One system, source to exit' },
      { n: 7, title: 'Reporting without the scramble' },
      { n: 8, title: 'Close — why, not just what' },
    ],
    scenes: [
      {
        use: 'bc-00-open', act: 1, title: 'The cost this replaces is hours, not software',
        say: `Thirty seconds on the frame, then straight into the seven places this removes a manual task: ease
          of use, the morning briefing, deal flow, drafting, follow-up tracking, fund monitoring and reporting.
          Every saving named here is a specific task removed, not a percentage.`,
      },
      { use: 'bc-00b-easeofuse', act: 1, title: 'Ease of use: it\u2019s Teams, not a new portal' },
      { use: 'bc-01-briefing', act: 2, title: 'A briefing nobody compiled by hand' },
      { use: 'bc-02-needs-attention', act: 2, title: 'The list that used to take a Monday call' },
      { use: 'bc-03-sourcing', act: 3, title: 'Deal flow: screening that doesn\u2019t scale with headcount' },
      { use: 'bc-04-open-deal', act: 4, title: 'A finished first draft, not a blank page' },
      { use: 'bc-05-readiness', act: 4, title: 'A verdict instead of a status meeting' },
      { use: 'bc-06-follow-ups', act: 5, title: 'The commitments nobody wrote down' },
      { use: 'bc-07-fund', act: 6, title: 'The deal didn\u2019t end at the signature' },
      {
        use: 'bc-08-crm', act: 6, title: 'No double entry against your CRM',
        say: `If the firm already runs a CRM or deal database for pipeline, this is the one integration question
          worth a full stop on: existing deals pull in once, matched on the CRM's own record id, and every
          investment-committee decision pushes back out automatically the moment it's made. Nobody re-keys a
          decision into a second system after the fact.`,
      },
      { use: 'bc-09-report', act: 7, title: 'Investor-ready, not an end-of-quarter scramble' },
      { use: 'bc-10-close', act: 8, title: 'Why this, not just what it does' },
    ],
  },
};


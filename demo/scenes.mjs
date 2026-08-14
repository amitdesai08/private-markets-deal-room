// The demo, as data.
//
// One entry per scene: what the browser should do, and what the narrator says over the
// result. This file is the single source of truth — capture.mjs drives it, narrate.mjs
// voices it, build-player.mjs assembles it. Change the demo here and nowhere else.
//
// The narration follows docs/demos/DEMO-WALKTHROUGH.md act for act. Where the walkthrough
// gives the presenter a line in quotation marks, that line is used close to verbatim: it
// has already been tested on real audiences and it is better than anything invented here.
//
// `steps` are executed in order before the screenshot is taken. `spotlight` names the
// element the player should draw attention to; `click` names the control the cursor
// should be seen pressing on the way to the next scene.

// The real Deal Room, not the beta host — the beta database has different seed data
// (different deal counts per seat), so a capture against it prints numbers that don't
// match the docs or a live demo of the real deployment.
export const BASE = process.env.DEMO_BASE_URL
  || 'https://ca-dealhub-teams-dev-swc.ambitiousforest-08192d93.swedencentral.azurecontainerapps.io';

export const ACTS = [
  { n: 0, title: 'Opening' },
  { n: 1, title: 'Home — what needs you today' },
  { n: 2, title: 'Sourcing & screening — before it is a deal' },
  { n: 3, title: 'All deals — the list' },
  { n: 4, title: 'Inside a deal' },
  { n: 5, title: 'Fund & Portfolio — the money' },
  { n: 6, title: 'Firm reporting — what you would send an investor' },
  { n: 7, title: 'Different people, different views' },
  { n: 8, title: 'Where the data comes from' },
];

export const SCENES = [
  // ─── Opening ────────────────────────────────────────────────────────────────
  {
    id: '00-open',
    act: 0,
    title: 'The Deal Room',
    seat: 'partner',
    steps: [{ goto: '#/overview' }, { waitText: 'Daily briefing' }, { scrollTop: 0 }],
    say: `This is the Deal Room — one place to run a private equity deal. It's built on Microsoft 365, Teams and
      Entra ID, the tools a firm already runs and trusts. Almost everything here comes from an invented
      demonstration book: invented companies, invented people, invented numbers, nothing confidential anywhere.
      A handful of real public companies do show up, because the screener picked them up from public filings that
      are already public. We're signed in as Eleanor Shellstrop, a partner and the chair of the investment
      committee.`,
  },
  {
    id: '01-layout',
    act: 0,
    title: 'Five tabs, and that is the whole product',
    seat: 'partner',
    steps: [{ scrollTop: 0 }],
    spotlight: 'nav.maintabs',
    say: `The whole product is five tabs. That's it — there's nothing else to find. Home shows what needs
      attention today. Sourcing and screening covers companies we're looking at but haven't committed to. All deals
      covers the deals actually underway. Fund and Portfolio covers the money, and Firm reporting covers the numbers
      that would go to an investor. Because there are only five tabs, pressing any one of them always brings you back
      to familiar ground.`,
    click: 'nav.maintabs',
  },

  // ─── Act 1 · Home ───────────────────────────────────────────────────────────
  {
    id: '02-home-figures',
    act: 1,
    title: 'The four figures',
    seat: 'partner',
    steps: [{ goto: '#/overview' }, { waitText: 'Daily briefing' }, { scrollTop: 0 }],
    spotlight: 'text:Ready for IC',
    say: `Four figures greet whoever's signed in, chosen for that person's job. For a committee chair they're ready
      for IC, not yet IC-ready, deals with a condition still open, and the date of the next committee. Each figure has
      a line underneath explaining exactly what it counts. Conditions open is its own figure because those deals are
      already approved — something attached to the approval just hasn't cleared yet. Together, these are the four
      things a committee chair actually wants to know on a Monday morning.`,
  },
  {
    id: '03-home-briefing',
    act: 1,
    title: 'The daily briefing',
    seat: 'partner',
    steps: [{ scrollTo: 'Daily briefing' }],
    spotlight: 'text:Daily briefing',
    say: `Then comes the daily briefing. The first thing on the page isn't a chart — it's somebody telling you what
      happened, written in full sentences for whoever's signed in. A partner and an analyst read different briefings
      from the very same record. See the small badge in the corner? It says Composed, meaning the platform assembled
      these sentences from the record using a fixed template. No person typed it and no AI wrote it, so it can never
      change a deal's status. Where a badge says AI instead, a language model has actually read the record and
      drafted the prose itself. The two badges tell the reader which kind of writing they're looking at.`,
  },
  {
    id: '04-home-evidence',
    act: 1,
    title: 'Every sentence shows its working',
    seat: 'partner',
    steps: [{ scrollTo: 'Daily briefing' }, { clickText: '🔍 Evidence' }, { wait: 1800 }],
    spotlight: 'text:Daily briefing',
    say: `Every numbered claim in that briefing shows its own working. Press Evidence, and each sentence opens back
      to the deal, the workstream, or the filing it came from \u2014 nobody has to take it on faith.`,
    click: 'text:🔍 Evidence',
  },
  {
    id: '05-home-attention',
    act: 1,
    title: 'What needs my attention',
    seat: 'partner',
    steps: [{ clickText: '🔍 Evidence' }, { scrollTo: 'What needs my attention' }],
    spotlight: 'text:What needs my attention',
    say: `Below the briefing sits a queue, ordered by whichever committee is soonest. Each row names the deal, says
      what's wrong with it, and carries a button straight to the place where that gets fixed. It behaves less like a
      notification and more like a route into the work itself.`,
  },
  {
    id: '06-home-agenda',
    act: 1,
    title: 'The next IC agenda',
    seat: 'partner',
    steps: [{ scrollTo: 'Next IC agenda' }],
    spotlight: 'text:Next IC agenda',
    say: `Next comes what the committee is actually being asked to decide, in order, with what each deal still owes
      spelled out beside it. There's a Copy agenda button right next to it, because somebody still has to send that
      email on Sunday night.`,
  },
  {
    id: '07-home-followups',
    act: 1,
    title: 'Untracked follow-ups',
    seat: 'partner',
    steps: [{ scrollTo: 'Untracked follow-ups' }],
    spotlight: 'text:Untracked follow-ups',
    say: `This is the panel people tend to remember. Somebody promised something in a Teams channel and nobody wrote
      it down. The product found twenty-two such promises across nineteen deals, each quoted word for word along with
      who said it and by when. It doesn't chase these commitments down — it just surfaces that they exist, which is a
      problem every firm recognizes and few can normally even see.`,
  },
  {
    id: '08-home-stages',
    act: 1,
    title: 'Deals by stage',
    seat: 'partner',
    steps: [{ scrollTo: 'Deals by stage' }],
    spotlight: 'text:Deals by stage',
    say: `Four blocks follow: origination and screening, diligence and approval, execution and closing, and value
      and exit. The header states the total capital and the pre-completion split, and the four blocks add up to
      exactly that figure. Select a block, and it filters straight down to those deals.`,
  },
  {
    id: '09-home-market',
    act: 1,
    title: 'Where the problems have historically been',
    seat: 'partner',
    steps: [{ scrollTo: 'Market intelligence' }],
    spotlight: 'text:Market intelligence',
    say: `At the bottom sits market intelligence: comparable deals, committee voting precedents with the vote
      recorded on each, and the most telling of the three — findings raised in past diligences across closed deals,
      broken out by workstream. Commercial and financial run well ahead of the rest. That's a record of where
      problems have historically turned up, and it turns diligence planning from a guess into something closer to
      knowledge.`,
  },

  // ─── Act 2 · Sourcing & screening ───────────────────────────────────────────
  {
    id: '10-sourcing-pipeline',
    act: 2,
    title: 'Deals in origination',
    seat: 'partner',
    steps: [{ clickText: 'Sourcing & screening' }, { wait: 2500 }, { scrollTop: 0 }],
    say: `Sourcing and screening covers everything looked at before the fund commits. At the top sit four deals in
      origination, each card carrying its size, its sector, which of the sixteen steps it's reached, and how ready
      it is for committee. Any of them opens on selection. Below that, a funnel counts where deals have got to — it's
      a counter, not a filter, so it doesn't respond to a click.`,
    click: 'text:Sourcing & screening',
  },
  {
    id: '11-sourcing-framework',
    act: 2,
    title: 'A mandate is not a theme',
    seat: 'partner',
    steps: [{ clickText: 'Sourcing framework' }, { wait: 2200 }, { scrollTop: 0 }],
    say: `This next part carries the most private-equity judgement in the whole product, across two panels. The
      fund mandate is a hard box: the binding limits written into the fund's own agreement with its investors,
      covering fund size, enterprise value range and geography. A company outside that mandate gets excluded and
      never scored, because it could never be bought no matter how well it ranks. Investment themes work
      differently — three of them appear here, each owned by a named partner with a thesis and a reason the timing is
      right now. A mandate and a theme aren't the same thing, and confusing them is how a fund spends a quarter
      chasing something it was never permitted to buy. One's a rule set by investors. The other's a partner's own
      judgement.`,
    click: 'text:Sourcing framework',
  },

  // ─── Act 3 · All deals ──────────────────────────────────────────────────────
  {
    id: '12-deals-list',
    act: 3,
    title: 'Twenty-four of twenty-four',
    seat: 'partner',
    steps: [{ clickText: 'All deals' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `All deals lists one row per deal: whether it's IC-ready, the company, where it sits among the sixteen
      steps, what's holding it up, its size and its committee date. The header reads twenty-four of twenty-four —
      that's everything this seat is allowed to see, including the deals still in screening. Six filters across the
      top each carry their own count. That number, twenty-four, matters again later, when a different seat sees a
      very different figure.`,
    click: 'text:All deals',
  },

  // ─── Act 4 · Inside a deal ──────────────────────────────────────────────────
  {
    id: '13-deal-brief',
    act: 4,
    title: 'It tells you where to start',
    seat: 'partner',
    steps: [{ openDeal: 'Helvetia' }, { wait: 4000 }, { scrollTop: 0 }],
    say: `Opening Helvetia Diagnostics shows the shape every deal takes: five pages in the same order every time,
      covering where the deal stands, the case for it, the work underway, the numbers, and the paperwork. Above those
      pages sits a single line stating where to start, the urgency behind it, and a button leading straight there.
      Below that sits the brief itself, drafted by a model from this deal's own record.`,
    click: 'text:Helvetia',
  },
  {
    id: '14-deal-case',
    act: 4,
    title: 'The case, and what it still owes',
    seat: 'partner',
    steps: [{ clickText: 'The case' }, { wait: 2500 }, { scrollTop: 0 }],
    say: `The case page opens on the recommendation. This deal is past its IC decision, with two obligations still
      outstanding. Beside the recommendation sits the readiness board — that's the actual record of whether the
      committee papers are complete and, if not, exactly what's missing.`,
    click: 'text:The case',
  },
  {
    id: '15-deal-work',
    act: 4,
    title: 'A records gap, not outstanding work',
    seat: 'partner',
    steps: [{ clickText: 'The work' }, { wait: 3000 }, { scrollTo: 'Workstreams' }],
    say: `The work page covers the plan, all sixteen steps, and the workstreams beneath it: financial, legal, tax,
      commercial, ESG and the rest. Its header states the position honestly — one workstream behind — and two lanes
      read closed at IC with no write-up on file. That's not a fault the software is hiding. It's telling a partner
      that two workstreams were signed off at committee with nothing ever written up afterward. That's a records
      gap, not outstanding work, and knowing the difference is most of the job.`,
    click: 'text:The work',
  },
  {
    id: '16-deal-dataroom',
    act: 4,
    title: 'Your data room, not a copy of it',
    seat: 'partner',
    steps: [{ scrollTo: 'Data room' }],
    say: `Further down the same page sits the data room: fourteen numbered folders, the named adviser on each
      workstream, and the playbook templates. This isn't a copy of a firm's data room — it's that data room, live in
      SharePoint, simply opened from here. Nothing was migrated, and nothing ever left the tenant.`,
  },
  {
    id: '17-deal-assistant',
    act: 4,
    title: 'The assistant drafts; the board decides',
    seat: 'partner',
    steps: [{ clickText: '💬 Ask the assistant' }, { wait: 2500 }],
    say: `Asking the assistant what's still outstanding before this deal can close brings up an answer drawn
      entirely from this deal's own record, with its sources shown. A Focus box at the top of the chat is set to this
      deal, so a question about a different one gets declined rather than answered. The assistant can roam, but only
      inside whatever a role permits. The actual record of what's outstanding still lives on the readiness board —
      the assistant drafts, the board decides. It can't move a deal forward, change a status, approve anything, or
      send anything. Where it proposes an action, a named person has to press apply, and the audit trail records who
      did that and when.`,
  },

  // ─── Act 5 · Fund & Portfolio ───────────────────────────────────────────────
  {
    id: '18-fund-capital',
    act: 5,
    title: 'The fund',
    seat: 'partner',
    steps: [{ closeOverlay: true }, { clickText: 'Fund & Portfolio' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Fund and Portfolio covers the money itself: committed capital, capital invested, dry powder, and the
      returns — TVPI, DPI, RVPI, gross and net multiple, gross and net IRR. Every one of those figures carries a
      note explaining how it was worked out.`,
    click: 'text:Fund & Portfolio',
  },
  {
    id: '19-fund-monitoring',
    act: 5,
    title: 'The companies you already own',
    seat: 'partner',
    steps: [{ scrollTo: 'Portfolio monitoring' }],
    say: `A watchlist names whatever's going the wrong way, each entry paired with the one KPI that's off plan.
      Portfolio monitoring follows, covering every company the fund already owns, with hold period, entry versus
      current valuation, EBITDA, multiple, IRR, and progress through the value creation plan. A line beneath that
      header names any deal that's completed but hasn't yet reached portfolio reporting, and says plainly that its
      value sits outside the figures above it. Six companies here against three completed deals under All deals is a
      gap somebody would otherwise have to notice for themselves.`,
  },
  {
    id: '20-fund-concentration',
    act: 5,
    title: 'Concentration against LPA limits',
    seat: 'partner',
    steps: [{ scrollTo: 'Concentration' }],
    say: `Concentration against LPA limits follows: sector and single-position exposure measured directly against
      the caps written into the fund's own agreement, the kind of panel that settles a conversation with an LP before
      it ever gets started.`,
  },

  // ─── Act 6 · Firm reporting ─────────────────────────────────────────────────
  {
    id: '21-report',
    act: 6,
    title: 'Nothing goes out uncertified',
    seat: 'partner',
    steps: [{ clickText: 'Firm reporting' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Firm reporting carries every figure alongside its source, its as-of date, and how it was worked out. The
      report itself is built in Power BI, the same reporting tool a finance team already uses, embedded directly
      here — so it prints, it travels, and analysts can already drive it. Its header prints its own certification,
      naming the partner who signed it and the date, with every earlier snapshot still listed beneath. An uncertified
      report says draft in writing on every page, and offers a certify button that only a partner or administrator
      can press. Nothing reaches an investor until a named person presses that button, and pressing it freezes a
      dated copy that can't be edited afterward. That same header states market data not connected — the product
      declaring, on the very document being sent out, which of its inputs aren't live. That might be the single most
      credible line on the screen.`,
    click: 'text:Firm reporting',
  },

  // ─── Act 7 · Different people, different views ──────────────────────────────
  {
    id: '22-seat-partner',
    act: 7,
    title: 'The partner sees twenty-four',
    seat: 'partner',
    keepBanner: true,
    steps: [{ clickText: 'All deals' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Still signed in as the partner, the list reads twenty-four of twenty-four. What happens next, when a
      different person sits down in the same seat, is where access stops being a setting and starts being real.`,
    click: 'select.viewas',
  },
  {
    id: '23-seat-analyst',
    act: 7,
    title: 'The analyst sees eight',
    seat: 'analyst',
    keepBanner: true,
    steps: [{ selectSeat: 'analyst' }, { wait: 4000 }, { clickText: 'All deals' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Chidi Anagonye is an analyst covering the Northeast, and under his seat, All deals drops from twenty-four
      to eight. The filters change to match: one in origination, four in diligence, three in execution. Value and
      Exit disappears entirely, because he has no deal in that stage. The filters describe his own world rather than
      the fund's — the daily briefing gets rewritten for his job, and the four figures on Home change to a different
      set, chosen for what an analyst actually needs to track.`,
  },
  {
    id: '23b-seat-analyst-locked',
    act: 7,
    title: 'Status only, and honest about it',
    seat: 'analyst',
    keepBanner: true,
    steps: [{ scrollTo: 'Status only' }],
    say: `Further down, a deal he's not cleared for still appears, under a status-only heading: Harborlight Marine
      Services, locked, because he's not on that deal team. It shows up by name and by where it stands, with no
      valuation, no diligence, and no documents attached — honest that the deal exists rather than pretending
      otherwise. That restriction isn't a display setting either. The underlying detail never reaches the screen at
      all; it's never sent to the browser in the first place, so there's nothing to inspect and nothing that could
      be switched back on.`,
  },
  {
    id: '24-seat-analyst-onyx',
    act: 7,
    title: 'A name beats a rank',
    seat: 'analyst',
    keepBanner: true,
    steps: [{ goto: '#/deals' }, { wait: 3000 }, { openDeal: 'Onyx' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Staying on the analyst's seat, Project Onyx, a confidential carve-out running under a clean-team
      protocol, opens in full, because he is one of the people named on it.`,
    click: 'text:Onyx',
  },
  {
    id: '25-seat-admin',
    act: 7,
    title: 'The administrator sees twenty-one',
    seat: 'admin',
    keepBanner: true,
    steps: [{ selectSeat: 'admin' }, { wait: 4000 }, { clickText: 'All deals' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Switching next to Michael Realman, the administrator and the most senior seat in the switcher, that same
      deal is nowhere to be found. His list holds twenty-one deals against the partner's twenty-four, which shows
      that seniority alone buys nothing here.`,
  },
  {
    id: '26-seat-admin-refused',
    act: 7,
    title: 'Refused without confirming it exists',
    seat: 'admin',
    keepBanner: true,
    steps: [{ gotoConfidential: true }, { wait: 4000 }, { scrollTop: 0 }],
    say: `Opening that same deal's own link directly as the administrator, the product answers with deal
      unavailable: either it doesn't exist, or the signed-in seat isn't on its deal team. It refuses without ever
      confirming which is true, because on an unannounced take-private, the mere fact that there's something worth
      asking about is itself the leak. The analyst can open a deal the administrator can't — not because the analyst
      outranks anyone, but because somebody put his name on it. That's what a clean team actually looks like in
      practice, and it's the part a compliance officer would care about most.`,
  },

  // ─── Act 8 · Settings and close ─────────────────────────────────────────────
  {
    id: '27-settings',
    act: 8,
    title: 'You decide what it may look at',
    seat: 'partner',
    steps: [{ selectSeat: 'partner' }, { wait: 3000 }, { clickText: '⚙' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Settings lists every outside source the product may draw on, and any of them can be switched off: company
      filings, news, the legal-entity register, web search. The paid providers further down read not connected,
      since this fund doesn't subscribe to them. It's entirely up to the fund to decide what this platform is
      allowed to look at.`,
    click: 'text:⚙',
  },
  {
    id: '28-close',
    act: 8,
    title: 'The close',
    seat: 'partner',
    steps: [{ clickText: 'Home' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `The deal material itself never leaves a firm's own Microsoft tenant: the data room is its SharePoint, and
      the conversation is its Teams channel, embedded right inside the deal itself rather than a separate tab to go
      find. The mail and calendar are its own too. It's one place to run a deal, built on tools a firm already pays
      for and already trusts, where every number tells you where it came from. From here, the natural next step is a
      working session with a real deal team, to talk through what it would take to
      load their own deals.`,
  },
];

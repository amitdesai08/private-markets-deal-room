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

export const BASE = process.env.DEMO_BASE_URL
  || 'https://ca-dealhub-teams-beta.ambitiousforest-08192d93.swedencentral.azurecontainerapps.io';

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
    say: `This is The Deal Room — one place to run a private equity deal, built on the Microsoft tools a firm already pays for.
      Before anything else, one thing said out loud: everything you are about to see is a demonstration book. Invented companies,
      invented people, invented numbers. Nothing confidential is on screen, and the market and news panels are running on
      demonstration data too. We are signed in as Eleanor Shellstrop, a partner and the chair of the investment committee.`,
  },
  {
    id: '01-layout',
    act: 0,
    title: 'Five tabs, and that is the whole product',
    seat: 'partner',
    steps: [{ scrollTop: 0 }],
    spotlight: 'nav.maintabs',
    say: `The window has three bands and they never move. Along the top, who you are signed in as, and the assistant.
      Below that, five tabs — and this is the entire product; there is nothing else to find. Home is what needs you today.
      Sourcing and screening is what you are looking at but have not committed to. All deals is what you are actually running.
      Fund and Portfolio is the money. Firm reporting is the numbers you would send an investor. If you ever get lost,
      press a tab and you are back somewhere known.`,
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
    say: `Four figures, chosen for whoever is signed in. For a committee chair they are: ready for IC, not IC-ready,
      deals with conditions open, and when the next committee sits. Each one has a line underneath saying exactly what it counts.
      Note that conditions open is separate — those deals are already approved. Something was attached to the approval
      and has not been cleared. Those are the four things a committee chair actually asks on a Monday.`,
  },
  {
    id: '03-home-briefing',
    act: 1,
    title: 'The daily briefing',
    seat: 'partner',
    steps: [{ scrollTo: 'Daily briefing' }],
    spotlight: 'text:Daily briefing',
    say: `Then the daily briefing. The first thing you see is not a chart — it is somebody telling you what happened,
      in sentences, written for the seat you are sitting in. A partner and an analyst get different briefings from the same record.
      Look at the badge: Composed. That means it was assembled from the record by fixed rules. No AI wrote a word of it,
      and it cannot change a deal's status. When a model does write the prose, the badge says AI instead. Say which is which
      before anyone asks — it is the first question every committee has.`,
  },
  {
    id: '04-home-evidence',
    act: 1,
    title: 'Every sentence shows its working',
    seat: 'partner',
    steps: [{ scrollTo: 'Daily briefing' }, { clickText: '🔍 Evidence' }, { wait: 1800 }],
    spotlight: 'text:Daily briefing',
    say: `And every numbered claim in it will show you its working. One press of Evidence, and each sentence opens to the deal,
      the workstream or the filing it came from. Nothing in this product asks you to take its word for anything.`,
    click: 'text:🔍 Evidence',
  },
  {
    id: '05-home-attention',
    act: 1,
    title: 'What needs my attention',
    seat: 'partner',
    steps: [{ clickText: '🔍 Evidence' }, { scrollTo: 'What needs my attention' }],
    spotlight: 'text:What needs my attention',
    say: `Below it, the queue — soonest committee first. Each row says which deal, what is wrong with it,
      and gives you a button straight to the place where you would fix it. Not a notification. A route to the work.`,
  },
  {
    id: '06-home-agenda',
    act: 1,
    title: 'The next IC agenda',
    seat: 'partner',
    steps: [{ scrollTo: 'Next IC agenda' }],
    spotlight: 'text:Next IC agenda',
    say: `Then what the committee is actually being asked to decide, in order, with what each deal still owes spelled out —
      and a Copy agenda button beside it, because somebody has to send that email on Sunday night.`,
  },
  {
    id: '07-home-followups',
    act: 1,
    title: 'Untracked follow-ups',
    seat: 'partner',
    steps: [{ scrollTo: 'Untracked follow-ups' }],
    spotlight: 'text:Untracked follow-ups',
    say: `This is the panel people remember. Somebody promised something in a Teams channel, and nobody wrote it down.
      The product found sixteen of them, across fourteen deals, each one quoted verbatim with who said it and by when.
      It does not chase them for you. It tells you they exist. Every firm in this room has a version of this problem
      and no way of seeing it.`,
  },
  {
    id: '08-home-stages',
    act: 1,
    title: 'Deals by stage',
    seat: 'partner',
    steps: [{ scrollTo: 'Deals by stage' }],
    spotlight: 'text:Deals by stage',
    say: `Four blocks — origination and screening, diligence and approval, execution and closing, value and exit.
      The header gives you the total and the pre-completion split, and the blocks add up to exactly that. Press one
      and you get those deals.`,
  },
  {
    id: '09-home-market',
    act: 1,
    title: 'Where the problems have historically been',
    seat: 'partner',
    steps: [{ scrollTo: 'Market intelligence' }],
    spotlight: 'text:Market intelligence',
    say: `And at the bottom, market intelligence. Comparable deals, committee voting precedents with the vote recorded on each,
      and the one to point at — findings raised in past diligences, across closed deals, by workstream. Commercial eighteen,
      financial fourteen, legal eleven, technology nine, ESG seven. That is where the problems have historically been found.
      It is the difference between guessing where to put the diligence hours and knowing.`,
  },

  // ─── Act 2 · Sourcing & screening ───────────────────────────────────────────
  {
    id: '10-sourcing-pipeline',
    act: 2,
    title: 'Deals in origination',
    seat: 'partner',
    steps: [{ clickText: 'Sourcing & screening' }, { wait: 2500 }, { scrollTop: 0 }],
    say: `Sourcing and screening is everything you look at before the fund commits. At the top, deals in origination —
      four real cards, each with the size, the sector, which of the sixteen steps it has reached and how ready it is
      for committee. Any one of them opens. Below that a funnel counting where deals have got to — read it, do not click it;
      it is a counter, not a filter.`,
    click: 'text:Sourcing & screening',
  },
  {
    id: '11-sourcing-framework',
    act: 2,
    title: 'A mandate is not a theme',
    seat: 'partner',
    steps: [{ clickText: 'Sourcing framework' }, { wait: 2200 }, { scrollTop: 0 }],
    say: `This is the part worth slowing down for. Two panels. The fund mandate is a hard box — the binding limits in the fund's
      own agreement with its investors. Fund size, enterprise value range, geographies. A company outside the mandate is excluded,
      never scored, because you cannot buy it, so there is no point ranking it. Investment themes are a guide. Three of them,
      each owned by a named partner, each with a thesis and a why-now. A mandate and a theme are not the same thing, and confusing
      them is how a fund wastes a quarter on something it was never permitted to buy. One is a rule from your investors.
      The other is a partner's judgement.`,
    click: 'text:Sourcing framework',
  },

  // ─── Act 3 · All deals ──────────────────────────────────────────────────────
  {
    id: '12-deals-list',
    act: 3,
    title: 'Nineteen of nineteen',
    seat: 'partner',
    steps: [{ clickText: 'All deals' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `All deals. One row per deal: whether it is IC-ready, the company, where it is in the sixteen steps, what is holding it up,
      the size and the committee date. The header reads nineteen of nineteen — everything this seat is allowed to see,
      including the four still in screening. Six filters across the top, each with its count. Remember that number, nineteen.
      We are going to come back to it.`,
    click: 'text:All deals',
  },

  // ─── Act 4 · Inside a deal ──────────────────────────────────────────────────
  {
    id: '13-deal-brief',
    act: 4,
    title: 'It tells you where to start',
    seat: 'partner',
    steps: [{ openDeal: 'Helvetia' }, { wait: 4000 }, { scrollTop: 0 }],
    say: `Open one — Helvetia Diagnostics. A deal has five pages, in the same order on every deal, always: where it stands,
      the case for it, the work, the numbers, and the paperwork. And above them, before the brief begins, a single line telling
      you where to start — the urgency, and what to do about it, with a button that takes you there. Below it the brief itself,
      written by a model from this deal's own record, ending with five questions written for this deal that you can press
      instead of typing.`,
    click: 'text:Helvetia',
  },
  {
    id: '14-deal-case',
    act: 4,
    title: 'The case, and what it still owes',
    seat: 'partner',
    steps: [{ clickText: 'The case' }, { wait: 2500 }, { scrollTop: 0 }],
    say: `The case opens on the recommendation — past the IC decision, two obligations still outstanding. Beside it is the
      readiness board, and the board is the record. It is what decides whether the committee papers are complete
      and what is missing.`,
    click: 'text:The case',
  },
  {
    id: '15-deal-work',
    act: 4,
    title: 'A records gap, not outstanding work',
    seat: 'partner',
    steps: [{ clickText: 'The work' }, { wait: 3000 }, { scrollTo: 'Workstreams' }],
    say: `The work. The plan — the sixteen steps — and the workstreams: financial, legal, tax, commercial, ESG and the rest.
      The header states the position honestly: one behind. And two lanes read closed at IC, no write-up on file.
      That is not a fault the software is hiding. It is telling a partner that two workstreams were signed off at committee
      with nothing written up afterwards. That is a records gap, not outstanding work — and knowing the difference
      is the whole job.`,
    click: 'text:The work',
  },
  {
    id: '16-deal-dataroom',
    act: 4,
    title: 'Your data room, not a copy of it',
    seat: 'partner',
    steps: [{ scrollTo: 'Data room' }],
    say: `Scroll down the same page and there is the data room — fourteen numbered folders, the named adviser on each workstream,
      the playbook templates. This is not a copy of your data room. It is your data room, in SharePoint, opened from here.
      Nothing was migrated and nothing left your tenant.`,
  },
  {
    id: '17-deal-assistant',
    act: 4,
    title: 'The assistant drafts; the board decides',
    seat: 'partner',
    steps: [{ clickText: '💬 Ask the assistant' }, { wait: 2500 }],
    say: `Now the assistant. Ask it what is outstanding before we can close. Note the Focus box at the top of the chat:
      it is set to this deal, so the answers come from this deal only — ask about another and it will decline.
      The point is not that it cannot roam. It is that it only ever roams inside what your role permits.
      Everything it says is drawn from this deal's record and it will show you its sources. But the record of what is
      outstanding is the readiness board. The assistant drafts; the board decides. And it cannot move a deal to the next step,
      change a status, approve anything or send anything. Where it proposes an action, a named person presses apply,
      and the audit trail records who and when.`,
  },

  // ─── Act 5 · Fund & Portfolio ───────────────────────────────────────────────
  {
    id: '18-fund-capital',
    act: 5,
    title: 'The fund',
    seat: 'partner',
    steps: [{ closeOverlay: true }, { clickText: 'Fund & Portfolio' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Fund and Portfolio — the money. Committed capital, invested, dry powder, and the returns: TVPI, DPI, RVPI,
      gross and net multiple, gross and net IRR. Every one of them carries a note on how it was worked out.`,
    click: 'text:Fund & Portfolio',
  },
  {
    id: '19-fund-monitoring',
    act: 5,
    title: 'The companies you already own',
    seat: 'partner',
    steps: [{ scrollTo: 'Portfolio monitoring' }],
    say: `The watchlist names what is going the wrong way, each with the one KPI that is off plan. Then portfolio monitoring —
      the companies the fund already owns, with hold period, entry versus current valuation, EBITDA, multiple, IRR and progress
      through the value creation plan. Read the line beneath the header: it names any deal that has completed but is not yet in
      portfolio reporting, and says its value is not in the figures above. Six companies here and three completed deals under
      All deals is a difference somebody will spot — so the product tells you the answer instead of leaving you to work it out.`,
  },
  {
    id: '20-fund-concentration',
    act: 5,
    title: 'Concentration against LPA limits',
    seat: 'partner',
    steps: [{ scrollTo: 'Concentration' }],
    say: `And concentration against LPA limits — sector and single-position exposure measured against the caps written into
      your own fund agreement. That is the panel that ends a conversation with an LP before it starts.`,
  },

  // ─── Act 6 · Firm reporting ─────────────────────────────────────────────────
  {
    id: '21-report',
    act: 6,
    title: 'Nothing goes out uncertified',
    seat: 'partner',
    steps: [{ clickText: 'Firm reporting' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Firm reporting — every figure with its source, its as-of date and how it was worked out. The report is built in Power BI,
      the same reporting tool your finance team already uses, embedded here. So it prints, it travels, and your analysts can
      already drive it. Now look at the header. It prints its own certification, and names the partner who signed it and the date,
      with every superseded snapshot still listed beneath. An uncertified report says draft, on every page, in writing, and offers
      a certify button only a partner or an administrator can press. Nothing reaches an investor until a named person presses it,
      and pressing it freezes a dated copy that cannot then be edited. And the header states market data: not connected —
      the product declaring, on the document you would send out, which of its inputs are not live. That is the single most
      credible thing on the screen.`,
    click: 'text:Firm reporting',
  },

  // ─── Act 7 · Different people, different views ──────────────────────────────
  {
    id: '22-seat-partner',
    act: 7,
    title: 'The partner sees nineteen',
    seat: 'partner',
    keepBanner: true,
    steps: [{ clickText: 'All deals' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `This is the strongest part of the demo. We are still the partner, and the list still reads nineteen of nineteen.
      Now watch what happens when somebody else sits down.`,
    click: 'select.viewas',
  },
  {
    id: '23-seat-analyst',
    act: 7,
    title: 'The analyst sees eight',
    seat: 'analyst',
    keepBanner: true,
    steps: [{ selectSeat: 'analyst' }, { wait: 4000 }, { clickText: 'All deals' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Chidi Anagonye, an analyst covering the Northeast. All deals drops from nineteen to eight, and the filters change
      with it — one in origination, four in diligence, three in execution. Value and Exit is not offered at all, because this
      analyst has no deal in it. The filters describe his world, not the fund's. The daily briefing is rewritten for his job,
      and the four figures on Home become different figures, chosen for what an analyst actually does.`,
  },
  {
    id: '23b-seat-analyst-locked',
    act: 7,
    title: 'Status only, and honest about it',
    seat: 'analyst',
    keepBanner: true,
    steps: [{ scrollTo: 'Status only' }],
    say: `And further down, a deal he is not cleared for still appears — under a status-only heading. Harborlight Marine
      Services, locked: you are not on this deal team. By name and where it stands, with no valuation, no diligence and no
      documents. It is honest that the deal exists rather than pretending it does not. But this is not a display setting.
      The restricted deal never reaches the screen. It is not hidden in the page, it is not sent to the browser.
      There is nothing to inspect and nothing to switch back on.`,
  },
  {
    id: '24-seat-analyst-onyx',
    act: 7,
    title: 'A name beats a rank',
    seat: 'analyst',
    keepBanner: true,
    steps: [{ goto: '#/deals' }, { wait: 3000 }, { openDeal: 'Onyx' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Now stay on the analyst and open Project Onyx — a confidential carve-out running under a clean-team protocol.
      It opens in full. He is named on it.`,
    click: 'text:Onyx',
  },
  {
    id: '25-seat-admin',
    act: 7,
    title: 'The administrator sees sixteen',
    seat: 'admin',
    keepBanner: true,
    steps: [{ selectSeat: 'admin' }, { wait: 4000 }, { clickText: 'All deals' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `And now switch to Michael Realman — the administrator, the most senior seat in the switcher — and look for it.
      It is not there. His list is sixteen deals. The partner's was nineteen. Being the administrator buys you nothing here.`,
  },
  {
    id: '26-seat-admin-refused',
    act: 7,
    title: 'Refused without confirming it exists',
    seat: 'admin',
    keepBanner: true,
    steps: [{ gotoConfidential: true }, { wait: 4000 }, { scrollTop: 0 }],
    say: `Paste the deal's own link into the address bar as the administrator, and the product answers: deal unavailable.
      Either it does not exist, or you are not on its deal team. Read that sentence again. It refuses without confirming
      the deal exists — because on an unannounced take-private, the fact that there is something to ask about is itself the leak.
      The analyst can open a deal the administrator cannot. Not because the analyst outranks anybody, but because somebody
      put his name on it. That is what a clean team is. If there is a compliance officer in the room, this is the part
      they came for.`,
  },

  // ─── Act 8 · Settings and close ─────────────────────────────────────────────
  {
    id: '27-settings',
    act: 8,
    title: 'You decide what it may look at',
    seat: 'partner',
    steps: [{ selectSeat: 'partner' }, { wait: 3000 }, { clickText: '⚙' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Last screen. Settings lists every outside source the product may use, and you can turn any of them off —
      company filings, news, the legal-entity register, web search. The paid providers below read not connected,
      because this fund does not subscribe. You decide what this thing is allowed to look at.`,
    click: 'text:⚙',
  },
  {
    id: '28-close',
    act: 8,
    title: 'The close',
    seat: 'partner',
    steps: [{ clickText: 'Home' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `And the deal material itself never leaves your own Microsoft tenant. The data room is your SharePoint.
      The conversation is your Teams channel. The mail and the calendar are your own. One place to run a deal,
      built on the tools you already pay for and already trust — and every number on it will tell you where it came from.
      The next step is a working session with your deal team, and a conversation about what it would take to load your own deals.`,
  },
];

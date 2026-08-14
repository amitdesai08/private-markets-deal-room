// The lightning demo, captured on its own — not cut down from the walkthrough's screens.
//
// docs/demos/DEMO-LIGHTNING.md runs six beats in ten minutes. It used to be assembled by
// build-cut.mjs from screenshots the 30-minute walkthrough had already taken, which meant
// every frame was cropped and paced for the longer story: a cursor pointing at a control
// that led somewhere the ten-minute cut never visits, a spotlight held a beat too long
// because the walkthrough had more to say about it. Its own manifest, captured fresh:
//
//   node demo/capture.mjs --scenes scenes-lightning.mjs --manifest scenes-lightning.json
//   node demo/narrate.mjs      --manifest scenes-lightning.json
//   node demo/build-player.mjs --manifest scenes-lightning.json --out lightning.html
//   node demo/build-video.mjs  --manifest scenes-lightning.json --out lightning.mp4

export { BASE } from './scenes.mjs';

export const ACTS = [
  { n: 50, title: 'Opening' },
  { n: 51, title: 'Home — everything shows its working' },
  { n: 52, title: 'Sourcing — a mandate is not a theme' },
  { n: 53, title: 'Inside a deal — the numbers agree' },
  { n: 54, title: 'The assistant — grounded and subordinate' },
  { n: 55, title: 'Different people — access is real' },
  { n: 56, title: 'Firm reporting — nothing goes out uncertified' },
];

export const SCENES = [
  {
    id: 'lt-00-open',
    act: 50,
    title: 'The Deal Room in ten minutes',
    seat: 'partner',
    steps: [{ goto: '#/overview' }, { waitText: 'Daily briefing' }, { scrollTop: 0 }],
    say: `The Deal Room — one place to run a private equity deal, built on Microsoft 365, Microsoft Teams and
      Microsoft Entra ID: the tools your firm already runs, and already trusts. Almost everything here is an invented
      demonstration book — invented companies, invented people, invented numbers. The exception is a handful of real
      public companies the screener has picked up from public filings, named because that information is already
      public. Ten minutes, six things worth your attention.`,
  },
  {
    id: 'lt-01-home-briefing',
    act: 51,
    title: 'A briefing, not a chart',
    seat: 'partner',
    steps: [{ scrollTo: 'Daily briefing' }],
    spotlight: 'text:Daily briefing',
    say: `The first thing is not a dashboard. It is somebody telling you what happened, in sentences, written for the
      seat you are sitting in. The badge says Composed — assembled from the record by fixed rules, no model wrote a
      word of it, and it cannot change a deal's status.`,
  },
  {
    id: 'lt-02-home-evidence',
    act: 51,
    title: 'Every claim opens to its source',
    seat: 'partner',
    steps: [{ scrollTo: 'Daily briefing' }, { clickText: '🔍 Evidence' }, { wait: 1800 }],
    spotlight: 'text:Daily briefing',
    click: 'text:🔍 Evidence',
    say: `Press Evidence and every numbered claim opens to the deal, the workstream or the filing it came from.
      "Where did this number come from" is the question that stops every committee. Here it is one click.`,
  },
  {
    id: 'lt-03-home-followups',
    act: 51,
    title: 'Promises nobody wrote down',
    seat: 'partner',
    steps: [{ clickText: '🔍 Evidence' }, { scrollTo: 'Untracked follow-ups' }],
    spotlight: 'text:Untracked follow-ups',
    say: `And the panel people remember. Twenty-two promises made in Teams channels that nobody wrote down, across
      nineteen deals, each quoted verbatim with who said it and by when — read straight out of the same Teams
      conversations your deal teams already hold. It does not chase them. It tells you they exist. Every firm has
      this problem and no way of seeing it.`,
  },
  {
    id: 'lt-04-sourcing-framework',
    act: 52,
    title: 'A rule from your investors, or a partner\u2019s judgement',
    seat: 'partner',
    steps: [{ clickText: 'Sourcing & screening' }, { wait: 2200 }, { clickText: 'Sourcing framework' }, { wait: 2200 }, { scrollTop: 0 }],
    click: 'text:Sourcing framework',
    say: `Before a deal is a deal. The fund mandate is a hard box — the binding limits in your agreement with your
      investors. Outside it, a company is excluded and never scored, because you cannot buy it. Investment themes
      are a partner's hunting ground: they shape the search and exclude nothing. Confusing the two is how a fund
      wastes a quarter on something it was never permitted to buy.`,
  },
  {
    id: 'lt-05-deal-brief',
    act: 53,
    title: 'It tells you where to start',
    seat: 'partner',
    steps: [{ clickText: 'All deals' }, { wait: 2500 }, { openDeal: 'Helvetia' }, { wait: 4000 }, { scrollTop: 0 }],
    click: 'text:Helvetia',
    say: `Open Helvetia Diagnostics. Five pages, in the same order on every deal: where it stands, the case for it,
      the work, the numbers, the paperwork. And above them, one line telling you where to start and what to do about
      it, with a button that takes you there.`,
  },
  {
    id: 'lt-06-deal-case',
    act: 53,
    title: 'Two obligations still outstanding',
    seat: 'partner',
    steps: [{ clickText: 'The case' }, { wait: 2500 }, { scrollTop: 0 }],
    click: 'text:The case',
    say: `The case opens on the recommendation: past the IC decision, two obligations still outstanding. Beside it,
      the readiness board lists them. The board is the record — it is what decides whether the committee papers are
      complete.`,
  },
  {
    id: 'lt-07-deal-work',
    act: 53,
    title: 'A records gap, not outstanding work',
    seat: 'partner',
    steps: [{ clickText: 'The work' }, { wait: 3000 }, { scrollTo: 'Workstreams' }],
    click: 'text:The work',
    say: `And the work. The header states the position honestly — one behind — and two lanes read closed at IC, no
      write-up on file. That is not a fault the software is hiding. Two workstreams were signed off at committee with
      nothing written up afterwards. That is a records gap, not outstanding work, and knowing the difference is the
      whole job.`,
  },
  {
    id: 'lt-08-deal-assistant',
    act: 54,
    title: 'The assistant drafts; the board decides',
    seat: 'partner',
    steps: [{ clickText: '💬 Ask the assistant' }, { wait: 3000 }],
    say: `Ask the assistant what is outstanding before we can close. The Focus box is set to this deal, so answers
      come from this deal only — it only ever roams inside what your role permits. It cannot move a deal, change a
      status, approve or send. The assistant drafts. The readiness board is the record. Nothing reaches a committee
      paper unchecked.`,
  },
  {
    id: 'lt-09-seat-analyst',
    act: 55,
    title: 'Twenty-four deals become eight',
    seat: 'analyst',
    keepBanner: true,
    steps: [{ closeOverlay: true }, { selectSeat: 'analyst' }, { wait: 4000 }, { clickText: 'All deals' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Now somebody else sits down. Chidi Anagonye, an analyst covering the Northeast. All deals drops from
      twenty-four to eight, and the filters change with it. Value and Exit is not offered at all, because he has no
      deal in it. The filters describe his world, not the fund's — enforced by Microsoft Entra ID, the same identity
      the rest of the firm signs into Teams and SharePoint with.`,
  },
  {
    id: 'lt-10-seat-analyst-locked',
    act: 55,
    title: 'Honest about what it is holding back',
    seat: 'analyst',
    keepBanner: true,
    steps: [{ scrollTo: 'Status only' }],
    say: `Further down, a deal he is not cleared for still appears under a status-only heading: Harborlight Marine
      Services, locked, you are not on this deal team. By name and where it stands, with no valuation and no
      documents. It is honest that the deal exists rather than pretending it does not — and the restricted detail is
      never sent to the browser at all.`,
  },
  {
    id: 'lt-11-seat-analyst-onyx',
    act: 55,
    title: 'A name beats a rank',
    seat: 'analyst',
    keepBanner: true,
    steps: [{ goto: '#/deals' }, { wait: 3000 }, { openDeal: 'Onyx' }, { wait: 3000 }, { scrollTop: 0 }],
    click: 'text:Onyx',
    say: `Stay on the analyst and open Project Onyx, a confidential carve-out under a clean-team protocol. It opens
      in full. He is named on it.`,
  },
  {
    id: 'lt-12-seat-admin-refused',
    act: 55,
    title: 'Refused without confirming it exists',
    seat: 'admin',
    keepBanner: true,
    steps: [{ selectSeat: 'admin' }, { wait: 4000 }, { gotoConfidential: true }, { wait: 4000 }, { scrollTop: 0 }],
    say: `Now switch to the administrator — the most senior seat here — and look for it. His list is twenty-one
      deals; the partner's was twenty-four. Paste the deal's own link and the product answers: deal unavailable.
      Either it does not exist, or you are not on its deal team. It refuses without confirming the deal exists,
      because on an unannounced take-private the fact that there is something to ask about is itself the leak. The
      analyst opens a deal the administrator cannot, because somebody put his name on it. Rank buys you nothing.`,
  },
  {
    id: 'lt-13-report',
    act: 56,
    title: 'Draft until a named person signs it',
    seat: 'partner',
    steps: [{ selectSeat: 'partner' }, { wait: 3000 }, { clickText: 'Firm reporting' }, { wait: 3000 }, { scrollTop: 0 }],
    click: 'text:Firm reporting',
    say: `Last, firm reporting. Built in Power BI — the same reporting tool your finance team already uses — embedded
      here, so it prints and travels. The header prints its own certification and names the partner who signed it and
      the date. An uncertified report says draft on every page and offers a certify button only a partner or
      administrator can press — and pressing it freezes a dated copy that cannot be edited. The same line declares
      market data: not connected. That is the single most credible thing on the screen.`,
  },
  {
    id: 'lt-14-close',
    act: 56,
    title: 'The close',
    seat: 'partner',
    steps: [{ clickText: 'Home' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `One place to run a deal, from a first look to owning the company, inside the tools your team already uses.
      Every number tells you where it came from, and each person sees only what their role permits — enforced by
      Microsoft Entra ID. The deal material never leaves your tenant: the data room is your SharePoint, the
      conversation is your Teams channel.`,
  },
];

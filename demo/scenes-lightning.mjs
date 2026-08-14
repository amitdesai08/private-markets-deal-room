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
    say: `This is the Deal Room, one place to run a private equity deal, built on Microsoft 365, Microsoft Teams and
      Microsoft Entra ID, the tools a firm already runs and already trusts. Almost everything shown here comes from
      an invented demonstration book, with invented companies, invented people and invented numbers. A handful of
      real public companies do appear, because the screener has picked them up from public filings that are already
      public information. Six things are worth attention in the next ten minutes.`,
  },
  {
    id: 'lt-01-home-briefing',
    act: 51,
    title: 'A briefing, not a chart',
    seat: 'partner',
    steps: [{ scrollTo: 'Daily briefing' }],
    spotlight: 'text:Daily briefing',
    say: `The first thing on the page is not a dashboard. It is somebody telling you what happened, written in full
      sentences for the seat currently signed in. A small badge in the corner says Composed, meaning the platform
      assembled these sentences from the record using a fixed template. No person typed it and no AI model wrote it,
      so it can never change a deal's status.`,
  },
  {
    id: 'lt-02-home-evidence',
    act: 51,
    title: 'Every claim opens to its source',
    seat: 'partner',
    steps: [{ scrollTo: 'Daily briefing' }, { clickText: '🔍 Evidence' }, { wait: 1800 }],
    spotlight: 'text:Daily briefing',
    click: 'text:🔍 Evidence',
    say: `Every numbered claim in that briefing opens back to the deal, the workstream or the filing it came from
      with a single press of Evidence, answering the question that stops every committee: where did this number come
      from.`,
  },
  {
    id: 'lt-03-home-followups',
    act: 51,
    title: 'Promises nobody wrote down',
    seat: 'partner',
    steps: [{ clickText: '🔍 Evidence' }, { scrollTo: 'Untracked follow-ups' }],
    spotlight: 'text:Untracked follow-ups',
    say: `This is the panel people tend to remember: twenty-two promises made in Teams channels that nobody wrote
      down, across nineteen deals, each quoted word for word along with who said it and by when, read straight out
      of the same Teams conversations a deal team already holds. It does not chase these commitments down; it simply
      surfaces that they exist, a problem every firm recognizes and few can normally see.`,
  },
  {
    id: 'lt-04-sourcing-framework',
    act: 52,
    title: 'A rule from your investors, or a partner\u2019s judgement',
    seat: 'partner',
    steps: [{ clickText: 'Sourcing & screening' }, { wait: 2200 }, { clickText: 'Sourcing framework' }, { wait: 2200 }, { scrollTop: 0 }],
    click: 'text:Sourcing framework',
    say: `Before a company ever becomes a deal, the fund mandate acts as a hard box, the binding limits written into
      the fund's agreement with its investors. Outside that box, a company is excluded and never scored, because it
      could never be bought. Investment themes work differently, shaping a partner's search without excluding
      anything, and confusing the two is how a fund spends a quarter chasing something it was never permitted to
      buy.`,
  },
  {
    id: 'lt-05-deal-brief',
    act: 53,
    title: 'It tells you where to start',
    seat: 'partner',
    steps: [{ clickText: 'All deals' }, { wait: 2500 }, { openDeal: 'Helvetia' }, { wait: 4000 }, { scrollTop: 0 }],
    click: 'text:Helvetia',
    say: `Helvetia Diagnostics shows the shape every deal takes: five pages in the same order every time, covering
      where it stands, the case for it, the work, the numbers, and the paperwork. Above those pages sits a single
      line stating where to start and what to do about it, with a button leading straight there.`,
  },
  {
    id: 'lt-06-deal-case',
    act: 53,
    title: 'Two obligations still outstanding',
    seat: 'partner',
    steps: [{ clickText: 'The case' }, { wait: 2500 }, { scrollTop: 0 }],
    click: 'text:The case',
    say: `The case page opens on the recommendation. This deal is past its IC decision, with two obligations still
      outstanding, and beside it the readiness board lists them, since the board is the actual record of whether the
      committee papers are complete.`,
  },
  {
    id: 'lt-07-deal-work',
    act: 53,
    title: 'A records gap, not outstanding work',
    seat: 'partner',
    steps: [{ clickText: 'The work' }, { wait: 3000 }, { scrollTo: 'Workstreams' }],
    click: 'text:The work',
    say: `The work page states its position honestly: one workstream behind, with two lanes reading closed at IC
      and no write-up on file. That is not a fault the software is hiding. It means two workstreams were signed off
      at committee with nothing ever written up afterward, which is a records gap rather than outstanding work, and
      knowing that difference is most of the job.`,
  },
  {
    id: 'lt-08-deal-assistant',
    act: 54,
    title: 'The assistant drafts; the board decides',
    seat: 'partner',
    steps: [{ clickText: '💬 Ask the assistant' }, { wait: 3000 }],
    say: `Asking the assistant what is still outstanding before this deal can close brings up an answer scoped
      entirely to this deal, since the Focus box roams only as far as a role permits. It cannot move a deal, change a
      status, approve anything, or send anything. The assistant drafts; the readiness board decides, and nothing
      reaches a committee paper unchecked.`,
  },
  {
    id: 'lt-09-seat-analyst',
    act: 55,
    title: 'Twenty-four deals become eight',
    seat: 'analyst',
    keepBanner: true,
    steps: [{ closeOverlay: true }, { selectSeat: 'analyst' }, { wait: 4000 }, { clickText: 'All deals' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Chidi Anagonye is an analyst covering the Northeast, and under his seat, All deals drops from twenty-four
      to eight, with the filters changing to match. Value and Exit disappears entirely, because he has no deal in
      that stage. The filters describe his own world rather than the fund's, enforced by Microsoft Entra ID, the
      same identity a firm already signs into Teams and SharePoint with.`,
  },
  {
    id: 'lt-10-seat-analyst-locked',
    act: 55,
    title: 'Honest about what it is holding back',
    seat: 'analyst',
    keepBanner: true,
    steps: [{ scrollTo: 'Status only' }],
    say: `Further down, a deal he is not cleared for still appears under a status-only heading: Harborlight Marine
      Services, locked, because he is not on that deal team. It shows by name and by where it stands, with no
      valuation and no documents, honest that the deal exists rather than pretending otherwise, and the restricted
      detail is never sent to the browser at all.`,
  },
  {
    id: 'lt-11-seat-analyst-onyx',
    act: 55,
    title: 'A name beats a rank',
    seat: 'analyst',
    keepBanner: true,
    steps: [{ goto: '#/deals' }, { wait: 3000 }, { openDeal: 'Onyx' }, { wait: 3000 }, { scrollTop: 0 }],
    click: 'text:Onyx',
    say: `Project Onyx, a confidential carve-out under a clean-team protocol, still opens in full for the analyst,
      because he is one of the people named on it.`,
  },
  {
    id: 'lt-12-seat-admin-refused',
    act: 55,
    title: 'Refused without confirming it exists',
    seat: 'admin',
    keepBanner: true,
    steps: [{ selectSeat: 'admin' }, { wait: 4000 }, { gotoConfidential: true }, { wait: 4000 }, { scrollTop: 0 }],
    say: `The administrator, the most senior seat here, cannot find that same deal at all. His list holds
      twenty-one deals against the partner's twenty-four, and opening the deal's own link directly gets the answer
      deal unavailable: either it does not exist, or the signed-in seat is not on its deal team. It refuses without
      ever confirming which is true, because on an unannounced take-private, the mere fact that there is something
      worth asking about is itself the leak. The analyst can open a deal the administrator cannot, simply because
      somebody put his name on it. Rank buys nothing here.`,
  },
  {
    id: 'lt-13-report',
    act: 56,
    title: 'Draft until a named person signs it',
    seat: 'partner',
    steps: [{ selectSeat: 'partner' }, { wait: 3000 }, { clickText: 'Firm reporting' }, { wait: 3000 }, { scrollTop: 0 }],
    click: 'text:Firm reporting',
    say: `Firm reporting is built in Power BI, the same reporting tool a finance team already uses, embedded
      directly here so it prints and travels. The header prints its own certification, naming the partner who signed
      it and the date. An uncertified report says draft on every page and offers a certify button that only a
      partner or administrator can press, and pressing it freezes a dated copy that can no longer be edited. That
      same line declares market data not connected, which may be the single most credible line on the screen.`,
  },
  {
    id: 'lt-14-close',
    act: 56,
    title: 'The close',
    seat: 'partner',
    steps: [{ clickText: 'Home' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `It is one place to run a deal, from a first look all the way to owning the company, inside tools a team
      already uses. Every number tells you where it came from, and each person sees only what their role permits,
      enforced by Microsoft Entra ID. The deal material never leaves that tenant: the data room is its SharePoint,
      and the conversation is its Teams channel.`,
  },
];

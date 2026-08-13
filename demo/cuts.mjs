// Alternative cuts of the walkthrough, assembled from screens already captured.
//
// A cut names scenes from scenes.mjs and gives them their own, tighter narration. No
// browser is involved: build-cut.mjs borrows the screenshots the walkthrough already took,
// so a cut costs a Speech call per line and nothing else.
//
//   node demo/build-cut.mjs lightning
//   node demo/narrate.mjs      --manifest scenes-lightning.json
//   node demo/build-player.mjs --manifest scenes-lightning.json --out lightning.html
//   node demo/build-video.mjs  --manifest scenes-lightning.json --out lightning.mp4

export const CUTS = {
  // docs/demos/DEMO-LIGHTNING.md — six beats, same claims, fewer stops.
  lightning: {
    title: 'Lightning demo',
    source: 'docs/demos/DEMO-LIGHTNING.md',
    acts: [
      { n: 0, title: 'Opening' },
      { n: 1, title: 'Home — everything shows its working' },
      { n: 2, title: 'Sourcing — a mandate is not a theme' },
      { n: 3, title: 'Inside a deal — the numbers agree' },
      { n: 4, title: 'The assistant — grounded and subordinate' },
      { n: 5, title: 'Different people — access is real' },
      { n: 6, title: 'Firm reporting — nothing goes out uncertified' },
    ],
    scenes: [
      {
        use: '00-open', act: 0, title: 'The Deal Room in ten minutes',
        say: `The Deal Room — one place to run a private equity deal, on the Microsoft tools your firm already pays for.
          Everything you are about to see is a demonstration book: invented companies, invented people, invented numbers.
          Ten minutes, six things worth your attention.`,
      },
      {
        use: '03-home-briefing', act: 1, title: 'A briefing, not a chart',
        say: `The first thing is not a dashboard. It is somebody telling you what happened, in sentences, written for the
          seat you are sitting in. The badge says Composed — assembled from the record by fixed rules, no model wrote a
          word of it, and it cannot change a deal's status.`,
      },
      {
        use: '04-home-evidence', act: 1, title: 'Every claim opens to its source',
        say: `Press Evidence and every numbered claim opens to the deal, the workstream or the filing it came from.
          Where did this number come from is the question that stops every committee. Here it is one click.`,
      },
      {
        use: '07-home-followups', act: 1, title: 'Promises nobody wrote down',
        say: `And the panel people remember. Twenty-two promises made in Teams channels that nobody wrote down, across
          nineteen deals, each quoted verbatim with who said it and by when. It does not chase them. It tells you they
          exist. Every firm has this problem and no way of seeing it.`,
      },
      {
        use: '11-sourcing-framework', act: 2, title: 'A rule from your investors, or a partner\u2019s judgement',
        say: `Before a deal is a deal. The fund mandate is a hard box — the binding limits in your agreement with your
          investors. Outside it, a company is excluded and never scored, because you cannot buy it. Investment themes
          are a partner's hunting ground: they shape the search and exclude nothing. Confusing the two is how a fund
          wastes a quarter on something it was never permitted to buy.`,
      },
      {
        use: '13-deal-brief', act: 3, title: 'It tells you where to start',
        say: `Open Helvetia Diagnostics. Five pages, in the same order on every deal: where it stands, the case for it,
          the work, the numbers, the paperwork. And above them, one line telling you where to start and what to do about
          it, with a button that takes you there.`,
      },
      {
        use: '14-deal-case', act: 3, title: 'Two obligations still outstanding',
        say: `The case opens on the recommendation: past the IC decision, two obligations still outstanding. Beside it,
          the readiness board lists them. The board is the record — it is what decides whether the committee papers are
          complete.`,
      },
      {
        use: '15-deal-work', act: 3, title: 'A records gap, not outstanding work',
        say: `And the work. The header states the position honestly — one behind — and two lanes read closed at IC, no
          write-up on file. That is not a fault the software is hiding. Two workstreams were signed off at committee with
          nothing written up afterwards. That is a records gap, not outstanding work, and knowing the difference is the
          whole job.`,
      },
      {
        use: '17-deal-assistant', act: 4, title: 'The assistant drafts; the board decides',
        say: `Ask the assistant what is outstanding before we can close. The Focus box is set to this deal, so answers
          come from this deal only — and it only ever roams inside what your role permits. It cannot move a deal, change
          a status, approve or send. The assistant drafts. The readiness board is the record. Nothing reaches a committee
          paper unchecked.`,
      },
      {
        use: '23-seat-analyst', act: 5, title: 'Twenty-four deals become eight',
        say: `Now somebody else sits down. Chidi Anagonye, an analyst covering the Northeast. All deals drops from
          twenty-four to eight, and the filters change with it. Value and Exit is not offered at all, because he has no deal
          in it. The filters describe his world, not the fund's.`,
      },
      {
        use: '23b-seat-analyst-locked', act: 5, title: 'Honest about what it is holding back',
        say: `Further down, a deal he is not cleared for still appears under a status-only heading: Harborlight Marine
          Services, locked, you are not on this deal team. By name and where it stands, with no valuation and no
          documents. It is honest that the deal exists rather than pretending it does not — and the restricted detail is
          never sent to the browser at all.`,
      },
      {
        use: '24-seat-analyst-onyx', act: 5, title: 'A name beats a rank',
        say: `Stay on the analyst and open Project Onyx, a confidential carve-out under a clean-team protocol. It opens
          in full. He is named on it.`,
      },
      {
        use: '26-seat-admin-refused', act: 5, title: 'Refused without confirming it exists',
        say: `Now switch to the administrator — the most senior seat here — and look for it. His list is twenty-one deals;
          the partner's was twenty-four. Paste the deal's own link and the product answers: deal unavailable. Either it does
          not exist, or you are not on its deal team. It refuses without confirming the deal exists, because on an
          unannounced take-private the fact that there is something to ask about is itself the leak. The analyst opens a
          deal the administrator cannot, because somebody put his name on it. Rank buys you nothing.`,
      },
      {
        use: '21-report', act: 6, title: 'Draft until a named person signs it',
        say: `Last, firm reporting. Built in Power BI, embedded here, so it prints and travels. The header prints its own
          certification and names the partner who signed it and the date. An uncertified report says draft on every page
          and offers a certify button only a partner or administrator can press — and pressing it freezes a dated copy
          that cannot be edited. The same line declares market data: not connected. That is the single most credible
          thing on the screen.`,
      },
      {
        use: '28-close', act: 6, title: 'The close',
        say: `One place to run a deal, from a first look to owning the company, inside the tools your team already uses.
          Every number tells you where it came from, and each person sees only what their role permits. The deal material
          never leaves your tenant — the data room is your SharePoint, the conversation is your Teams channel.`,
      },
    ],
  },
};

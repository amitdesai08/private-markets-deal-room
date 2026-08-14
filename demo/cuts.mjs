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
        say: `Lead with this. We are the partner, and the list reads twenty-four of twenty-four — everything this seat is
          cleared for.`,
      },
      {
        use: '23-seat-analyst', act: 2, title: 'The analyst sees eight',
        say: `Switch to an analyst covering the Northeast. Twenty-four becomes eight, and the filters change with it:
          one in origination, four in diligence, three in execution. No Value and Exit at all, because he has no deal in
          it. The filters describe his world, not the fund's.`,
      },
      {
        use: '23b-seat-analyst-locked', act: 2, title: 'It says what it is holding back',
        say: `And a deal he is not cleared for still appears, under status only: named, and where it stands, with no
          valuation and no documents. The restricted detail is never sent to the browser at all. Not a display setting —
          there is nothing to inspect and nothing to switch back on.`,
      },
      {
        use: '24-seat-analyst-onyx', act: 2, title: 'A name beats a rank',
        say: `Stay on the analyst and open Project Onyx, a confidential carve-out under a clean-team protocol. It opens
          in full, because he is named on it.`,
      },
      {
        use: '26-seat-admin-refused', act: 2, title: 'The administrator is refused',
        say: `Now the administrator — twenty-one deals to the partner's twenty-four. Paste the deal's own link and the
          product answers: deal unavailable. Either it does not exist, or you are not on its deal team. It refuses
          without confirming the deal exists, because on an unannounced take-private the fact that there is something to
          ask about is itself the leak. If there is a compliance officer in the room, this is the part they came for.`,
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
};

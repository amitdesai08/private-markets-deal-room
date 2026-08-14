// The business/executive-audience demo, as data — captured on its own. Same mechanics as
// scenes.mjs, same running product, different lens: this one is for the people who own the
// P&L of running deals — CEO, CFO, Managing Partner, Managing Director — not the people who
// operate the platform or work a deal day to day. Narration follows
// docs/demos/DEMO-WALKTHROUGH-BUSINESS.md act for act. Every time-and-effort claim below
// names the mechanic that produces the saving; none of it is an invented percentage.
//
//   node demo/capture.mjs      --scenes scenes-business.mjs --manifest scenes-business.json
//   node demo/narrate.mjs      --manifest scenes-business.json
//   node demo/build-player.mjs --manifest scenes-business.json --out business.html
//   node demo/build-video.mjs  --manifest scenes-business.json --out business.mp4

export { BASE } from './scenes.mjs';

export const ACTS = [
  { n: 200, title: 'Opening — capacity, not features' },
  { n: 201, title: 'The day starts already triaged' },
  { n: 202, title: 'Screening at scale, not by headcount' },
  { n: 203, title: 'The blank page is gone' },
  { n: 204, title: 'Nothing promised gets forgotten' },
  { n: 205, title: 'One system from source to exit' },
  { n: 206, title: 'Reporting without the scramble' },
  { n: 207, title: 'Close' },
];

export const SCENES = [
  // ─── Opening ────────────────────────────────────────────────────────────────
  {
    id: 'bc-00-open',
    act: 200,
    title: 'The cost this replaces is hours, not software',
    seat: 'partner',
    steps: [{ goto: '#/overview' }, { waitText: 'Daily briefing' }, { scrollTop: 0 }],
    say: `This is the Deal Room. I want to walk it the way a Managing Partner or a CFO would — not for the
      features, but for the hours it gives back. Everything here is drawn from one governed deal record, so the
      time a firm normally spends re-assembling status for a partner meeting, drafting a first cut of an IC memo, or
      chasing down what somebody promised in a Teams thread three weeks ago — that assembly work is the thing this
      removes. We are signed in as Eleanor Shellstrop, a partner, because this is the seat that feels the operating
      overhead most directly.`,
  },

  // ─── Act 201 · The day starts already triaged ───────────────────────────────
  {
    id: 'bc-01-briefing',
    act: 201,
    title: 'A morning briefing nobody had to compile',
    seat: 'partner',
    steps: [{ scrollTop: 0 }],
    spotlight: 'text:Daily briefing',
    say: `Most firms start the day with someone — an associate, a chief of staff — pulling together what needs
      attention: which deals are slipping toward committee, what changed since yesterday, what a partner should look
      at first. That assembly work happens here automatically, every time the page loads, from the deal record
      itself. Nobody wrote this paragraph. It read the pipeline and wrote itself.`,
  },
  {
    id: 'bc-02-needs-attention',
    act: 201,
    title: 'The one list that used to take a Monday-morning call',
    seat: 'partner',
    steps: [{ scrollTo: 'What needs my attention' }],
    spotlight: 'text:What needs my attention',
    click: 'text:🔍 Evidence',
    say: `"What needs my attention" is the deals slipping toward committee, ranked, with a plain reason and a
      one-click way in. This is the list a partner used to ask three people to put together before a Monday
      pipeline call. Here it is current the moment the page opens, and every figure behind it opens to its source
      — so it replaces
      not just the list, but the trust exercise of checking whether the list is right.`,
  },

  // ─── Act 202 · Screening at scale ───────────────────────────────────────────
  {
    id: 'bc-03-sourcing',
    act: 202,
    title: 'Screening that does not scale with headcount',
    seat: 'partner',
    steps: [{ clickText: 'Sourcing & screening' }, { wait: 2500 }],
    click: 'text:Sourcing & screening',
    say: `Every incoming signal is screened against the fund's mandate automatically, before an analyst spends
      an afternoon on a company the fund was never going to be permitted to buy. The screening still happens — it
      just no longer costs an analyst-hour per candidate to find out a deal does not clear the mandate. That hour
      goes to the deals that do.`,
  },

  // ─── Act 203 · The blank page is gone ───────────────────────────────────────
  {
    id: 'bc-04-open-deal',
    act: 203,
    title: 'A finished first draft, not a blank page',
    seat: 'partner',
    steps: [{ openDeal: 'Helvetia' }, { wait: 3000 }, { clickText: 'Papers' }, { wait: 2500 }],
    click: 'text:Papers',
    say: `Open any deal's Papers and the IC pack is already there — memo, deck and returns model, drafted from
      the live record the moment the deal was created. A committee memo is normally a multi-day drafting exercise
      for whoever draws the assignment. Here, that person's job changes from writing the first draft to improving
      one that already exists — and it already carries the fund's own brand, sections and confidentiality wording,
      set once in Settings, not re-templated on every deal.`,
  },
  {
    id: 'bc-05-readiness',
    act: 203,
    title: 'A readiness verdict instead of a status meeting',
    seat: 'partner',
    steps: [{ clickText: 'The case' }, { wait: 2500 }],
    click: 'text:The case',
    say: `"The case" gives a Ready, Conditional or Not-ready verdict with the specific blockers named, each with
      a one-click way to resolve it. That verdict is what a pre-IC status meeting exists to produce by discussion.
      It is available here on demand, which means the meeting that used to be required to find out whether a deal
      is ready can become a meeting to actually decide something.`,
  },

  // ─── Act 204 · Nothing promised gets forgotten ──────────────────────────────
  {
    id: 'bc-06-follow-ups',
    act: 204,
    title: 'The commitments nobody wrote down',
    seat: 'partner',
    steps: [{ closeOverlay: true }, { clickText: 'Home' }, { wait: 2000 }, { scrollTo: 'Untracked follow-ups' }],
    spotlight: 'text:Untracked follow-ups',
    say: `Every firm loses time to a commitment made verbally or in a Teams thread that nobody wrote down and
      somebody has to rediscover weeks later, usually the hard way. This surfaces those automatically across every
      deal channel — not by chasing them, simply by noticing they exist and putting them in front of a person. It
      is the operational overhead of "who was supposed to follow up on that" removed at the source.`,
  },

  // ─── Act 205 · One system from source to exit ──────────────────────────────
  {
    id: 'bc-07-fund',
    act: 205,
    title: 'The deal did not end at the signature',
    seat: 'partner',
    steps: [{ clickText: 'Fund & Portfolio' }, { wait: 2500 }],
    click: 'text:Fund & Portfolio',
    say: `Most firms hand a closed deal to a different system, and often a different team, to monitor — which
      means re-entering data and reconciling two records of the truth. Here it is the same governed record, the
      same platform, before and after close: committed capital, returns, and portfolio monitoring against the
      original underwriting plan, with no migration and nothing to re-key.`,
  },
  {
    id: 'bc-08-crm',
    act: 205,
    title: 'The systems you already run for pipeline, kept in sync',
    seat: 'admin',
    steps: [{ selectSeat: 'admin' }, { wait: 3000 }, { clickText: '⚙' }, { wait: 2000 }, { clickText: 'Data sources' }, { wait: 2500 }, { scrollTo: 'Add a data source' }],
    click: 'text:Data sources',
    say: `For a firm that already runs a CRM or a deal database for pipeline, this platform's connector registry —
      shown here — extends the same governed pattern to it directly: pulling existing deals in once, and pushing
      an investment-committee decision back out the moment it is made, automatically. That is the double entry
      between "the system we track pipeline in" and "the system we ran the deal in" removed, without asking anyone
      to change which system they open first.`,
  },

  // ─── Act 206 · Reporting without the scramble ───────────────────────────────
  {
    id: 'bc-09-report',
    act: 206,
    title: 'An investor-ready report, not an end-of-quarter scramble',
    seat: 'partner',
    steps: [{ selectSeat: 'partner' }, { wait: 3000 }, { clickText: 'Firm reporting' }, { wait: 2500 }],
    click: 'text:Firm reporting',
    say: `Reporting to a limited partner is normally a manual pull-together at quarter end — figures gathered
      from several places, checked, and formatted, under a deadline. Here it is a live view of the same governed
      record, certified by a named partner with one action, and a report is either "certified for LP use" or plainly
      marked "draft" — nothing goes out the door in an ambiguous state, and nobody has to reconstruct it from
      scratch each quarter.`,
  },

  // ─── Act 207 · Close ─────────────────────────────────────────────────────────
  {
    id: 'bc-10-close',
    act: 207,
    title: 'Time back, not a new system to run',
    seat: 'partner',
    steps: [{ wait: 500 }],
    say: `Every saving in this walkthrough came from removing a manual assembly step, not from a promise about
      speed. The briefing nobody compiles by hand, the IC pack that starts as a finished draft, the follow-up that
      surfaces itself, the fund and portfolio record that never needs re-entering, the report that certifies itself
      rather than getting rebuilt every quarter — that is where the operating overhead of running deals actually
      goes, and this is what removing it looks like in practice. And it runs inside Microsoft Teams, so it is not a
      new place for a firm to learn to work.`,
  },
];

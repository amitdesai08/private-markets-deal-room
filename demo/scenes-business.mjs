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
  { n: 202, title: 'Deal flow — screening at scale, not by headcount' },
  { n: 203, title: 'The blank page is gone' },
  { n: 204, title: 'Nothing promised gets forgotten' },
  { n: 205, title: 'One system from source to exit' },
  { n: 206, title: 'Reporting without the scramble' },
  { n: 207, title: 'Close — why this, and not what you do today' },
];

export const SCENES = [
  // ─── Opening ────────────────────────────────────────────────────────────────
  {
    id: 'bc-00-open',
    act: 200,
    title: 'The cost this replaces is hours, not software',
    seat: 'partner',
    steps: [{ goto: '#/overview' }, { waitText: 'Daily briefing' }, { scrollTop: 0 }],
    say: `This is the Deal Room. I want to walk it the way a Managing Partner or a CFO would, not for the
      features, but for the hours it gives back. Everything here is drawn from one governed deal record, so the
      time a firm normally spends re-assembling status for a partner meeting, drafting a first cut of an IC memo,
      or chasing down what somebody promised in a Teams thread three weeks ago, that's the assembly work this
      removes. We're signed in as Eleanor Shellstrop, a partner, because this is the seat that feels the operating
      overhead most directly.`,
  },
  {
    id: 'bc-00b-easeofuse',
    act: 200,
    title: 'One tool, not six',
    seat: 'partner',
    steps: [{ wait: 500 }],
    say: `Before we get into the deals, notice where we are. This is Microsoft Teams, the same app your team
      already has open all day. There's no new login, no separate portal to remember, and nothing here that isn't
      already part of a normal work day. That's worth saying plainly, because a tool a firm doesn't actually use
      doesn't save anyone anything, no matter how good it is on paper.`,
  },

  // ─── Act 201 · The day starts already triaged ───────────────────────────────
  {
    id: 'bc-01-briefing',
    act: 201,
    title: 'A morning briefing nobody had to compile',
    seat: 'partner',
    steps: [{ scrollTop: 0 }],
    spotlight: 'text:Daily briefing',
    say: `Most firms start the day with someone, an associate, a chief of staff, pulling together what needs
      attention: which deals are slipping toward committee, what changed since yesterday, what a partner should
      look at first. That assembly work happens here automatically, every time the page loads, straight from the
      deal record. Nobody wrote this paragraph. It read the pipeline and wrote itself.`,
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
      pipeline call. Here it's current the moment the page opens, and every figure behind it opens to its source,
      so it replaces not just the list, but the trust exercise of checking whether the list is right.`,
  },

  // ─── Act 202 · Deal flow — screening at scale ───────────────────────────────
  {
    id: 'bc-03-sourcing',
    act: 202,
    title: 'Deal flow: screening that doesn\u2019t scale with headcount',
    seat: 'partner',
    steps: [{ clickText: 'Sourcing & screening' }, { wait: 2500 }],
    click: 'text:Sourcing & screening',
    say: `Every incoming signal gets screened against the fund's mandate automatically, before an analyst spends
      an afternoon on a company the fund was never going to be permitted to buy. The screening still happens. It
      just doesn't cost an analyst-hour per candidate to find out a deal doesn't clear the mandate. That's the real
      lever on deal flow: not doing more work, but getting a real look at more of the right candidates with the
      same team, because the hour that used to go to disqualifying a company now goes to the ones worth pursuing.`,
  },

  // ─── Act 203 · The blank page is gone ───────────────────────────────────────
  {
    id: 'bc-04-open-deal',
    act: 203,
    title: 'A finished first draft, not a blank page',
    seat: 'partner',
    steps: [{ openDeal: 'Helvetia' }, { wait: 3000 }, { clickText: 'Papers' }, { wait: 2500 }],
    click: 'text:Papers',
    say: `Open any deal's Papers and the IC pack is already there: memo, deck and returns model, drafted from the
      live record the moment the deal was created. A committee memo is normally a multi-day drafting exercise for
      whoever draws the assignment. Here, that person's job changes from writing the first draft to improving one
      that already exists, and it already carries the fund's own brand, sections and confidentiality wording, set
      once in Settings, not re-templated on every deal.`,
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
      It's available here on demand, which means the meeting that used to exist just to find out whether a deal is
      ready can become a meeting to actually decide something.`,
  },

  // ─── Act 204 · Nothing promised gets forgotten ──────────────────────────────
  {
    id: 'bc-06-follow-ups',
    act: 204,
    title: 'The commitments nobody wrote down',
    seat: 'partner',
    steps: [{ closeOverlay: true }, { clickText: 'Home' }, { wait: 2000 }, { scrollTo: 'Untracked follow-ups' }],
    spotlight: 'text:Untracked follow-ups',
    say: `Every firm loses time to a commitment made verbally or in a Teams thread that nobody wrote down, and
      somebody has to rediscover it weeks later, usually the hard way. This surfaces those automatically across
      every deal channel. It doesn't chase them; it simply notices they exist and puts them in front of a person.
      That's the operational overhead of "who was supposed to follow up on that" removed at the source.`,
  },

  // ─── Act 205 · One system from source to exit ──────────────────────────────
  {
    id: 'bc-07-fund',
    act: 205,
    title: 'The deal didn\u2019t end at the signature',
    seat: 'partner',
    steps: [{ clickText: 'Fund & Portfolio' }, { wait: 2500 }],
    click: 'text:Fund & Portfolio',
    say: `Most firms hand a closed deal to a different system, and often a different team, to monitor. That means
      re-entering data and reconciling two records of the truth. Here it's the same governed record, the same
      platform, before and after close: committed capital, returns, and portfolio monitoring against the original
      underwriting plan, with no migration and nothing to re-key.`,
  },
  {
    id: 'bc-08-crm',
    act: 205,
    title: 'The systems you already run for pipeline, kept in sync',
    seat: 'admin',
    steps: [{ selectSeat: 'admin' }, { wait: 3000 }, { clickText: '⚙' }, { wait: 2000 }, { clickText: 'Data sources' }, { wait: 2500 }, { scrollTo: 'Add a data source' }],
    click: 'text:Data sources',
    say: `For a firm that already runs a CRM or a deal database for pipeline, this platform's connector registry,
      shown here, extends the same governed pattern to it directly. It pulls existing deals in once, and pushes an
      investment-committee decision back out the moment it's made, automatically. That's the double entry between
      "the system we track pipeline in" and "the system we ran the deal in" removed, without asking anyone to
      change which system they open first.`,
  },

  // ─── Act 206 · Reporting without the scramble ───────────────────────────────
  {
    id: 'bc-09-report',
    act: 206,
    title: 'An investor-ready report, not an end-of-quarter scramble',
    seat: 'partner',
    steps: [{ selectSeat: 'partner' }, { wait: 3000 }, { clickText: 'Firm reporting' }, { wait: 2500 }],
    click: 'text:Firm reporting',
    say: `Reporting to a limited partner is normally a manual pull-together at quarter end: figures gathered from
      several places, checked, and formatted, under a deadline. Here it's a live view of the same governed record,
      certified by a named partner with one action, and a report is either "certified for LP use" or plainly
      marked "draft." Nothing goes out the door in an ambiguous state, and nobody has to reconstruct it from
      scratch each quarter.`,
  },

  // ─── Act 207 · Close ─────────────────────────────────────────────────────────
  {
    id: 'bc-10-close',
    act: 207,
    title: 'Why this, not just what it does',
    seat: 'partner',
    steps: [{ wait: 500 }],
    say: `So here's the why, not just the what. Productivity: every saving in this walkthrough came from removing
      a manual assembly step, not a promise about speed. Deal flow: screening that doesn't cost an analyst-hour
      per candidate means the same team gets a real look at more of the pipeline. And ease of use: none of it
      required a new tool, because it's Microsoft Teams your team already runs all day. That's the actual
      comparison against what a firm does today. It isn't a faster version of the old process. It's the old
      process with the manual assembly taken out of it.`,
  },
];

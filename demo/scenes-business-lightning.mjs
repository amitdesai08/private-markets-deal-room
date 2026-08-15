// The business lightning demo, captured on its own — the ten-minute cut for a CEO, CFO,
// Managing Partner or Managing Director's calendar slot.
//
//   node demo/capture.mjs      --scenes scenes-business-lightning.mjs --manifest scenes-business-lightning.json
//   node demo/narrate.mjs      --manifest scenes-business-lightning.json
//   node demo/build-player.mjs --manifest scenes-business-lightning.json --out business-lightning.html
//   node demo/build-video.mjs  --manifest scenes-business-lightning.json --out business-lightning.mp4

export { BASE } from './scenes.mjs';

export const ACTS = [
  { n: 250, title: 'Opening' },
  { n: 251, title: 'The day starts triaged, deal flow at scale' },
  { n: 252, title: 'The blank page is gone' },
  { n: 253, title: 'Nothing forgotten' },
  { n: 254, title: 'One system, source to exit' },
  { n: 255, title: 'Close — why, not just what' },
];

export const SCENES = [
  {
    id: 'bcl-00-open',
    act: 250,
    title: 'The hours this gives back',
    seat: 'partner',
    steps: [{ goto: '#/overview' }, { waitText: 'Daily briefing' }, { scrollTop: 0 }],
    say: `Ten minutes on the Deal Room, from a Managing Partner's seat, not the features, the hours. Everything
      here comes from one governed deal record, running inside Microsoft Teams your team already uses all day, so
      there's no new tool to learn. Every saving I point out is a specific manual task this removes, not a number
      I'm asking you to take on faith.`,
  },
  {
    id: 'bcl-01-briefing',
    act: 251,
    title: 'A briefing nobody compiled by hand',
    seat: 'partner',
    steps: [{ scrollTo: 'What needs my attention' }],
    spotlight: 'text:What needs my attention',
    say: `This morning briefing and the "What needs my attention" list underneath it are the status assembly a
      chief of staff or an associate usually does before a Monday pipeline call. It's current the moment the page
      opens, and every line opens to the source behind it.`,
  },
  {
    id: 'bcl-01b-dealflow',
    act: 251,
    title: 'Deal flow: screening that doesn\u2019t cost an analyst-hour',
    seat: 'partner',
    keepBanner: true,
    steps: [{ wait: 500 }],
    say: `Every incoming signal is screened against the fund's mandate automatically, before an analyst spends an
      afternoon on a company the fund was never going to buy. That's the real lever on deal flow: the same team
      gets a real look at more of the pipeline, because the hour that used to go to disqualifying a company now
      goes to the ones worth pursuing.`,
  },
  {
    id: 'bcl-02-papers',
    act: 252,
    title: 'A finished first draft, not a blank page',
    seat: 'partner',
    steps: [{ openDeal: 'Helvetia' }, { wait: 3000 }, { clickText: 'Papers' }, { wait: 2500 }],
    click: 'text:Papers',
    say: `Open a deal's Papers and the IC memo, deck and returns model are already drafted from the live record,
      in the fund's own house style. Drafting a first cut of a committee memo is normally days of somebody's time.
      Here the job becomes improving a draft that already exists.`,
  },
  {
    id: 'bcl-03-followups',
    act: 253,
    title: 'The commitment nobody wrote down',
    seat: 'partner',
    steps: [{ closeOverlay: true }, { clickText: 'Home' }, { wait: 2000 }, { scrollTo: 'Untracked follow-ups' }],
    spotlight: 'text:Untracked follow-ups',
    say: `Every firm loses a promise made in a Teams thread that nobody writes down. This surfaces those
      automatically, across every deal. It's the overhead of "who was supposed to follow up on that" removed at
      the source, not chased down after the fact.`,
  },
  {
    id: 'bcl-04-fund-crm',
    act: 254,
    title: 'No re-keying between the systems you already run',
    seat: 'partner',
    steps: [{ clickText: 'Fund & Portfolio' }, { wait: 2500 }],
    click: 'text:Fund & Portfolio',
    say: `A closed deal doesn't hand off to a different system to monitor. It's the same governed record before
      and after close. And for a firm running its own CRM for pipeline, it connects directly: existing deals pulled
      in once, committee decisions pushed back out automatically, with no double entry between the two systems.`,
  },
  {
    id: 'bcl-05-close',
    act: 255,
    title: 'Why this, inside the tools you already use',
    seat: 'partner',
    steps: [{ wait: 500 }],
    say: `Productivity, deal flow and ease of use, in one sentence each. Every saving here came from removing a
      manual assembly step, not a speed promise. The team gets a real look at more of the pipeline because
      screening no longer costs an hour per candidate. And none of it needed a new tool, because it's Microsoft
      Teams your firm already runs all day. That's the comparison that matters: not faster, just less manual.`,
  },
];

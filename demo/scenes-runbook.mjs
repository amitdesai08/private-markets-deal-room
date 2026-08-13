// The scenes the runbook needs that the walkthrough never visits.
//
// docs/demos/DEMO-RUNBOOK.md runs a different spine to the walkthrough: it opens on access
// rather than closing on it, and it covers four things the walkthrough skips entirely —
// working the deal together, the specialist agents, the M365 data sources, and where the
// board-ready documents come from.
//
// Captured into their own manifest so the walkthrough deck is unaffected:
//   node demo/capture.mjs --scenes scenes-runbook.mjs --manifest scenes-runbook-raw.json

export { BASE } from './scenes.mjs';

export const ACTS = [
  { n: 40, title: 'Work the deal together' },
  { n: 41, title: 'Talk to the specialists' },
  { n: 42, title: 'Where the data comes from' },
  { n: 43, title: 'Board-ready documents' },
];

export const SCENES = [
  {
    id: 'rb-notifications',
    act: 40,
    title: 'What landed on me',
    seat: 'partner',
    steps: [{ goto: '#/overview' }, { waitText: 'Daily briefing' }, { clickText: '🔔' }, { wait: 2500 }],
    say: `Start with the bell. It counts what has reached your stage — a deal advancing into the phase you own,
      a workstream you lead that is blocking, a go/no-go recorded. Switch seats and the list changes with the person:
      the General Counsel sees their legal lanes, an observer sees none. Nobody is told about work that is not theirs.
      This is the same need-to-know model as the deal list, applied to alerts.`,
  },
  {
    id: 'rb-channel',
    act: 40,
    title: 'The conversation lives in the deal',
    seat: 'partner',
    steps: [{ goto: '#/deals' }, { wait: 2500 }, { openDeal: 'Helvetia' }, { clickText: '# Deal channel' }, { wait: 3000 }],
    say: `Now the deal channel, opened from the deal header. The conversation is inside the deal, not a link out —
      the thread, an AI catch-up of what happened since yesterday, and the decisions and commitments the product has
      detected but will not record on its own. Post a message and it says where it lives: one that reached the Teams
      channel is attributed to you in Teams, one that stayed here is tagged Deal Room only, so nobody assumes the channel
      has seen it. It posts as you, never as the app — and when it cannot, it says so rather than posting anyway.`,
  },
  {
    id: 'rb-papers',
    act: 43,
    title: 'A finished first draft, not a blank page',
    seat: 'partner',
    steps: [{ clickText: 'Papers' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Papers. Every deal's data room arrives pre-populated — a full committee pack: the memo in Word, the deck in
      PowerPoint, the deal and returns models in Excel, drafted from the live record and dropped straight into the room.
      The team opens to a finished first draft rather than a blank page. And every document actually opens: preview in
      place, open on the web in Microsoft 365, or open in the desktop app. Nothing here is a dead link.`,
  },
  {
    id: 'rb-assistant-apply',
    act: 41,
    title: 'It proposes; a person approves',
    seat: 'partner',
    steps: [{ clickText: '💬 Ask the assistant' }, { wait: 3500 }],
    say: `Inside a deal the assistant does more than answer. It proposes concrete next steps grounded in this deal's
      state — log a blocking workstream as an issue, mark an issue resolved — and it never acts on its own. Each
      proposal is a chip you apply. Applying writes the change to the live record and a fully attributed audit entry.
      That is the governance answer to whether the AI can change things: yes, but only when a named person approves,
      and always on the record.`,
  },
  {
    id: 'rb-audit',
    act: 41,
    title: 'Who did what, when',
    seat: 'partner',
    steps: [{ closeOverlay: true }, { goto: '#/deals' }, { wait: 2500 }, { openDeal: 'Helvetia' },
      { clickText: 'Audit trail' }, { wait: 3000 }],
    say: `And the audit trail, beside the deal channel, is where that lands. Who did what and when, with a badge on
      every change the assistant applied saying it went through a person who approved it. The assistant drafts and
      proposes. The record remembers which human said yes.`,
  },
  {
    id: 'rb-specialists',
    act: 41,
    title: 'One assistant, the whole deal team behind it',
    seat: 'partner',
    steps: [{ closeOverlay: true }, { clickText: '💬 Ask the assistant' }, { wait: 3500 }],
    say: `Opened outside a deal, the same assistant answers across the portfolio. Ask a returns question and the Fund
      CFO's view comes back; ask about value creation and the Operating Partner's does. You talk to one assistant, and
      behind that single answer the right experts are pulled in — sourcing, screening, diligence, modelling, committee
      memo, value creation — and the reply tells you who weighed in. The arithmetic is the product's own. The model is
      used to interpret and explain it, not to do the sums.`,
  },
  {
    id: 'rb-sources',
    act: 42,
    title: 'Files, chats and email — governed',
    seat: 'partner',
    steps: [{ closeOverlay: true }, { clickText: '⚙' }, { wait: 3000 }, { scrollTo: 'Data source' }],
    say: `Settings, and the data sources. Connect files, chats and email and the internal agents gain governed,
      delegated access to the deal's own SharePoint files, its Teams channel and the correspondence — so a diligence
      question can draw on the real documents rather than a summary of them. The external news tool can never reach
      inside your firm's documents: that boundary is enforced and logged. And you can register your own provider —
      an internal API, a subscription you already hold — with an honest reachability test rather than a faked
      connected badge.`,
  },
  // The runbook's beat 9 also describes Settings → Document templates, for setting the fund
  // name, brand colours and confidentiality wording. That section does not exist in this
  // build — Settings offers only Data sources — so there is nothing to capture and no scene
  // for it here.
];

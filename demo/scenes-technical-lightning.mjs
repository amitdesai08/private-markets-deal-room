// The technical lightning demo, captured on its own — not cut down from the technical
// walkthrough, for the same reason scenes-lightning.mjs is standalone: a shorter story
// needs its own pacing, not a crop of the longer one's.
//
//   node demo/capture.mjs      --scenes scenes-technical-lightning.mjs --manifest scenes-technical-lightning.json
//   node demo/narrate.mjs      --manifest scenes-technical-lightning.json
//   node demo/build-player.mjs --manifest scenes-technical-lightning.json --out technical-lightning.html
//   node demo/build-video.mjs  --manifest scenes-technical-lightning.json --out technical-lightning.mp4

export { BASE } from './scenes.mjs';

export const ACTS = [
  { n: 150, title: 'Opening' },
  { n: 151, title: 'Identity — resolved server-side' },
  { n: 152, title: 'Agent isolation' },
  { n: 153, title: 'Connector governance' },
  { n: 154, title: 'Audit trail' },
  { n: 155, title: 'Footprint and deploy' },
];

export const SCENES = [
  {
    id: 'tcl-00-open',
    act: 150,
    title: 'Your tenant, your subscription, no keys',
    seat: 'admin',
    steps: [{ goto: '#/overview' }, { waitText: 'Daily briefing' }, { scrollTop: 0 }],
    say: `The Deal Room deploys with one command into your own Azure subscription and your own Microsoft Entra
      tenant. It is not multi-tenant SaaS — your data never leaves a resource group you control. Six things are
      worth your attention in the next ten minutes, and none of them are the five tabs a deal team uses.`,
  },
  {
    id: 'tcl-01-identity',
    act: 151,
    title: 'The server decides, the client only claims',
    seat: 'admin',
    steps: [{ clickText: 'All deals' }, { wait: 2500 }, { scrollTop: 0 }],
    click: 'text:All deals',
    say: `Every deal read resolves through Entra ID on the server before a row is sent to the browser. This
      administrator seat sees twenty-one deals — not a client-side filter, the number of rows the server ever
      sent. A client can state who it is; it can never widen its own access.`,
  },
  {
    id: 'tcl-02-analyst-narrower',
    act: 151,
    title: 'The same code path, a narrower seat',
    seat: 'analyst',
    keepBanner: true,
    steps: [{ selectSeat: 'analyst' }, { wait: 4000 }, { clickText: 'All deals' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Switch the identity to an analyst and the same API route now returns eight deals. There is no
      permissions table in this application — the role and the need-to-know grants live in the Entra directory
      this firm already runs, and the product reads it rather than duplicating it.`,
  },
  {
    id: 'tcl-03-agent-isolation',
    act: 152,
    title: 'Two agent classes, a hard line, checked every call',
    seat: 'admin',
    steps: [{ selectSeat: 'admin' }, { wait: 3000 }, { openDeal: 'Helvetia' }, { wait: 3000 }, { clickText: '💬 Ask the assistant' }, { wait: 2500 }],
    click: 'text:💬 Ask the assistant',
    say: `Every agent belongs to one of two classes set in a registry: internal-data agents read this firm's
      governed record and cannot reach the public web; the one external-web agent reaches the open internet and
      cannot reach a deal record. That boundary is checked on every tool call, server-side, before it runs.`,
  },
  {
    id: 'tcl-04-connectors',
    act: 153,
    title: 'Nothing reports connected until it actually is',
    seat: 'admin',
    steps: [{ closeOverlay: true }, { clickText: '⚙' }, { wait: 2000 }, { clickText: 'Data sources' }, { wait: 2500 }, { scrollTo: 'Add a data source' }],
    click: 'text:Data sources',
    say: `Every connector — free public filings, subscription market data, the firm's own Microsoft 365 mailbox,
      or a self-registered source — is tested with a real round trip, never a static badge. A self-registered
      source, including the firm's own CRM or deal database, stays pending until an administrator approves it.`,
  },
  {
    id: 'tcl-05-audit',
    act: 154,
    title: 'Every write is named, timestamped, and attributed',
    seat: 'partner',
    steps: [{ closeOverlay: true }, { selectSeat: 'partner' }, { wait: 3000 }, { openDeal: 'Helvetia' }, { wait: 3000 }, { clickText: 'Audit trail' }, { wait: 2500 }],
    click: 'text:Audit trail',
    say: `The assistant proposes; a person presses Apply, and that write is governed by the caller's own role,
      the same as a human typing it directly. The audit trail records who did what and when, with a "via
      assistant, you approved" badge on every assistant-applied change.`,
  },
  {
    id: 'tcl-06-footprint',
    act: 155,
    title: 'Six resource groups, one identity, no secrets',
    seat: 'admin',
    steps: [{ closeOverlay: true }, { scrollTop: 0 }],
    say: `The deployed footprint is six Bicep resource groups, every Azure-to-Azure call authorised by one
      user-assigned managed identity and an RBAC role assignment scoped to exactly the resource it touches. There
      is no connection string or API key anywhere in the running application. Private networking to take the data
      plane off the public internet entirely is one switch, off by default for a lean pilot.`,
  },
  {
    id: 'tcl-07-close',
    act: 155,
    title: 'Additive to what you already secure',
    seat: 'admin',
    steps: [{ wait: 500 }],
    say: `One command stands this up on your own tenant. A customer jumpstart deployment turns the demo seeding
      off with a single flag, so the store starts empty and is populated only through your own connectors. Every
      identity decision, every document and every conversation runs through the Entra ID, SharePoint and Teams this
      firm already operates — nothing new to secure separately.`,
  },
];

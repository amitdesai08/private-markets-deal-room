// Work IQ — SEED demo corpus.
//
// Populates the Work IQ experience out of the box so the capability is demoable without a
// live Microsoft 365 tenant full of deal content, and so the shared-memory notes SURVIVE a
// restart (they are re-seeded on every boot). Two things live here:
//   1) WORKIQ_SEED_NOTES  — cross-persona diligence hand-offs (the durable collaboration
//      memory shown in the deal Workspace tab and injected into later agent conversations).
//   2) The M365 work-data corpus (Teams channel messages, SharePoint files, mailbox) that
//      the Work IQ tools fall back to when the live Graph backend returns nothing — so a
//      "read the deal channel" / "find the QoE file" ask always shows real-looking content.
//
// All content is fictional and attached to the showcase deals (see app/data/deals.js ids).

// ---- 1) Shared collaboration memory (durable notes) -------------------------
export const WORKIQ_SEED_NOTES = [
  // Helvetia Diagnostics — the flagship cross-seat diligence thread.
  { id: 'wiq-seed-helv-1', dealId: 'demo-helvetia', author: 'Dr. Priya Nair', personaId: 'ai-md', personaLabel: 'AI Partner — Tech & Digital Value', role: 'deal-team',
    text: 'AI/Tech DD: data & AI readiness is a swing factor. LIMS is fragmented across 3 lab sites; ~40% of instrument telemetry is not captured, so the ~180bps digital-margin thesis is unbankable until lineage + integration are validated. Recommend a costed 100-day data-platform build before we credit any AI EBITDA.',
    sharedWith: ['supply-md', 'operating-partner', 'fund-cfo'], createdAt: '2026-07-22T09:15:00Z' },
  { id: 'wiq-seed-helv-2', dealId: 'demo-helvetia', author: 'Diego Marquez', personaId: 'supply-md', personaLabel: 'Supply Chain Partner — Operations', role: 'deal-team',
    text: 'Ops DD: reagent supply is concentrated in 2 vendors (~68% of consumables spend). SPA has a dual-sourcing clause but no signed second-source yet. Qualified Vendor B at +6% unit cost / 8-week lead time — closes the concentration risk and unlocks the COGS-out lever Priya flagged.',
    sharedWith: ['ai-md', 'operating-partner'], createdAt: '2026-07-24T14:40:00Z' },
  { id: 'wiq-seed-helv-3', dealId: 'demo-helvetia', author: 'David Osei', personaId: 'fund-cfo', personaLabel: 'Finance Partner — Fund CFO', role: 'deal-team',
    text: 'Financing: senior package ~$384m at ~4.2x confirmed with the lead bank; FX hedge on the CHF/EUR exposure priced. Base case holds 22.5% IRR / 2.76x only if the digital uplift is phased (0% base, 25–50% conditional). Do NOT underwrite full uplift into the entry model.',
    sharedWith: ['partner', 'operating-partner'], createdAt: '2026-07-26T11:05:00Z' },

  // Meridian Logistics — value-creation seat picks up the diligence trail post-close.
  { id: 'wiq-seed-meridian-1', dealId: 'demo-meridian', author: 'Dr. Priya Nair', personaId: 'ai-md', personaLabel: 'AI Partner — Tech & Digital Value', role: 'deal-team',
    text: 'Post-close AI lever: dynamic route-and-load optimisation piloted on the Midwest lane cut empty-miles ~7%. Scaling fleet-wide is the single biggest digital EBITDA lever, but depends on the telematics data contract renewal (expires Q3).',
    sharedWith: ['operating-partner', 'supply-md'], createdAt: '2026-07-20T16:20:00Z' },
  { id: 'wiq-seed-meridian-2', dealId: 'demo-meridian', author: 'Rachel Nguyen', personaId: 'operating-partner', personaLabel: 'Operating Partner — Value Creation', role: 'deal-team',
    text: '100-day plan: locking the telematics renewal as a Day-30 milestone so Priya\'s route-optimisation lever is not blocked. Tracking vs underwriting: EBITDA +8.8% but -10.9% to plan — the empty-miles lever is how we close the gap.',
    sharedWith: ['ai-md', 'partner'], createdAt: '2026-07-27T10:10:00Z' },

  // Project Sterling — commercial + finance thread in diligence.
  { id: 'wiq-seed-sterling-1', dealId: 'demo-sterling', author: 'James Whitfield', personaId: 'retail-md', personaLabel: 'Commercial Partner — Sector & Growth', role: 'deal-team',
    text: 'Commercial DD: top-10 merchant concentration is 34% of net revenue and the largest contract is up for renewal in 14 months — the key durability risk to the growth thesis. Pricing power is real (interchange-plus, 3-yr terms), but the renewal must be de-risked pre-signing.',
    sharedWith: ['fund-cfo', 'principal'], createdAt: '2026-07-25T13:30:00Z' },

  // Sound United — one seeded note to anchor the deal's Work IQ tab.
  { id: 'wiq-seed-sound-1', dealId: 'screened-1-cand-new-2', author: 'Marcus Feld', personaId: 'principal', personaLabel: 'Principal — Deal Lead', role: 'deal-team',
    text: 'Deal-lead summary to the room: readiness 21 with tax + QoE + commercial DD not started and IC ~19 days out. Two repricing items on the register (QoE trimming EBITDA ~18%, top-customer ~31%). We need the AI and Supply lanes to close their gates before we can hold the IC date.',
    sharedWith: ['ai-md', 'supply-md', 'fund-cfo', 'partner'], createdAt: '2026-07-28T08:45:00Z' },
];

// ---- 2) M365 work-data corpus (Teams / SharePoint / mailbox) ----------------
// Teams channel messages — the deal "war room" threads.
const CHANNELS = [
  { deal: 'demo-helvetia', channel: 'Helvetia Diagnostics — Deal Room', messages: [
    { from: 'Dr. Priya Nair', created: '2026-07-22T09:16:00Z', preview: 'Uploaded the AI-readiness scorecard to the data room. Headline: LIMS fragmentation is the gating item for the digital-margin thesis — see /Diligence/Tech.' },
    { from: 'Diego Marquez', created: '2026-07-24T14:41:00Z', preview: 'Vendor B second-source qualified (+6% unit cost, 8-wk lead). Sending the supply-risk memo + tariff exposure model to the channel now.' },
    { from: 'David Osei', created: '2026-07-26T11:06:00Z', preview: 'Financing package confirmed with the lead bank — $384m senior at ~4.2x. Reminder: phase the digital uplift in the entry model, do not bank 100%.' },
    { from: 'Eleanor Shellstrop', created: '2026-07-26T18:02:00Z', preview: 'Good progress. For IC I want the base case with 0% AI uplift and a clearly labelled conditional case. Marcus to own the memo spine.' },
  ] },
  { deal: 'screened-1-cand-new-2', channel: 'Sound United — Deal Room', messages: [
    { from: 'Marcus Feld', created: '2026-07-28T08:46:00Z', preview: 'Readiness 21 and IC in ~19 days. Tax, QoE and commercial DD not started — we need workstream owners to commit dates today or we slip the IC.' },
    { from: 'Dr. Priya Nair', created: '2026-07-28T10:12:00Z', preview: 'Tech/AI lane: I can turn the data-readiness pack in 5 days. The 180bps digital uplift is not bankable until then — flagging for the model.' },
    { from: 'Diego Marquez', created: '2026-07-28T10:40:00Z', preview: 'Reagent concentration (~31% top customer overlaps supply) — running the dual-sourcing and tariff analysis, memo by Thursday.' },
  ] },
  { deal: 'demo-meridian', channel: 'Meridian Logistics — Value Creation', messages: [
    { from: 'Rachel Nguyen', created: '2026-07-27T10:11:00Z', preview: 'Telematics renewal is now a Day-30 gate. Empty-miles lever is our path to closing the -10.9% variance to plan.' },
    { from: 'Dr. Priya Nair', created: '2026-07-27T12:03:00Z', preview: 'Route-and-load pilot cut empty miles ~7% on the Midwest lane. Fleet-wide scale needs the data contract renewed — aligned with Rachel\'s gate.' },
  ] },
];

// SharePoint / OneDrive files — the deal data room.
//
// The QoE and the AI & Data Readiness Scorecard used to be seeded here AND generated by
// the corpus builder, so the documents list showed "Helvetia — Quality of Earnings
// (Draft).pdf" beside "Helvetia Diagnostics — Quality of Earnings (Draft).pdf". Two
// near-identical filenames in a data room is the exact thing a deal team fears: it
// makes you stop and work out which one is current. The corpus is the single source.
const FILES = [
  { deal: 'demo-helvetia', name: 'Helvetia — Supply Risk & Dual-Sourcing Memo.docx', type: 'driveItem', summary: 'Reagent concentration 68% two-vendor; Vendor B qualification +6% / 8-wk; tariff exposure.', lastModified: '2026-07-24T14:38:00Z' },
  { deal: 'demo-helvetia', name: 'Helvetia — Sources & Uses + Debt Term Sheet.xlsx', type: 'driveItem', summary: '$384m senior at ~4.2x; sponsor equity; CHF/EUR hedge; base/downside returns.', lastModified: '2026-07-26T11:00:00Z' },
  { deal: 'screened-1-cand-new-2', name: 'Sound United — CIM.pdf', type: 'driveItem', summary: 'Confidential information memorandum; consumer-audio brand portfolio; LTM rev $375M / EBITDA $36M.', lastModified: '2026-07-18T12:00:00Z' },
  { deal: 'screened-1-cand-new-2', name: 'Sound United — Returns Model v3.xlsx', type: 'driveItem', summary: 'Entry EV $300M / 8.3x; 5.0x leverage; base 22.5% IRR / 2.76x; base/bull/bear sensitivity.', lastModified: '2026-07-27T15:45:00Z' },
  { deal: 'demo-sterling', name: 'Project Sterling — Commercial DD (Merchant Concentration).pptx', type: 'driveItem', summary: 'Top-10 merchant 34% of net revenue; largest contract renewal in 14 months; pricing power.', lastModified: '2026-07-25T13:25:00Z' },
  { deal: 'demo-meridian', name: 'Meridian — Route Optimisation Pilot Results.xlsx', type: 'driveItem', summary: 'Midwest lane empty-miles -7%; fleet-wide scale case; telematics data dependency.', lastModified: '2026-07-27T09:50:00Z' },
];

// Mailbox — banker / LP / advisor correspondence.
const MAIL = [
  { deal: 'demo-helvetia', subject: 'Helvetia — revised debt commitment + hedge indication', from: 'coverage@lead-bank.example', received: '2026-07-26T10:40:00Z', preview: 'Attaching the updated senior commitment ($384m, ~4.2x) and an indicative CHF/EUR hedge. Happy to walk the covenant headroom on a call.' },
  { deal: 'demo-helvetia', subject: 'LP query — SFDR / ILPA reporting for Helvetia', from: 'ir@northstar-lp.example', received: '2026-07-28T08:05:00Z', preview: 'Ahead of the quarter, could you confirm the SFDR classification and the ILPA-aligned reporting template you\'ll use for this position?' },
  { deal: 'screened-1-cand-new-2', subject: 'Sound United — management presentation scheduling', from: 'advisor@sellside-bank.example', received: '2026-07-19T16:30:00Z', preview: 'Proposing two slots for the mgmt session next week. Data-room access refreshed; QoE draft to follow from the accountants.' },
  { deal: 'demo-sterling', subject: 'Project Sterling — top merchant renewal timeline', from: 'partner@advisor.example', received: '2026-07-25T12:15:00Z', preview: 'Confirmed the largest merchant contract renews in ~14 months. Recommend making a pre-signing renewal discussion a condition.' },
];

// ---- tool-shaped seed results (fallback for the Work IQ M365 tools) ---------
const norm = (s) => String(s || '').toLowerCase();
function matches(hay, query) {
  const q = norm(query).trim();
  if (!q) return true;
  return q.split(/\s+/).some((t) => t.length > 2 && norm(hay).includes(t));
}

export function seedFilesResult(query, size = 10) {
  const results = FILES
    .filter((f) => matches(`${f.name} ${f.summary}`, query))
    .slice(0, size)
    .map((f) => ({ id: f.name, type: f.type, name: f.name, webUrl: undefined, lastModified: f.lastModified, summary: f.summary }));
  const out = results.length ? results : FILES.slice(0, size).map((f) => ({ id: f.name, type: f.type, name: f.name, lastModified: f.lastModified, summary: f.summary }));
  return { source: 'workiq.demo', entity: 'files', query: query || '', count: out.length, results: out, demo: true };
}

export function seedSearchResult(query, size = 10) {
  return { ...seedFilesResult(query, size), entity: 'all' };
}

export function seedMailResult({ query, user, top = 10 } = {}) {
  const results = MAIL.filter((m) => matches(`${m.subject} ${m.preview}`, query)).slice(0, top)
    .map((m) => ({ subject: m.subject, from: m.from, received: m.received, preview: m.preview, webLink: undefined }));
  const out = results.length ? results : MAIL.slice(0, top).map((m) => ({ subject: m.subject, from: m.from, received: m.received, preview: m.preview }));
  return { source: 'workiq.demo', entity: 'mail', user: user || 'deal-team@fund.example', query: query || '', count: out.length, results: out, demo: true };
}

export function seedChannelResult({ team_id, channel_id, query, top = 15 } = {}) {
  // Pick the channel whose name/deal best matches the hint (team_id/channel_id/query).
  const hint = `${team_id || ''} ${channel_id || ''} ${query || ''}`;
  let pick = CHANNELS.find((c) => matches(`${c.deal} ${c.channel}`, hint)) || CHANNELS[0];
  const results = (pick.messages || []).slice(0, top).map((m) => ({ from: m.from, created: m.created, preview: m.preview, webUrl: undefined }));
  return { source: 'workiq.demo', entity: 'channel', team_id: team_id || pick.deal, channel_id: channel_id || pick.channel, count: results.length, results, demo: true };
}

// The seeded M365 corpus for ONE deal — Teams channel, SharePoint files and mail — so the
// deal workspace can SHOW it deterministically (not only when the assistant calls a tool).
export function workiqCorpusForDeal(dealId) {
  const id = String(dealId || '').trim();
  const chan = CHANNELS.find((c) => c.deal === id) || null;
  return {
    dealId: id,
    channel: chan ? { name: chan.channel, messages: chan.messages.slice() } : null,
    files: FILES.filter((f) => f.deal === id).map((f) => ({ name: f.name, type: f.type, summary: f.summary, lastModified: f.lastModified })),
    mail: MAIL.filter((m) => m.deal === id).map((m) => ({ subject: m.subject, from: m.from, received: m.received, preview: m.preview })),
  };
}

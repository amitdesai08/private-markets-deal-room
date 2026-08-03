import { useEffect, useState } from 'react';
import { getSsoToken } from './teams';
import { af } from './authFetch';
import DealArtifacts from './DealArtifacts';
import WorkIqPanel from './WorkIqPanel';
import ChatPanel from './ChatPanel';
import Cockpit from './Cockpit';
import WorkflowDesk from './WorkflowDesk';
import ThreadsDesk from './ThreadsDesk';
import RecentActivity from './RecentActivity';
import { downloadGeneratedDoc } from './docOpen';
import DocumentDesk from './DocumentDesk';
import { renderMarkdown } from './md';
import type { Agent, Deal } from './types';

// Native Deal Workspace (single-deal scope) — brings the webapp's Stages,
// Orchestration and Deal Workspace into the tab. Reads/drives the shared backend:
// /api/deals/:id, /api/flow, launch, steps/:key/run, advance, back, teams/ensure,
// ic-readiness. The all-deals dashboard drills into this per deal.

type KeyFigure = { label: string; value: string; source?: string; confidence?: string };
type Workstream = { lane: string; owner?: string; status?: string; progress?: number; findings?: unknown[] };
type MemoSection = { key: string; title: string; status?: string; content?: string };
type DealFull = {
  id: string; company: string; sector?: string; subSector?: string; hq?: string;
  stage?: string; stageName?: string; status?: string; dealSize?: number;
  readiness?: number; daysToIC?: number; thesis?: string; keyFigures?: KeyFigure[]; workstreams?: Workstream[];
  currentStep?: string; stepNumber?: number; totalSteps?: number; completedSteps?: string[];
  workspaceReady?: boolean; memoSections?: MemoSection[]; artifacts?: Record<string, any>; workspace?: any;
  stepRuns?: Record<string, { heading?: string; markdown?: string; artifacts?: string[]; when?: string }>;
  accessLevel?: 'full' | 'status'; locked?: boolean;
};
type Verdict = { state?: string; headline?: string; gating?: string[] };
type Artifact = { key: string; label: string; complete: boolean; detail?: string };
type ReadinessDelta = {
  firstCheck?: boolean; changed?: boolean; since?: string | null;
  pct?: number | null; pctChange?: number; state?: string | null; prevState?: string | null;
  verdictChanged?: boolean; newlyBlocking?: { label: string }[]; resolved?: { label: string }[];
};
type BlockingWorkstream = { lane: string; label?: string; owner?: string | null; progress?: number; status?: string; openIssues?: number; blockingIssues?: number; reasons?: string[] };
type ICReadiness = { verdict?: Verdict; requiredArtifacts?: { items?: Artifact[] }; readinessDelta?: ReadinessDelta; blockingWorkstreams?: BlockingWorkstream[] };
type Step = { key: string; stage: string; title?: string; what?: string; produces?: string[] };
type Flow = { stages?: { id: string; name: string }[]; steps?: Step[] };

// Deep-dive market research shapes.
type Comp = { company: string; ticker?: string; dealType?: string; impliedValuation?: number; status?: string };
type Precedent = { deal: string; decision?: string; votesFor?: number; votesAgainst?: number; votesAbstain?: number };
type Benchmark = { workstream: string; total: number; byRisk?: Record<string, number>; samples?: { description?: string }[] };
type MarketIntel = { info?: { mode?: string; source?: string | null; freshness?: { label?: string } | null }; comparableDeals?: Comp[]; icPrecedents?: Precedent[]; benchmarkFindings?: Benchmark[] };
type CitationFig = { label: string; value: string; source?: string | null; sourced?: boolean };
type CitationClaim = { section: string; figure: string; sourced?: boolean; via?: string | null };
type Citations = { score?: number; totalClaims?: number; sourcedClaims?: number; unsourcedClaims?: CitationClaim[]; keyFigures?: CitationFig[]; unsourcedFigures?: CitationFig[]; clean?: boolean; summary?: string };

const STEP_LABEL: Record<string, string> = {
  O1: 'Sourcing', O2: 'Screen', O3: 'Prioritize', O4: 'Gate',
  D1: 'Plan', D2: 'Diligence', D3: 'Synthesis', D4: 'IC Approval', D5: 'Archive',
};
const LANE_LABEL: Record<string, string> = {
  commercial: 'Commercial', financial: 'Financial', legal: 'Legal', tax: 'Tax',
  techai: 'Tech / AI', operations: 'Operations', esg: 'ESG',
};
const STATUS_LABEL: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', complete: 'Complete', blocked: 'Blocked' };
const VERDICT_CLASS: Record<string, string> = { READY: 'ok', CONDITIONAL: 'warn', 'NOT-READY': 'bad' };

function relTime(iso?: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

function sourceHint(src?: string): string {
  if (!src) return '';
  const s = src.toLowerCase();
  if (/10-k|10-q|8-k|sec|edgar|form d/.test(s)) return 'As reported by the company in this SEC filing (as-filed figure, not modeled).';
  if (s.includes('screen')) return 'From the screening model (pre-diligence estimate).';
  if (s.includes('cim')) return 'From the confidential information memorandum.';
  if (s.includes('deriv')) return 'Derived from other figures on the record.';
  return `Source: ${src}.`;
}

// Raw-dollar formatter for market-intel valuations (impliedValuation is in $, not $M).
const bigMoney = (n?: number) => (n == null ? '—' : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${Math.round(n)}`);

const REGION_LABEL: Record<string, string> = { northeast: 'Northeast', southeast: 'Southeast', midwest: 'Midwest', southcentral: 'South Central', northwest: 'Northwest', southwest: 'Southwest', international: 'International' };

type Tab = 'cockpit' | 'workflow' | 'threads' | 'docdesk' | 'stages' | 'overview' | 'workspace' | 'research' | 'ic' | 'artifacts' | 'documents' | 'activity';
type ResolveTarget = { tab: Tab; step?: string };
type ActivityEntry = { actor?: string; action?: string; when?: string; via?: string | null };

// A tab label is a promise about what is behind it. Six of these used to name a
// SHAPE rather than a subject — "Overview", "Workspace", "Activity" — and three
// different labels led to workstream and readiness content, so the reader's model
// (one name, one place) broke on the first deal they opened. What that looks like
// from the outside is someone opening three tabs to find one thing and then giving
// up and asking the analyst on Teams. Every label now names its subject.
//
// The keys are code identifiers and deliberately unchanged.
const TAB_LABEL: Record<Tab, string> = {
  cockpit: 'Deal brief',
  threads: 'Deal channel',
  workflow: 'Tasks & blockers',
  ic: 'IC readiness',
  stages: 'Work the deal',
  docdesk: 'Documents',
  workspace: 'Diligence workstreams',
  artifacts: 'Returns, plan & risk',
  research: 'Comparables & precedents',
  documents: 'Generate a document',
  overview: 'Thesis & key figures',
  activity: 'Audit trail',
};

// Twelve tabs of equal weight is a wall, and the order was never designed — the
// four newest were concatenated onto the front of the original eight, which is a
// record of how the product was built rather than of how it is read. These are the
// six a deal team opens in a normal week, then a hairline, then the six they open
// rarely. Nothing is hidden and nothing moved further than one click away.
const TABS_OFTEN: Tab[] = ['cockpit', 'threads', 'workflow', 'ic', 'stages', 'docdesk'];
const TABS_RARELY: Tab[] = ['workspace', 'artifacts', 'research', 'documents', 'overview', 'activity'];
// Without the brief, the four surfaces that depend on it are not rendered at all.
const TABS_OFTEN_PLAIN: Tab[] = ['overview', 'ic', 'stages'];
const TABS_RARELY_PLAIN: Tab[] = ['workspace', 'artifacts', 'research', 'documents', 'activity'];

export default function DealDetail({ dealId, canViewStage2, canWrite, agents, deals, viewAsRole, onChanged, onClose, backLabel }: { dealId: string; canViewStage2: boolean; canWrite?: boolean; agents: Agent[]; deals: Deal[]; viewAsRole?: string; onChanged?: () => void; onClose: () => void; backLabel?: string }) {
  const [deal, setDeal] = useState<DealFull | null>(null);
  const [ic, setIc] = useState<ICReadiness | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [market, setMarket] = useState<MarketIntel | null>(null);
  const [citations, setCitations] = useState<Citations | null>(null);
  const [citationsFailed, setCitationsFailed] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  // Start on the brief. This used to start on 'overview' and switch once
  // /api/teams/config came back, so on every deal open the reader watched one screen
  // paint, began reading it, and had it replaced under them a moment later. That reads
  // as a fault. Starting here means the async call can only ever demote the tab (on an
  // instance that has turned the brief off), never yank it.
  const [tab, setTab] = useState<Tab>('cockpit');
  const [askOpen, setAskOpen] = useState(false);
  const [chatSeed, setChatSeed] = useState('');
  const [chatSeedNonce, setChatSeedNonce] = useState(0);
  const [selStep, setSelStep] = useState<string>('');
  const [busy, setBusy] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [cfg, setCfg] = useState<any>(null);
  const [docs, setDocs] = useState<{ folderUrl?: string; folders?: any[]; documents?: any[]; canWrite?: boolean; error?: string; notConnected?: boolean; provisioning?: boolean } | null>(null);
  const [docsBusy, setDocsBusy] = useState<string>('');
  const [dealGroups, setDealGroups] = useState<any[]>([]);
  const [newTag, setNewTag] = useState('');
  const [tagBusy, setTagBusy] = useState(false);
  // The cockpit is how a deal is read. Off only if the instance explicitly disables
  // it, and treated as on when the config call fails, so a blip cannot demote the
  // main surface to a fallback tab.
  const [cockpitOn, setCockpitOn] = useState(false);

  async function load(setSel = false) {
    const [d, i] = await Promise.all([
      af(`/api/deals/${dealId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      af(`/api/deals/${dealId}/ic-readiness`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setDeal(d); setIc(i);
    if (setSel && d?.currentStep) setSelStep(d.currentStep);
    return d;
  }

  // Save the deal's tags (deal groups). Server-gated to deal-team+; membership in a
  // tag's Entra group grants access to this deal (territory model).
  async function saveTags(tags: string[]) {
    setTagBusy(true);
    try {
      const r = await af(`/api/deals/${dealId}/tags`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tags }) });
      if (r.ok) { const d = await r.json(); setDeal((prev) => (prev ? { ...(prev as any), tags: d.tags } : prev)); onChanged?.(); }
      else setNote('You don’t have rights to tag this deal.');
    } finally { setTagBusy(false); }
  }
  // Add a tag: reuse an existing deal group, or (admin) create a new one — which
  // auto-provisions its Entra security group. A refused create is reported, not faked.
  async function addTag() {
    const label = newTag.trim(); if (!label) return;
    const cur = ((deal as any)?.tags || []) as string[];
    let id = dealGroups.find((g) => g.label.toLowerCase() === label.toLowerCase() || g.id === label.toLowerCase())?.id;
    if (!id) {
      const cr = await af('/api/deal-groups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label }) }).catch(() => null);
      if (cr && cr.ok) { const dg = await cr.json(); id = dg.id; setDealGroups((prev) => [...prev.filter((x) => x.id !== dg.id), dg]); }
      else {
        // Slugifying the label locally produced a chip identical to a real deal group
        // that granted access to nobody. On a clean-team boundary that is the control
        // lying about who can see the deal.
        setNote(`Could not create the deal group “${label}” — ask an administrator to add it, then tag the deal.`);
        setNewTag('');
        return;
      }
    }
    if (id && !cur.includes(id)) await saveTags([...cur, id]);
    setNewTag('');
  }

  useEffect(() => {
    setLoading(true); setNote(''); setDeal(null); setIc(null);
    // Every deal opens on its brief, including the second one you open without
    // closing the first — otherwise the tab you happened to leave behind on the last
    // deal decides how you meet the next one.
    setTab('cockpit');
    fetch('/api/flow').then((r) => r.json()).then(setFlow).catch(() => {});
    fetch('/api/config').then((r) => r.json()).then(setCfg).catch(() => {});
    fetch('/api/teams/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        const on = c ? c.cockpit !== false : true;
        setCockpitOn(on);
        // We already opened on the brief. The only job left is to fall back if this
        // instance has turned it off, and only from the tab we chose for them — never
        // out from under a tab they picked themselves in the meantime.
        if (!on) setTab((cur) => (cur === 'cockpit' ? 'overview' : cur));
      })
      .catch(() => setCockpitOn(true));
    fetch('/api/deal-groups').then((r) => r.json()).then((d) => setDealGroups(d?.dealGroups || [])).catch(() => {});
    load(true).finally(() => setLoading(false));
  }, [dealId]);

  // Lazily pull the deal's market-research deep dive (Fabric/OneLake comps,
  // IC precedents, benchmark findings) + the source-citation audit.
  useEffect(() => {
    if (tab !== 'research') return;
    if (!market) {
      const sector = encodeURIComponent(String(deal?.sector || ''));
      Promise.all([
        fetch('/api/market-intel').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        sector ? fetch(`/api/market-intel/comps?sector=${sector}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null),
      ]).then(([mi, comps]) => setMarket({ ...(mi || {}), comparableDeals: (comps && comps.length ? comps : mi?.comparableDeals) || [] }));
    }
    // A failed request left `citations` null, so the panel said "Auditing numeric
    // claims…" for as long as the tab stayed open. On a panel whose whole job is to
    // tell you how much to trust the numbers, a spinner that never resolves is worse
    // than a blunt failure.
    if (!citations) af(`/api/deals/${dealId}/citations`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then(setCitations).catch(() => setCitationsFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dealId]);

  // Lazily pull the deal's activity / audit trail whenever the Activity tab opens
  // (re-fetch each open so newly applied assistant actions show up immediately).
  useEffect(() => {
    if (tab !== 'activity') return;
    af(`/api/deals/${dealId}/activity`).then((r) => (r.ok ? r.json() : null)).then((d) => setActivity(d?.activity || [])).catch(() => setActivity([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dealId]);

  // Lazily list the deal's SharePoint data-room documents when the tab opens. The
  // data room auto-provisions on first access (no manual launch) — while that runs the
  // endpoint returns { provisioning: true }, so we poll until the folders appear.
  useEffect(() => {
    if (tab !== 'documents') return;
    let cancelled = false; let timer: any;
    setDocs(null);
    const loadDocs = () => {
      af(`/api/deals/${dealId}/documents`)
        .then(async (r) => {
          if (cancelled) return;
          const d = await r.json().catch(() => ({}));
          if (r.ok && d?.provisioning) { setDocs({ provisioning: true, canWrite: d.canWrite }); timer = setTimeout(loadDocs, 8000); return; }
          setDocs(r.ok ? d : { error: d?.error || 'The document list could not be loaded. Try again.', notConnected: !!d?.notConnected });
        })
        .catch((e) => { if (!cancelled) setDocs({ error: String(e?.message || e) }); });
    };
    loadDocs();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dealId]);

  // Generate a Word IC memo / Excel model from the live record — as the signed-in
  // user (SSO). 'download' streams a personal working copy; 'sharepoint' publishes
  // into the shared deal data room (write-gated).
  async function genDoc(kind: 'ic-memo' | 'model' | 'returns' | 'ic-deck', dest: 'download' | 'sharepoint', live = false) {
    setDocsBusy(`${kind}:${dest}${live ? ':live' : ''}`); setNote('');
    try {
      if (dest === 'download') {
        // Same path any document name in the product now uses, so there is one
        // implementation of "build it and hand it over" rather than two that drift.
        const r = await downloadGeneratedDoc(dealId, kind, live);
        if (!r.ok && r.error) setNote(r.error);
        return;
      }
      const sso = await getSsoToken();
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (sso) headers['authorization'] = `Bearer ${sso}`;
      const r = await af(`/api/deals/${dealId}/documents/${kind}?dest=${dest}${live ? '&live=1' : ''}`, { method: 'POST', headers, body: '{}' });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.document?.webUrl) window.open(d.document.webUrl, '_blank', 'noopener');
      else setNote(d?.reason || d?.error || 'Could not save the document.');
      const lr = await af(`/api/deals/${dealId}/documents`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (lr) setDocs(lr);
    } catch (e: any) {
      setNote(`Could not generate the document (${String(e?.message || e)}).`);
    } finally { setDocsBusy(''); }
  }

  async function act(label: string, url: string, body: unknown = {}) {
    setBusy(label); setNote('');
    try {
      const r = await af(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        // "Action failed (500)." told a partner recording an IC approval nothing they
        // could act on -- not whether it had been recorded, not whether to retry, not
        // whether to call someone. The status stays in the console for support.
        if (r.status === 409) setNote(`Blocked: ${data?.headline || data?.reason || 'Not IC-ready — a Partner must override to proceed.'}`);
        else if (r.status === 403) setNote('You do not have rights to do that on this deal.');
        else { console.error('deal action failed', url, r.status, data); setNote('That did not go through — nothing has changed. Try again, or contact your administrator if it keeps failing.'); }
      }
      const d = await load(true);
      if (r.ok && d) { setSelStep(d.currentStep || selStep); onChanged?.(); }
    } catch (e: any) {
      setNote(`Action failed (${String(e?.message || e)}).`);
    } finally { setBusy(''); }
  }

  // Create (or open) a Teams channel dedicated to this deal so the team can converse
  // about it. Provisions a per-deal Team + SharePoint data room via the backend.
  async function dealChannel() {
    const url = deal?.workspace?.teamsUrl;
    if (deal?.workspace?.teamsProvisioned && url) { window.open(url, '_blank', 'noopener'); return; }
    if (cfg?.m365 && cfg.m365.connected === false) { setNote('Connect M365 (from the Deal Dashboard) to create a deal channel where the team can converse.'); return; }
    setBusy('channel'); setNote('');
    try {
      const r = await af(`/api/deals/${dealId}/teams/ensure`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const data = await r.json().catch(() => ({}));
      if (r.status === 409) setNote('Launch the deal first — see "Work the deal" — then create its channel.');
      else if (!r.ok || data.error) setNote(`Could not create the deal channel${data.error ? `: ${data.error}` : ''}.${cfg?.m365?.connected === false ? ' Connect M365 first.' : ''}`);
      else { await load(true); if (data.teamsUrl) window.open(data.teamsUrl, '_blank', 'noopener'); else setNote('Deal channel created.'); }
    } catch (e: any) { setNote(`Could not create the deal channel (${String(e?.message || e)}).`); }
    finally { setBusy(''); }
  }

  // Open the deal's SharePoint data room (VDR). If not yet provisioned, provision
  // it on demand (idempotent) via the same ensure endpoint, then open it.
  async function openDataRoom() {
    const ws0 = deal?.workspace || {};
    const url = ws0.sharePointUrl;
    // Live SharePoint VDR (M365 connected & provisioned) — open it in a new tab.
    if (ws0.sharePointProvisioned && url) { window.open(url, '_blank', 'noopener'); return; }
    // Every fallback below lands on the tab labelled "Documents", which lists the
    // deal's files. It used to land on 'documents' — the tab labelled "Generate a
    // document" — so pressing "Data room" produced a screen with four IC-deck
    // buttons and no file list on it, and people concluded the product had no data
    // room and went to SharePoint in the browser instead.
    const inAppRoom: Tab = cockpitOn ? 'docdesk' : 'documents';
    if (cfg?.m365 && cfg.m365.connected === false) { setTab(inAppRoom); return; }
    setBusy('dataroom'); setNote('');
    try {
      const r = await af(`/api/deals/${dealId}/teams/ensure`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const data = await r.json().catch(() => ({}));
      if (r.status === 409) { setNote('This deal has no SharePoint data room yet — launch it first. Showing the documents already on the deal.'); setTab(inAppRoom); }
      else if (!r.ok || data.error) { setTab(inAppRoom); }
      else { const d = await load(true); const u = d?.workspace?.sharePointUrl; if (d?.workspace?.sharePointProvisioned && u) window.open(u, '_blank', 'noopener'); else setTab(inAppRoom); }
    } catch { setTab(inAppRoom); }
    finally { setBusy(''); }
  }

  const money = (n?: number) => (n == null ? '—' : n >= 1000 ? `$${(n / 1000).toFixed(1)}B` : `$${n}M`);
  const steps = flow?.steps || [];
  const curIdx = steps.findIndex((s) => s.key === deal?.currentStep);
  const completed = new Set(deal?.completedSteps || []);
  // "Knock back a stage" target — the stage immediately before the current step's
  // stage. Null when the deal is already in the first stage (nothing to knock back to).
  const curStepStage = steps.find((s) => s.key === deal?.currentStep)?.stage;
  const stageList = flow?.stages || [];
  const curStageIdx = stageList.findIndex((s) => s.id === curStepStage);
  const prevStage = curStageIdx > 0 ? stageList[curStageIdx - 1] : null;
  // What each step generates (from the flow definition) — surfaced on the Run button &
  // hero so every action describes its expected deliverable.
  const producesFor = (key?: string): string[] => { const s = steps.find((x) => x.key === key); return Array.isArray(s?.produces) ? s!.produces! : []; };
  // The Work-the-deal box shows the step's VALUE ("why" — what the firm gets from it),
  // falling back to the descriptive "what" (which the stage guide keeps).
  const whatFor = (key?: string): string => { const s = steps.find((x) => x.key === key) as any; return (typeof s?.why === 'string' && s.why) ? s.why : (typeof s?.what === 'string' ? s.what : ''); };
  const curProduces = producesFor(deal?.currentStep);
  const curWhat = whatFor(deal?.currentStep);
  const viewStep = selStep || deal?.currentStep || '';
  const artifact = deal?.artifacts?.[viewStep];
  // A run's rich, agent-authored deliverable (from "Run <step>"), if any — this is the
  // full narrative document; the structured `artifact` is the at-a-glance summary.
  const stepRun = deal?.stepRuns?.[viewStep];
  const viewProduces = producesFor(viewStep);
  const verdict = ic?.verdict;
  const ws = deal?.workspace || {};
  // Post-screening stages (Diligence D*, Execution E*, Ownership V*) are deal-team only
  // — they hold diligence findings, signed terms, financing and exit valuations.
  const inStage2 = /^[dev]/i.test(String(deal?.stage || '')) || /diligence|approval|execution|closing|signing|financing|value|monitoring|ownership|exit/i.test(String(deal?.stageName || ''));
  // Server is authoritative: it returns accessLevel 'status' when this caller is not on
  // the deal team and lacks the deal-team role tier. Fall back to the client heuristic
  // only if the backend didn't tag the payload.
  const statusOnly = deal ? (deal.accessLevel ? deal.accessLevel === 'status' : (inStage2 && !canViewStage2)) : false;

  // Where to start on this deal — deterministic, from IC readiness, IC timing and stage.
  // Deliberately NOT called the next best action any more. Three things on this deal
  // already tell you what to do next (this banner, the queue in the brief, and the
  // blocker list), they rank from different sources, and when they disagreed people
  // believed none of them. A five-branch test on two numbers cannot claim to know the
  // best action; it can honestly say where to start looking, so that is what it says.
  const nbaReadiness = deal?.readiness ?? 0;
  const nbaDays = typeof deal?.daysToIC === 'number' ? deal.daysToIC : null;
  const nbaCtx = `${deal?.stage || ''} ${deal?.stageName || ''}`;
  const nbaPostIc = /execution|closing|signing|value|exit|owned|monitor/i.test(nbaCtx);
  const nbaEvent = nbaDays != null && nbaDays >= 0 ? `IC in ${nbaDays}d` : null;
  // primaryLabel names the TAB it moves to, word for word, so the button and its
  // destination cannot drift apart.
  let nba: { title: string; reason: string; urgency: 'High' | 'Normal'; primaryLabel: string; primaryTab: Tab } | null = null;
  if (deal && !statusOnly) {
    if (nbaPostIc) {
      const isValue = /value|exit|owned|monitor/i.test(nbaCtx);
      nba = { title: isValue ? 'Monitor value creation' : 'Drive to close', reason: isValue ? 'Post-IC — track the 100-day plan and KPIs vs the underwriting.' : 'Approved at IC — advance execution and closing.', urgency: 'Normal', primaryLabel: TAB_LABEL.stages, primaryTab: 'stages' };
    } else if (nbaDays != null && nbaDays >= 0 && nbaDays <= 21 && nbaReadiness < 80) {
      nba = { title: 'Close diligence gaps before IC', reason: `IC in ${nbaDays}d but only ${nbaReadiness}% ready${verdict?.state ? ` (${verdict.state})` : ''} — resolve the open items gating readiness.`, urgency: 'High', primaryLabel: TAB_LABEL.ic, primaryTab: 'ic' };
    } else if (nbaReadiness >= 80) {
      nba = { title: 'Prepare for Investment Committee', reason: `${nbaReadiness}% ready${verdict?.state ? ` (${verdict.state})` : ''} — finalise the memo and the returns, plan and risk pages.`, urgency: (nbaDays != null && nbaDays >= 0 && nbaDays <= 14) ? 'High' : 'Normal', primaryLabel: TAB_LABEL.artifacts, primaryTab: 'artifacts' };
    } else if (nbaReadiness < 40) {
      nba = { title: 'Advance diligence', reason: `Early at ${nbaReadiness}% ready — run the diligence workstreams to progress.`, urgency: 'Normal', primaryLabel: TAB_LABEL.stages, primaryTab: 'stages' };
    } else {
      nba = { title: 'Keep diligence moving', reason: `${nbaReadiness}% ready — close the next workstream items toward IC.`, urgency: 'Normal', primaryLabel: TAB_LABEL.ic, primaryTab: 'ic' };
    }
  }

  // Top IC blockers for the Overview breakdown: missing required artifacts, else gating
  // reasons. Each carries a resolve TARGET so "Resolve" jumps to exactly where the work is
  // done (the workflow step that produces the artifact, the diligence workbench, etc.).
  const artifactTarget = (key: string): ResolveTarget => {
    if (key === 'D1' || key === 'D2' || key === 'D3') return { tab: 'stages', step: key };
    if (key === 'memo' || key === 'recommendation') return { tab: 'stages', step: 'D3' };
    if (key === 'compliance') return { tab: 'stages' };
    return { tab: 'ic' };
  };
  const gatingTarget = (label: string): ResolveTarget => {
    if (/workstream/i.test(label)) return { tab: 'workspace' };
    if (/risk/i.test(label)) return { tab: 'artifacts' };
    return { tab: 'ic' };
  };
  const icItems = ic?.requiredArtifacts?.items || [];
  const missingArtifacts = icItems.filter((a) => !a.complete).map((a) => ({ label: a.label, detail: a.detail as string | undefined, target: artifactTarget(a.key) }));
  const gatingBlockers = (verdict?.gating || []).map((g) => ({ label: g, detail: undefined as string | undefined, target: gatingTarget(g) }));
  const blockers = missingArtifacts.length ? missingArtifacts : gatingBlockers;
  const resolveBlocker = (t?: ResolveTarget) => { if (t?.step) setSelStep(t.step); setTab(t?.tab || 'ic'); };

  // "What changed since last check?" delta strip — grounded in the server-tracked mark.
  const delta = ic?.readinessDelta;
  const sinceLabel = delta?.since ? relTime(delta.since) : null;
  const hasDeltaContent = !!delta && !delta.firstCheck && (delta.changed || sinceLabel != null);

  // Diligence workbench (Workspace tab) — RYG per workstream, grounded in the deal's
  // workstream progress/status joined with the IC board's blocking reasons. No new data.
  const blockMap = new Map((ic?.blockingWorkstreams || []).map((b) => [b.lane, b]));
  const ryg = (w: Workstream): { state: 'red' | 'amber' | 'green'; reason?: string } => {
    const b = blockMap.get(w.lane);
    if (b) return { state: 'red', reason: (b.reasons && b.reasons[0]) || `${b.blockingIssues || b.openIssues || 0} blocking issue(s)` };
    if (w.status === 'blocked') return { state: 'red', reason: 'Workstream blocked' };
    if (w.status === 'complete' || (w.progress || 0) >= 80) return { state: 'green' };
    if (w.status === 'not_started' || (w.progress || 0) === 0) return { state: 'amber', reason: 'Not started' };
    return { state: 'amber', reason: `${w.progress || 0}% complete` };
  };
  const RYG_RANK: Record<string, number> = { red: 0, amber: 1, green: 2 };
  const workbench = (deal?.workstreams || [])
    .map((w) => ({ w, ...ryg(w) }))
    .sort((a, b) => RYG_RANK[a.state] - RYG_RANK[b.state] || (a.w.progress || 0) - (b.w.progress || 0));
  const atRisk = workbench.filter((r) => r.state !== 'green').length;
  const RYG_DOT: Record<string, string> = { red: 'var(--bad)', amber: 'var(--warn)', green: 'var(--good)' };

  return (
    // A deal is a PLACE, not a dialog. It takes the whole workspace so the desks
    // have room to breathe, and it keeps the .drawer* class names so the existing
    // layout rules (head / body / the chat sub-panel) apply unchanged.
    <div className="dealpage">
      <aside className="drawer">
        <div className="drawer-head">
          <button className="backbtn" onClick={onClose}>
            <span aria-hidden="true">←</span> {backLabel || 'Back'}
          </button>
          <div className="drawer-title">{deal?.company || 'Loading…'}</div>
          {/* Gated on !statusOnly. The body below already tells a restricted viewer that
              this deal is closed to them and to ask to be added; offering them the two
              doors they are locked out of, directly above that sentence, meant one of
              the two was lying. They pressed it, got a server rejection, and stopped
              believing the access message. */}
          {deal && !statusOnly ? <button className="chbtn" onClick={dealChannel} disabled={busy === 'channel'} title="Create or open a Teams channel to converse about this deal">{deal.workspace?.teamsProvisioned ? '# Open channel ↗' : busy === 'channel' ? 'Creating…' : '# Deal channel'}</button> : null}
          {deal && !statusOnly ? <button className="chbtn spo" onClick={openDataRoom} disabled={busy === 'dataroom'} title="Open the deal's SharePoint data room (VDR)">{deal.workspace?.sharePointProvisioned ? '📁 Data room ↗' : busy === 'dataroom' ? 'Opening…' : '📁 Data room'}</button> : null}
          <button className={`askbtn${askOpen ? ' on' : ''}`} onClick={() => setAskOpen((v) => !v)}>💬 {askOpen ? 'Hide the assistant' : 'Ask the assistant'}</button>
        </div>

        {askOpen && deal ? (
          <div className="drawer-chat">
              <ChatPanel agents={agents} deals={deals} focusDealId={dealId} onClose={() => setAskOpen(false)} viewAsRole={viewAsRole} canWrite={!!canWrite} seed={chatSeed} seedNonce={chatSeedNonce} />
          </div>
        ) : null}

        {loading || !deal ? (
          <div className="drawer-body"><div className="muted">{loading ? 'Loading deal workspace…' : 'Deal not found.'}</div></div>
        ) : (
          <>
            <div className="dd-topmeta">
              <div className="dd-sub">{[deal.sector, deal.subSector, deal.hq].filter(Boolean).join(' · ')}</div>
              <div className="dd-meta">
                <span className="chip">{deal.stageName || deal.stage}</span>
                <span className="chip">Step {deal.stepNumber}/{deal.totalSteps} · {STEP_LABEL[deal.currentStep || ''] || deal.currentStep}</span>
                <span className="chip">{money(deal.dealSize)}</span>
                <span className="chip">IC readiness {deal.readiness ?? 0}%</span>
                {(deal as any).region ? <span className="chip" title="Territory — visible to your regional deal team">◧ {REGION_LABEL[(deal as any).region] || (deal as any).region}</span> : null}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
                {(((deal as any).tags) || []).map((t: string) => {
                  const g = dealGroups.find((x) => x.id === t);
                  return (
                    <span key={t} title={g?.groupPending ? 'Access group being set up' : 'Deal group — members get access to this deal'} style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'var(--chip)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      #{g?.label || t}{g?.groupPending ? ' · ⏳' : ''}
                      {canViewStage2 ? <button onClick={() => saveTags((((deal as any).tags) || []).filter((x: string) => x !== t))} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button> : null}
                    </span>
                  );
                })}
                {canViewStage2 ? (
                  <>
                    <input list="dr-dealgroups" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="+ tag / deal group" style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--card)', color: 'inherit', width: 150 }} />
                    <datalist id="dr-dealgroups">{dealGroups.map((g) => <option key={g.id} value={g.label} />)}</datalist>
                    <button className="chbtn" disabled={tagBusy || !newTag.trim()} onClick={addTag}>Add</button>
                  </>
                ) : null}
              </div>
            </div>

            {nba ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 10px', padding: '11px 14px', borderRadius: 10, border: `1px solid ${nba.urgency === 'High' ? 'var(--bad-br)' : 'var(--border)'}`, background: 'var(--card)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>Where to start · {nba.title}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 999, color: nba.urgency === 'High' ? 'var(--bad)' : 'var(--muted)', background: nba.urgency === 'High' ? 'var(--bad-bg)' : 'var(--chip)' }}>{nba.urgency} urgency{nbaEvent ? ` · ${nbaEvent}` : ''}</span>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{nba.reason}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
                  <button className="chbtn" onClick={() => setTab(nba.primaryTab)}>Go to {nba.primaryLabel} ▸</button>
                  <button className="chbtn" onClick={() => setAskOpen(true)}>💬 Ask</button>
                </div>
              </div>
            ) : null}

            {!statusOnly && (
            <div className="dd-tabs">
              {(cockpitOn ? TABS_OFTEN : TABS_OFTEN_PLAIN).map((t) => (
                <button key={t} className={`dd-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{TAB_LABEL[t]}</button>
              ))}
              <span className="dd-tabdiv" aria-hidden="true" />
              {(cockpitOn ? TABS_RARELY : TABS_RARELY_PLAIN).map((t) => (
                <button key={t} className={`dd-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                  {t === 'documents' && !cockpitOn ? 'Documents' : TAB_LABEL[t]}
                </button>
              ))}
            </div>
            )}

            <div className="drawer-body">
              {statusOnly ? (
                <div className="dd-panel" style={{ padding: '22px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 22 }}>🔒</span>
                    <div style={{ fontWeight: 700 }}>Status-only view</div>
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    This deal has advanced past screening. Its workspace — diligence findings, financials, signed terms and valuations — is restricted to the deal team on a need-to-know basis. You can see where it stands in the pipeline; ask a deal-team member to be added for full access.
                  </div>
                  <div className="dd-statusgrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, marginTop: 16 }}>
                    <div><div className="muted" style={{ fontSize: 12 }}>Company</div><div style={{ fontWeight: 600 }}>{deal.company}</div></div>
                    <div><div className="muted" style={{ fontSize: 12 }}>Sector</div><div style={{ fontWeight: 600 }}>{[deal.sector, deal.subSector].filter(Boolean).join(' · ') || '—'}</div></div>
                    <div><div className="muted" style={{ fontSize: 12 }}>Deal size</div><div style={{ fontWeight: 600 }}>{money(deal.dealSize)}</div></div>
                    <div><div className="muted" style={{ fontSize: 12 }}>Stage</div><div style={{ fontWeight: 600 }}>{deal.stageName || deal.stage || '—'}</div></div>
                    <div><div className="muted" style={{ fontSize: 12 }}>Status</div><div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{deal.status || '—'}</div></div>
                    <div><div className="muted" style={{ fontSize: 12 }}>IC readiness</div><div style={{ fontWeight: 600 }}>{deal.readiness ?? 0}%</div></div>
                  </div>
                </div>
              ) : (
              <>
              {note ? <div className="dd-actionnote">{note}</div> : null}

              {cockpitOn && tab === 'cockpit' && (
                <Cockpit
                  dealId={dealId}
                  onGoTab={(t) => setTab(t as Tab)}
                  onAsk={(q) => { setChatSeed(q); setChatSeedNonce((n) => n + 1); setAskOpen(true); }}
                />
              )}

              {/* The deal's email, channel discussion and files, merged and ordered by
                  time. "What happened while I was away" is a real question and this is
                  the right place to answer it — but it is the SECOND question, and while
                  it sat above the brief it was the first thing on the tab called "Deal
                  brief", so people read the message list, decided that was the brief,
                  and never scrolled to the written case underneath it. */}
              {(tab === 'cockpit' || (!cockpitOn && tab === 'overview')) && (
                <RecentActivity
                  dealId={dealId}
                  compact
                  onOpenTab={cockpitOn ? (t) => setTab(t as Tab) : undefined}
                  onAsk={(q) => { setChatSeed(q); setChatSeedNonce((n) => n + 1); setAskOpen(true); }}
                />
              )}

              {cockpitOn && tab === 'workflow' && (
                <WorkflowDesk
                  dealId={dealId}
                  onAsk={(q) => { setChatSeed(q); setChatSeedNonce((n) => n + 1); setAskOpen(true); }}
                />
              )}

              {cockpitOn && tab === 'threads' && (
                <ThreadsDesk
                  dealId={dealId}
                  onAsk={(q) => { setChatSeed(q); setChatSeedNonce((n) => n + 1); setAskOpen(true); }}
                />
              )}

              {cockpitOn && tab === 'docdesk' && (
                <DocumentDesk
                  dealId={dealId}
                  onAsk={(q) => { setChatSeed(q); setChatSeedNonce((n) => n + 1); setAskOpen(true); }}
                />
              )}

              {tab === 'artifacts' && <DealArtifacts dealId={dealId} />}

              {tab === 'documents' && (
                <div className="dd-panel">
                  {/* This panel produces new deliverables. It used to be headed "Deal
                      documents", which is what the OTHER document tab holds, so the two
                      tabs on opposite sides of the divider both claimed the same job. */}
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>📝 Generate a document <span className="muted" style={{ fontWeight: 400 }}>— a board-ready IC memo, model or IC deck built from the live deal record. Files already on the deal live under Documents.</span></div>
                  {/* Download works for anyone with deal access — built on the requester's
                      license, no M365 connection required.
                      One filled button, not four. Four equal-weight primaries in a row is
                      not a choice, it is a wall — and the person building the pack in the
                      fortnight before committee pressed whichever word they recognised
                      first and never found the rest. All seven are still one click. */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
                    <button className="btn primary" disabled={!!docsBusy} onClick={() => genDoc('ic-deck', 'download')}>{docsBusy === 'ic-deck:download' ? 'Preparing…' : '🎤 IC deck (PowerPoint)'}</button>
                    <button className="btn" disabled={!!docsBusy} onClick={() => genDoc('ic-memo', 'download')}>{docsBusy === 'ic-memo:download' ? 'Preparing…' : '📝 IC memo (Word)'}</button>
                    <button className="btn" disabled={!!docsBusy} onClick={() => genDoc('model', 'download')}>{docsBusy === 'model:download' ? 'Preparing…' : '📊 Deal model (Excel)'}</button>
                    <button className="btn" disabled={!!docsBusy} onClick={() => genDoc('returns', 'download')}>{docsBusy === 'returns:download' ? 'Preparing…' : '💰 Returns model (Excel)'}</button>
                    <button className="btn" disabled={!!docsBusy} onClick={() => genDoc('model', 'download', true)}>{docsBusy === 'model:download:live' ? 'Preparing…' : '🔄 Deal model — live data (Excel)'}</button>
                    <a className="btn ghost" href={`/api/deals/${dealId}/model.csv`} target="_blank" rel="noopener">⬇ CSV (Excel)</a>
                    {docs?.folderUrl ? <a className="btn ghost" href={docs.folderUrl} target="_blank" rel="noopener">Open data room ↗</a> : null}
                  </div>
                  {note ? <div className="muted" style={{ marginBottom: 6 }}>{note}</div> : null}
                  {docs?.provisioning ? (
                    <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>⏳ Setting up this deal’s Teams channel &amp; SharePoint data room… this takes about a minute, and it will appear here automatically.</div>
                  ) : docs?.notConnected ? (
                    <div className="muted">Generate and download any document above now. This deal’s shared SharePoint data room is being set up and will appear here automatically.</div>
                  ) : docs?.error ? (
                    <div className="muted">The shared data room is still being prepared — you can generate and download documents above in the meantime.</div>
                  ) : !docs ? (
                    <div className="muted">Loading data room…</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
                        <button className="btn" disabled={!docs.canWrite || !!docsBusy} onClick={() => genDoc('ic-deck', 'sharepoint')}>{docsBusy === 'ic-deck:sharepoint' ? 'Saving…' : '📤 Save IC deck to data room'}</button>
                        <button className="btn" disabled={!docs.canWrite || !!docsBusy} onClick={() => genDoc('ic-memo', 'sharepoint')}>{docsBusy === 'ic-memo:sharepoint' ? 'Saving…' : '📤 Save IC memo to data room'}</button>
                        <button className="btn" disabled={!docs.canWrite || !!docsBusy} onClick={() => genDoc('model', 'sharepoint', true)}>{docsBusy === 'model:sharepoint:live' ? 'Saving…' : '📤 Save deal model to data room'}</button>
                      </div>
                      {!docs.canWrite ? <div className="muted" style={{ marginBottom: 6 }}>Read-only — publishing to the shared data room needs deal-team or partner access. You can still download your own copy.</div> : null}
                      {(docs.folders || []).length ? (
                        <div style={{ margin: '4px 0 10px' }}>
                          <div className="muted" style={{ fontWeight: 600, marginBottom: 6 }}>Data room structure</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
                            {(docs.folders || []).map((fd: any) => (
                              <a key={fd.name} href={fd.url} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}>
                                <span style={{ fontSize: 16 }}>📁</span>
                                <span style={{ fontWeight: 600, flex: 1, fontSize: 13 }}>{fd.name.replace(/^\d+_/, '')}</span>
                                {fd.childCount ? <span className="muted" style={{ fontSize: 11 }}>{fd.childCount}</span> : null}
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(docs.documents || []).length ? (docs.documents || []).map((f: any) => (
                          <a key={f.id} href={f.webUrl} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}>
                            <span style={{ fontSize: 18 }}>{/\.docx?$/i.test(f.name) ? '📝' : /\.xlsx?$/i.test(f.name) ? '📊' : '📄'}</span>
                            <span style={{ fontWeight: 600, flex: 1 }}>{f.name}</span>
                            <span className="muted">{f.modified ? new Date(f.modified).toLocaleDateString() : ''}</span>
                          </a>
                        )) : <div className="muted">No documents generated yet — use the buttons above, or drop files into the data-room folders.</div>}
                      </div>
                    </>
                  )}
                </div>
              )}

              {tab === 'stages' && (
                <>
                  {/* Quick links to the deal's collaboration surfaces — kept at the TOP so
                      they're reachable without scrolling past the stage grid. */}
                  <div className="orch-links">
                    <button className="wsp-link teams" disabled={!!busy} onClick={() => (ws.teamsProvisioned && ws.teamsUrl) ? window.open(ws.teamsUrl, '_blank', 'noopener') : dealChannel()}>{ws.teamsProvisioned ? 'Open Teams ↗' : '# Deal channel'}</button>
                    <button className="wsp-link spo" disabled={!!busy} onClick={openDataRoom}>{ws.sharePointProvisioned ? '📁 Data room ↗' : '📁 Data room'}</button>
                    <button className="wsp-link mr" onClick={() => setTab('research')}>📊 Comparables & precedents →</button>
                  </div>
                  {/* Guided "work the deal" hero — where you are in the process and the
                      single next action to move it forward, beginning to end. */}
                  <section className="dd-panel" style={{ border: '1px solid var(--accent, #2E74B5)' }}>
                    <div style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>Work the deal · {STEP_LABEL[deal.currentStep || ''] || deal.currentStep || 'Not launched'}</div>
                        <div className="muted" style={{ fontSize: 12 }}>Step {deal.stepNumber ?? 0} of {deal.totalSteps ?? 0}{deal.stageName ? ` · ${deal.stageName}` : ''}</div>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: 'var(--chip)', overflow: 'hidden', margin: '8px 0 10px' }}>
                        <div style={{ width: `${Math.min(100, Math.round(((deal.stepNumber || 0) / (deal.totalSteps || 1)) * 100))}%`, height: '100%', background: 'var(--accent, #2E74B5)' }} />
                      </div>
                      <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                        {!deal.workspaceReady
                          ? 'Launch the deal to open its workspace, then work each step in order — the assistant drafts the deliverable, you review, and Advance to the next step. Work it end-to-end to reach IC and close.'
                          : (<>Run <b>{STEP_LABEL[deal.currentStep || ''] || deal.currentStep}</b> {curProduces.length ? <>generates <b>{curProduces.join(' · ')}</b></> : 'generates this step’s deliverable'}, shown below — then Advance to the next step.{curWhat ? <span style={{ display: 'block', marginTop: 4, opacity: .85 }}>{curWhat}</span> : null}</>)}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {!deal.workspaceReady ? (
                          canViewStage2 ? (
                            <button className="btn primary" disabled={!!busy} onClick={() => act('launch', `/api/deals/${dealId}/launch`)}>{busy === 'launch' ? 'Launching…' : '▶ Launch the deal'}</button>
                          ) : <span className="muted">🔒 Launching a deal is restricted to the deal team.</span>
                        ) : (
                          <>
                            <button className="btn primary" disabled={!!busy} title={curProduces.length ? `Generates: ${curProduces.join(', ')}` : undefined} onClick={() => act('run', `/api/deals/${dealId}/steps/${deal.currentStep}/run`)}>{busy === 'run' ? 'Running…' : `⚙ Run ${STEP_LABEL[deal.currentStep || ''] || 'step'}`}</button>
                            <button className="btn" disabled={!!busy} onClick={() => act('advance', `/api/deals/${dealId}/advance`)}>{busy === 'advance' ? 'Advancing…' : 'Advance to next step →'}</button>
                            {deal.currentStep && /^d[34]/i.test(deal.currentStep) ? <button className="btn ghost" onClick={() => setTab('documents')}>📤 Generate IC deck / memo</button> : null}
                            <button className="btn ghost" disabled={!!busy} onClick={() => act('back', `/api/deals/${dealId}/back`)}>← Back a step</button>
                            {prevStage ? (
                              <button className="btn ghost" disabled={!!busy} title={`Reopen this deal at the start of ${prevStage.name}`} onClick={() => { if (window.confirm(`Knock this deal back to “${prevStage.name}”?\n\nIt will reopen at the start of that stage and any later steps will be marked incomplete.`)) act('back-stage', `/api/deals/${dealId}/back-stage`); }}>{busy === 'back-stage' ? 'Knocking back…' : `⏮ Knock back to ${prevStage.name}`}</button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="dd-panel">
                    <div className="dd-panel-h">{STEP_LABEL[viewStep] || viewStep} — deliverable{viewProduces.length ? <span className="muted" style={{ fontWeight: 400 }}> · {viewProduces.join(' · ')}</span> : null}</div>
                    {stepRun?.markdown ? (
                      <div style={{ padding: '12px 16px' }}>
                        {stepRun.when ? <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>Generated {new Date(stepRun.when).toLocaleString()}{stepRun.artifacts?.length ? ` · ${stepRun.artifacts.join(', ')}` : ''}</div> : null}
                        <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(stepRun.markdown) }} />
                      </div>
                    ) : artifact ? (
                      <div className="artifact-view">
                        <div className="av-kind">{artifact.kind || 'artifact'}</div>
                        {Array.isArray(artifact.workstreams) ? (
                          <ul className="av-list">{artifact.workstreams.map((w: any, i: number) => (<li key={i}><b>{w.label || w.key}</b>{w.adviser ? ` · ${w.adviser}` : ''}</li>))}</ul>
                        ) : Array.isArray(artifact.sections) ? (
                          <ul className="av-list">{artifact.sections.map((s: any, i: number) => (<li key={i}><b>{s.title || s.key}</b> — {s.status}</li>))}</ul>
                        ) : Array.isArray(artifact.findings) ? (
                          <ul className="av-list">{artifact.findings.slice(0, 8).map((f: any, i: number) => (<li key={i}>{f.text || f.title || JSON.stringify(f).slice(0, 100)}</li>))}</ul>
                        ) : (
                          <div className="muted">Deliverable generated. Open the full record for the complete document.</div>
                        )}
                      </div>
                    ) : (
                      <div className="dd-empty-p">No deliverable yet{viewProduces.length ? ` — running this step generates ${viewProduces.join(', ')}` : ''}. {viewStep === deal.currentStep && deal.workspaceReady ? 'Use “Run” above to generate it.' : ''}</div>
                    )}
                  </section>

                  {(flow?.stages || []).map((st) => (
                    <div className="stage-group" key={st.id}>
                      <div className="stage-name">{st.name}</div>
                      <div className="stage-steps">
                        {steps.filter((s) => s.stage === st.id).map((s) => {
                          const done = completed.has(s.key) || (curIdx >= 0 && steps.findIndex((x) => x.key === s.key) < curIdx);
                          const cur = s.key === deal.currentStep;
                          const on = s.key === viewStep;
                          const lockedStep = /^d/i.test(s.key) && !canViewStage2;
                          return (
                            <button key={s.key} className={`fstep-btn${cur ? ' cur' : ''}${done ? ' done' : ''}${on ? ' on' : ''}`} disabled={lockedStep} title={lockedStep ? 'Deal team only' : ''} style={lockedStep ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} onClick={() => { if (!lockedStep) setSelStep(s.key); }}>
                              <span className="fs-key">{lockedStep ? '🔒' : done ? '✓' : s.key}</span>
                              <span className="fs-label">{STEP_LABEL[s.key] || s.key}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* The same three actions as the hero above, repeated here because the
                      step grid is sixteen steps long and the hero has scrolled off by the
                      time you reach the bottom of it.

                      They used to DISAGREE with the hero: this bar filled "Advance →"
                      and left "Run" plain, the exact inverse of the hero, and called the
                      same POST "Launch diligence" instead of "Launch the deal". Someone
                      scrolling met a filled Advance and a filled Run, could not tell
                      which the product recommended, and on a bad day advanced a step
                      they had never run. Same words, same emphasis, both places. */}
                  <div className="orch-bar">
                    {!deal.workspaceReady ? (
                      canViewStage2 ? (
                      <button className="btn primary" disabled={!!busy} onClick={() => act('launch', `/api/deals/${dealId}/launch`)}>
                        {busy === 'launch' ? 'Launching…' : '▶ Launch the deal'}
                      </button>
                      ) : (
                        <span className="muted">🔒 Launching a deal is restricted to the deal team.</span>
                      )
                    ) : (
                      <>
                        <button className="btn primary" disabled={!!busy} title={curProduces.length ? `Generates: ${curProduces.join(', ')}` : undefined} onClick={() => act('run', `/api/deals/${dealId}/steps/${deal.currentStep}/run`)}>
                          {busy === 'run' ? 'Running…' : `⚙ Run ${STEP_LABEL[deal.currentStep || ''] || deal.currentStep}`}
                        </button>
                        <button className="btn" disabled={!!busy} onClick={() => act('advance', `/api/deals/${dealId}/advance`)}>
                          {busy === 'advance' ? 'Advancing…' : 'Advance to next step →'}
                        </button>
                        <button className="btn ghost" disabled={!!busy} onClick={() => act('back', `/api/deals/${dealId}/back`)}>← Back a step</button>
                      </>
                    )}
                  </div>
                </>
              )}

              {tab === 'overview' && (
                <>
                  <section className="dd-panel">
                    <div className="dd-panel-h" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>IC readiness</span>
                      <button className="chbtn" onClick={() => setTab('ic')}>Full board ▸</button>
                    </div>
                    <div style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {verdict?.state ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, color: verdict.state === 'READY' ? 'var(--good)' : verdict.state === 'NOT-READY' ? 'var(--bad)' : 'var(--warn)', background: verdict.state === 'READY' ? 'var(--good-bg)' : verdict.state === 'NOT-READY' ? 'var(--bad-bg)' : 'var(--warn-bg)' }}>{verdict.state}</span> : null}
                        <span style={{ fontWeight: 700 }}>{deal.readiness ?? 0}% ready</span>
                        {typeof deal.daysToIC === 'number' && deal.daysToIC >= 0 ? <span className="muted">· IC in {deal.daysToIC}d</span> : null}
                        {verdict?.headline ? <span className="muted" style={{ fontSize: 12 }}>· {verdict.headline}</span> : null}
                      </div>
                      {blockers.length ? (
                        <div style={{ marginTop: 10 }}>
                          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700, marginBottom: 4 }}>Top blockers</div>
                          {blockers.slice(0, 3).map((b, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12.5 }}>
                              <span style={{ color: 'var(--bad)' }}>○</span>
                              <span style={{ flex: 1, minWidth: 0 }}>{b.label}{b.detail ? <span className="muted"> · {b.detail}</span> : null}</span>
                              <button className="chbtn" onClick={() => resolveBlocker(b.target)}>Resolve ▸</button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>{verdict?.state === 'READY' ? 'Everything required is on record — ready for IC.' : 'IC readiness board populates once diligence is underway.'}</div>
                      )}
                      {hasDeltaContent && delta ? (
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border, #2a2a35)' }}>
                          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700, marginBottom: 6 }}>Since last check{sinceLabel ? ` · ${sinceLabel}` : ''}</div>
                          {!delta.changed ? (
                            <div className="muted" style={{ fontSize: 12 }}>No change since the last review.</div>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {typeof delta.pctChange === 'number' && delta.pctChange !== 0 ? (
                                <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 999, color: delta.pctChange > 0 ? 'var(--good)' : 'var(--bad)', background: delta.pctChange > 0 ? 'var(--good-bg)' : 'var(--bad-bg)' }}>{delta.pctChange > 0 ? '▲' : '▼'} {Math.abs(delta.pctChange)}% readiness</span>
                              ) : null}
                              {delta.verdictChanged && delta.prevState && delta.state ? (
                                <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 999, color: delta.state === 'READY' ? 'var(--good)' : delta.state === 'NOT-READY' ? 'var(--bad)' : 'var(--warn)', background: 'var(--chip)' }}>Verdict {delta.prevState} → {delta.state}</span>
                              ) : null}
                              {(delta.resolved || []).map((r, i) => (
                                <span key={`r${i}`} style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 999, color: 'var(--good)', background: 'var(--good-bg)' }}>✓ Resolved: {r.label}</span>
                              ))}
                              {(delta.newlyBlocking || []).map((b, i) => (
                                <span key={`b${i}`} style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 999, color: 'var(--bad)', background: 'var(--bad-bg)' }}>○ Newly blocking: {b.label}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </section>
                  {deal.thesis ? <p className="dd-thesis">{deal.thesis}</p> : null}
                  {deal.keyFigures?.length ? (
                    <section className="dd-panel">
                      <div className="dd-panel-h">Key figures</div>
                      <div className="dd-figs">
                        {deal.keyFigures.map((f, i) => (
                          <div className="dd-fig" key={i} title={sourceHint(f.source)}>
                            <div className="fig-v">{f.value}</div>
                            <div className="fig-l">{f.label}</div>
                            {f.source ? <div className="fig-src">source: {f.source}{f.confidence ? ` · ${f.confidence} confidence` : ''}</div> : null}
                          </div>
                        ))}
                      </div>
                      <div className="dd-note">Hover a figure to see where it came from. Figures sourced from an SEC form are the values the company reported in that filing (as-filed, not modeled).</div>
                    </section>
                  ) : null}
                  {deal.workstreams?.length ? (
                    <section className="dd-panel">
                      {/* A summary. The full thing is the tab called "Diligence
                          workstreams" — this panel used to carry that exact name too, so
                          people opened both tabs every time to work out which one had the
                          number they wanted. Read-only viewers land here and this is the
                          only workstream signal they get, so it stays. */}
                      <div className="dd-panel-h">Workstream progress<span className="muted" style={{ fontWeight: 400 }}>summary — full detail under Diligence workstreams</span></div>
                      <div className="dd-lanes">
                        {deal.workstreams.map((w, i) => (
                          <div className="dd-lane" key={i}>
                            <div className="lane-top"><span className="lane-name">{LANE_LABEL[w.lane] || w.lane}</span><span className="lane-status">{STATUS_LABEL[w.status || ''] || w.status || '—'}</span></div>
                            <div className="lane-bar"><span style={{ width: `${Math.max(0, Math.min(100, w.progress ?? 0))}%` }} /></div>
                            <div className="lane-owner">{w.owner || 'unassigned'}{w.findings?.length ? ` · ${w.findings.length} finding(s)` : ''}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </>
              )}

              {tab === 'workspace' && (
                <>
                  <WorkIqPanel dealId={dealId} canWrite={!!canWrite} onAsk={(p) => { setChatSeed(p); setChatSeedNonce((n) => n + 1); setAskOpen(true); }} />
                  {workbench.length ? (
                    <section className="dd-panel">
                      <div className="dd-panel-h" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Workstream status</span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 999, color: atRisk ? 'var(--bad)' : 'var(--muted)', background: atRisk ? 'var(--bad-bg)' : 'var(--chip)' }}>{atRisk ? `${atRisk} at risk` : 'All on track'}</span>
                      </div>
                      <div style={{ padding: '4px 14px 14px' }}>
                        {workbench.map(({ w, state, reason }, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: i ? '1px solid var(--border, #23232c)' : 'none' }}>
                            <span style={{ flex: '0 0 auto', width: 9, height: 9, borderRadius: 999, background: RYG_DOT[state] }} title={state.toUpperCase()} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{LANE_LABEL[w.lane] || w.lane}<span className="muted" style={{ fontWeight: 400 }}> · {STATUS_LABEL[w.status || 'not_started'] || w.status}{w.owner ? ` · ${w.owner}` : ''}</span></div>
                              {reason ? <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>{state === 'red' ? '⚠ ' : ''}{reason}</div> : null}
                            </div>
                            <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 64, height: 5, borderRadius: 999, background: 'var(--chip)', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, w.progress || 0)}%`, height: '100%', background: RYG_DOT[state] }} /></div>
                              <span className="muted" style={{ fontSize: 11.5, width: 30, textAlign: 'right' }}>{w.progress || 0}%</span>
                              {state === 'red' ? <button className="chbtn" onClick={() => { setSelStep('D2'); setTab('stages'); }}>Resolve ▸</button> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <section className="dd-panel">
                    <div className="dd-panel-h">Deal workspace<span className="muted">set up by {ws.provisionedBy || '—'}</span></div>
                    <div className="wsp-links">
                      <button className="wsp-link teams" disabled={!!busy} onClick={() => (ws.teamsProvisioned && ws.teamsUrl) ? window.open(ws.teamsUrl, '_blank', 'noopener') : dealChannel()}>{ws.teamsProvisioned ? 'Open in Teams ↗' : busy === 'channel' ? 'Creating…' : 'Create Teams space ↗'}</button>
                      <button className="wsp-link spo" disabled={!!busy} onClick={openDataRoom}>{ws.sharePointProvisioned ? 'Open data room ↗' : busy === 'dataroom' ? 'Opening…' : 'Data room ↗'}</button>
                    </div>
                    <div className="ws-grid">
                      <div className="ws-row"><span>Teams channel</span><span>{ws.teamsProvisioned ? (ws.teamsChannelName || 'active') : 'not set up'}</span></div>
                      <div className="ws-row"><span>Data room (VDR)</span><span>{ws.sharePointProvisioned ? `${(ws.folders || []).length} folders · live` : 'not set up'}</span></div>
                      <div className="ws-row"><span>DD checklist</span><span>{deal.workspace?.checklist ? `${(deal as any).checklistStats?.pct ?? 0}% · ${(deal as any).checklistStats?.total ?? (ws.checklist || []).reduce((n: number, s: any) => n + (s.items?.length || 0), 0)} items` : '—'}</span></div>
                      <div className="ws-row"><span>Templates</span><span>{(ws.templates || []).length} docs</span></div>
                      <div className="ws-row"><span>IC date</span><span>{ws.icDate ? new Date(ws.icDate).toLocaleDateString() : '—'}</span></div>
                    </div>
                    {!ws.teamsProvisioned || !ws.sharePointProvisioned ? (
                      <div className="orch-bar">
                        <button className="btn" disabled={!!busy} onClick={() => act('teams', `/api/deals/${dealId}/teams/ensure`)}>
                          {busy === 'teams' ? 'Setting up…' : '☁ Set up team space + data room'}
                        </button>
                      </div>
                    ) : null}
                  </section>

                  {(ws.folders || []).length ? (
                    <section className="dd-panel">
                      <div className="dd-panel-h">📁 Data room<span className="muted">{(ws.folders || []).length} folders (VDR)</span></div>
                      <div className="vdr-grid">
                        {(ws.folders || []).map((f: any, i: number) => (
                          f.url
                            ? <a className="vdr-folder" key={i} href={f.url} target="_blank" rel="noreferrer">📁 {f.name}</a>
                            : <span className="vdr-folder muted" key={i}>📁 {f.name}</span>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {Array.isArray(ws.swimlanes) && ws.swimlanes.length ? (
                    <section className="dd-panel">
                      <div className="dd-panel-h">Every workstream on this deal<span className="muted">{ws.swimlanes.length} workstreams</span></div>
                      <div className="dd-lanes" style={{ padding: '0 14px 14px' }}>
                        {ws.swimlanes.map((s: any, i: number) => (
                          <div className="dd-lane" key={i}>
                            <div className="lane-top"><span className="lane-name">{s.label || LANE_LABEL[s.lane] || s.lane}</span><span className="lane-status">{s.advisor || s.md || s.owner || 'unassigned'}</span></div>
                            {s.channelUrl ? <a className="lane-owner" href={s.channelUrl} target="_blank" rel="noreferrer">Teams channel ↗</a> : null}
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {(ws.templates || []).length ? (
                    <section className="dd-panel">
                      <div className="dd-panel-h">▤ Playbook templates<span className="muted">{(ws.templates || []).length} docs</span></div>
                      <div className="tpl-list">
                        {(ws.templates || []).map((t: any, i: number) => (
                          t.url
                            ? <a className="tpl-row" key={i} href={t.url} target="_blank" rel="noreferrer"><span className="tpl-name">{t.name}</span><span className="chip">{t.type || t.ext || 'doc'}</span></a>
                            : <div className="tpl-row" key={i}><span className="tpl-name">{t.name}</span><span className="chip">{t.type || t.ext || 'doc'}</span></div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </>
              )}

              {tab === 'research' && (
                <>
                  <section className="dd-panel">
                    <div className="dd-panel-h">Why this matters for {deal.company}<span className="muted">deal-scoped context</span></div>
                    <div style={{ padding: '10px 16px', fontSize: 12.5, color: 'var(--muted)' }}>
                      {`Market signals below are scoped to ${deal.sector || 'this deal'}${deal.subSector && deal.subSector !== deal.sector ? ` · ${deal.subSector}` : ''} and read as support for the investment decision — comparable transactions to anchor entry valuation, IC precedents to calibrate the ask, and benchmark findings to pressure-test the thesis${blockers.length ? ` and the open blockers (${blockers.slice(0, 2).map((b) => b.label).join(', ')})` : ''}.`}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 16px 12px' }}>
                      <span className="chip">{(market?.comparableDeals || []).length} comparables</span>
                      <span className="chip">{(market?.icPrecedents || []).length} IC precedents</span>
                      <span className="chip">{(market?.benchmarkFindings || []).length} benchmark themes</span>
                      {market?.info?.freshness?.label ? <span className="chip">as-of {market.info.freshness.label}</span> : null}
                    </div>
                  </section>

                  <section className="dd-panel">
                    <div className="dd-panel-h">Comparable &amp; historical deals<span className="muted">{market?.info?.source ? `${market.info.source}${market.info.freshness?.label ? ` · ${market.info.freshness.label}` : ''}` : 'Market data'}</span></div>
                    {!market ? <div className="dd-empty-p">Loading market intelligence…</div> : !(market.comparableDeals || []).length ? <div className="dd-empty-p">No comparables for this sector.</div> : (
                      <div className="mr-list">
                        {(market.comparableDeals || []).slice(0, 8).map((c, i) => (
                          <div className="mr-row" key={i}>
                            <span className="mr-name">{c.company}{c.ticker ? <span className="chip">{c.ticker}</span> : null}</span>
                            <span className="mr-val">{c.dealType || '—'} · {bigMoney(c.impliedValuation)}</span>
                            {c.status ? <span className={`chip ${String(c.status).toLowerCase().replace(/\s+/g, '-')}`}>{c.status}</span> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="dd-panel">
                    <div className="dd-panel-h">IC voting precedents</div>
                    {!(market?.icPrecedents || []).length ? <div className="dd-empty-p">No precedents loaded.</div> : (
                      <div className="mr-list">
                        {(market!.icPrecedents || []).slice(0, 8).map((p, i) => (
                          <div className="mr-row" key={i}>
                            <span className="mr-name">{p.deal}</span>
                            <span className="mr-val">{p.decision} · {(p.votesFor ?? 0)}–{(p.votesAgainst ?? 0)}{typeof p.votesAbstain === 'number' ? `–${p.votesAbstain}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(market?.benchmarkFindings || []).length ? (
                      <div style={{ padding: '4px 14px 14px' }}>
                        <div className="dd-panel-h" style={{ padding: '8px 0', border: 'none' }}>Benchmark findings by workstream</div>
                        <div className="cand-tags">
                          {(market!.benchmarkFindings || []).map((w) => (
                            <span className="chip" key={w.workstream} title={(w.samples || []).map((s) => s.description).filter(Boolean).join(' · ')}>
                              {w.workstream} · {w.total}{(w.byRisk?.Critical || w.byRisk?.High) ? ` · ${(w.byRisk?.Critical || 0) + (w.byRisk?.High || 0)} hi-risk` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <section className="dd-panel">
                    <div className="dd-panel-h">Source-citation audit<span className={`chip ${citations?.clean ? 'ok' : 'warn'}`}>{citations ? `${citations.score ?? 0}% traceable` : citationsFailed ? 'unavailable' : '…'}</span></div>
                    {!citations ? (
                      citationsFailed
                        ? <div className="dd-empty-p">The source audit could not be run just now. <button className="askbtn" onClick={() => { setCitationsFailed(false); af(`/api/deals/${dealId}/citations`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then(setCitations).catch(() => setCitationsFailed(true)); }}>Try again</button></div>
                        : <div className="dd-empty-p">Auditing numeric claims…</div>
                    ) : (
                      <div style={{ padding: '10px 14px 14px' }}>
                        <div className="muted" style={{ marginBottom: 8 }}>{citations.summary}</div>
                        {(citations.keyFigures || []).length ? (
                          <div className="dd-figs">
                            {(citations.keyFigures || []).map((f, i) => (
                              <div className="dd-fig" key={i} title={f.source || 'no source'}>
                                <div className="fig-v">{f.value}</div>
                                <div className="fig-l">{f.label}</div>
                                <div className="fig-src">{f.sourced ? `source: ${f.source}` : '⚠ unsourced'}</div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {(citations.unsourcedClaims || []).length ? (
                          <div style={{ marginTop: 10 }}>
                            <div className="mr-name" style={{ marginBottom: 6 }}>Unsourced memo figures</div>
                            <div className="cand-tags">
                              {(citations.unsourcedClaims || []).slice(0, 12).map((c, i) => (<span className="chip warn" key={i} title={c.section}>{c.figure}</span>))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </section>
                </>
              )}

              {tab === 'ic' && (
                <section className="dd-panel">
                  <div className="dd-panel-h">IC readiness</div>
                  {verdict ? (
                    <div className={`verdict ${VERDICT_CLASS[verdict.state || ''] || ''}`}>
                      <span className="verdict-state">{verdict.state}</span>
                      <span className="verdict-head">{verdict.headline}</span>
                    </div>
                  ) : <div className="dd-empty-p">IC readiness available once diligence is underway.</div>}
                  {(ic?.requiredArtifacts?.items || []).length ? (
                    <div className="dd-artifacts">
                      {ic!.requiredArtifacts!.items!.map((a) => (
                        <div key={a.key} className={`artifact ${a.complete ? 'done' : 'todo'}`}>
                          <span className="a-ic">{a.complete ? '✓' : '○'}</span>
                          <span className="a-label">{a.label}</span>
                          {a.detail ? <span className="a-detail">{a.detail}</span> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              )}

              {tab === 'activity' && (
                <section className="dd-panel">
                  <div className="dd-panel-h">Activity &amp; audit trail<span className="muted">who did what, and when</span></div>
                  <div style={{ padding: '4px 14px 14px' }}>
                    {activity == null ? <div className="muted" style={{ fontSize: 12, padding: '8px 0' }}>Loading activity…</div>
                      : !activity.length ? <div className="muted" style={{ fontSize: 12, padding: '8px 0' }}>No activity recorded yet.</div>
                      : activity.map((a, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--border, #23232c)' : 'none' }}>
                          <span style={{ flex: '0 0 auto', width: 7, height: 7, marginTop: 5, borderRadius: 999, background: a.via === 'assistant' ? 'var(--accent, #6264A7)' : 'var(--muted, #8a8a94)' }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5 }}>{a.action}</div>
                            <div className="muted" style={{ fontSize: 11, marginTop: 1 }}>
                              {a.actor || 'System'}{a.when ? ` · ${relTime(a.when) || new Date(a.when).toLocaleString()}` : ''}
                              {a.via === 'assistant' ? <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, color: 'var(--accent)', background: 'var(--chip)' }}>via assistant · you approved</span> : null}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
              )}
              </>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

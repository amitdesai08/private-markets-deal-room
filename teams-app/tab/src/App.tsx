// Root shell for the Deal Room console (served both inside Teams and standalone).
// Owns: the top bar (persona / role badges + "sign in as" demo-profile and
// "view as" role switchers), the main tab nav (Overview · Stage 1 · Stage 2 ·
// Lifecycle · Fund & Portfolio), the collapsible agents panel, and the deal-detail
// overlay. Access state (which agents/tabs the caller may see) comes from the
// orchestrator via POST /api/teams/context; all data calls proxy to /api on the
// shared backend. Add a new main tab by extending the mainTab union + the nav map.
import { useEffect, useState } from 'react';
import { initTeams, getSsoToken, toggleTheme, type TeamsInfo } from './teams';
import { af, setAuthContext } from './authFetch';
import Dashboard from './Dashboard';
import AgentGuide from './AgentGuide';
import ChatPanel from './ChatPanel';
import DealDetail from './DealDetail';
import Stage1 from './Stage1';
import Deals from './Deals';
import Fund from './Fund';
import PowerBI from './PowerBI';
import Settings from './Settings';
import IntakeWizard from './IntakeWizard';
import AdminGroups from './AdminGroups';
import Offline, { OnlineLeaseBanner, type PlatformStatus } from './Offline';
import type { Agent, Analytics, BackendConfig, Deal, MarketIntel, Persona, Pipeline } from './types';

type TeamsConfig = { demoMode: boolean; backend: string; sso: boolean; bot: boolean; backendUrl?: string; appBaseUrl?: string };

// The user talks to ONE assistant. It fronts the orchestrator, which brings in the
// right specialist agents (sourcing, screening, diligence, modeling, IC-memo,
// value-creation) server-side, scoped to the caller's role/persona. We deliberately
// never present the specialists as separately selectable chat targets.
const ORCHESTRATOR: Agent = {
  key: 'orchestrator', label: 'Deal Room Assistant', subtitle: 'Ask about any deal, the pipeline or the portfolio', initials: 'DR', kind: 'orchestrator',
  starters: [
    'List every deal with its stage, status and IC readiness.',
    'Which deal is the highest priority right now, and why?',
    'Where is the pipeline light — what should we source next?',
  ],
};

export default function App() {
  const [teamsInfo, setTeams] = useState<TeamsInfo | null>(null);
  const [theme, setTheme] = useState<string>('default');
  const [cfg, setCfg] = useState<TeamsConfig | null>(null);
  const [persona, setPersona] = useState<Persona>(null);
  const [config, setConfig] = useState<BackendConfig | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [market, setMarket] = useState<MarketIntel | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsError, setDealsError] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([ORCHESTRATOR]);
  // Agents panel starts collapsed — it opens on an explicit "Ask" action so the
  // dashboard isn't crowded on first load.
  const [chatOpen, setChatOpen] = useState(false);
  const [chatFocusDealId, setChatFocusDealId] = useState('');
  const [chatSeed, setChatSeed] = useState('');
  const [chatSeedNonce, setChatSeedNonce] = useState(0);
  const [openDealId, setOpenDealId] = useState('');
  const [canViewStage2, setCanViewStage2] = useState(true);
  const [canWrite, setCanWrite] = useState(true);
  const [accFlash, setAccFlash] = useState(false);
  const [demoUsers, setDemoUsers] = useState<{ id: string; upn: string; label: string; name?: string; roleLabel?: string; agentCount?: number }[]>([]);
  const [viewAs, setViewAs] = useState('');
  // Access profile from the orchestrator: which agents this user may use, and
  // the roles they can "view as" (own role + any lower in the hierarchy).
  const [allowedPersonas, setAllowedPersonas] = useState<string[] | null>(null);
  const [viewAsRole, setViewAsRole] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  // A legacy channel tab pinned with ?view=report opens straight to the in-app
  // Report tab (the standalone Power BI report tab is now folded into the app).
  //
  // The nav was seven tabs, four of which (Stage 1-4) were the SAME list of deals
  // filtered by a stage prefix. A stage is a property of a deal, not a place in the
  // product, and a partner had to know which tab a deal lived in before they could look
  // for it. `stage1`-`stage4` are kept as accepted values so a pinned Teams tab or a
  // bookmarked URL still resolves rather than 404-ing into an empty screen.
  type MainTab = 'overview' | 'sourcing' | 'deals' | 'fund' | 'report';
  const legacyTab = (v: string | null): MainTab => {
    if (v === 'report') return 'report';
    if (v === 'stage1' || v === 'sourcing') return 'sourcing';
    if (v === 'stage2' || v === 'stage3' || v === 'stage4' || v === 'deals') return 'deals';
    if (v === 'fund') return 'fund';
    return 'overview';
  };
  const [mainTab, setMainTab] = useState<MainTab>(legacyTab(new URLSearchParams(window.location.search).get('view')));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [adminGroupsOpen, setAdminGroupsOpen] = useState(false);
  // Platform power state (sleep/wake). null until first probe; when control is on and
  // the orchestrator is asleep, the whole app is replaced by the Offline gate.
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [ssoToken, setSsoToken] = useState<string>('');

  // Only surface the agents this user (or the role they are viewing as) may use.
  // Demo mode showcases the whole role's roster; a real (non-demo) user sees only
  // the orchestrator plus THEIR OWN persona — not every persona in their tier.
  const isDemoMode = demoUsers.length > 0;
  const visibleAgents = agents.filter((a) => {
    if (a.kind === 'orchestrator') return true;
    if (isDemoMode) return !allowedPersonas || (a.persona ? allowedPersonas.includes(a.persona) : false);
    return !!(a.persona && persona?.id && a.persona === persona.id);
  });

  const mainTabs: [typeof mainTab, string][] = [
    ['overview', 'Home'], ['sourcing', 'Sourcing'], ['deals', 'Deals'], ['fund', 'Fund & Portfolio'],
    ['report', 'Report'],
  ];

  // The breadcrumb names the exact view you came from, so going back is a known
  // destination rather than a guess. `mainTab` is never cleared when a deal opens,
  // which is what makes that promise true.
  const backLabel = mainTabs.find(([k]) => k === mainTab)?.[1] || 'Home';
  const openDealName = deals.find((d) => d.id === openDealId)?.company || '';

  function applyAccess(ctx: any) {
    if (!ctx) return;
    if (ctx.persona) setPersona(ctx.persona);
    setCanViewStage2(!!ctx.canViewStage2);
    setCanWrite(ctx.canWrite !== false);
    if (Array.isArray(ctx.allowedPersonas)) setAllowedPersonas(ctx.allowedPersonas);
    if (typeof ctx.roleLabel === 'string') setRoleLabel(ctx.roleLabel);
    setIsAdmin(!!ctx.isAdmin);
  }

  useEffect(() => {
    (async () => {
      setTeams(await initTeams());
      setTheme(document.documentElement.dataset.theme || 'default');
      // SSO token identifies the caller so /platform/status can report isAdmin (the
      // "keep online indefinitely" path is admin-only). Absent outside Teams — fine.
      const tok = await getSsoToken().catch(() => null);
      if (tok) { setSsoToken(tok); setAuthContext({ ssoToken: tok }); }
      fetch('/api/platform/status', tok ? { headers: { authorization: `Bearer ${tok}` } } : undefined)
        .then((r) => r.json()).then(setPlatform).catch(() => setPlatform(null));
      fetch('/api/teams/config').then((r) => r.json()).then(setCfg).catch(() => {});
      // af(), not fetch(): /api/analytics is now scoped to the caller, so it has to be
      // asked as somebody. A bare fetch would carry no identity and the numbers would
      // silently revert to the whole book — which is the leak these counters started as.
      af('/api/analytics').then((r) => r.json()).then(setAnalytics).catch(() => {});
      fetch('/api/pipeline').then((r) => r.json()).then(setPipeline).catch(() => {});
      fetch('/api/market-intel').then((r) => r.json()).then(setMarket).catch(() => {});
      loadDeals();

      fetch('/api/config').then((r) => r.json()).then((backendCfg: BackendConfig) => {
        setConfig(backendCfg);
        // Single-agent surface: the user only ever talks to the one assistant; it
        // brings in the specialist agents server-side. We deliberately do NOT list
        // the persona agents as separately selectable chat targets.
        setAgents([ORCHESTRATOR]);
      }).catch(() => {});

      getSsoToken().then((token) =>
        fetch('/api/teams/context', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ssoToken: token }) }).then((r) => r.json())
      ).then((ctx) => {
        applyAccess(ctx);
        if (Array.isArray(ctx?.demoUsers)) {
          setDemoUsers(ctx.demoUsers);
          // Demo mode: start the showcase as the first profile (Administrator) so the
          // full access model is visible; real Teams users keep their SSO identity.
          if (ctx.demoUsers.length) setViewAs((v: string) => v || ctx.demoUsers[0].id);
        }
      }).catch(() => {});
    })();
  }, []);

  // Re-evaluate access when the demo "view as" profile or the "view as role"
  // changes. Both drive the orchestrator's access profile server-side, so we
  // skip the (slow) SSO token fetch here to keep switching instant. With no demo
  // profile selected (real SSO users) we send no override.
  useEffect(() => {
    if (!viewAs) return;
    (async () => {
      // Identity for deal need-to-know follows the demo "view as" selection + role.
      setAuthContext({ as: viewAs, viewAsRole });
      const ctx = await fetch('/api/teams/context', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ as: viewAs, viewAsRole }) }).then((r) => r.json()).catch(() => null);
      applyAccess(ctx);
      // Re-pull the pipeline as the newly selected identity so status-only / hidden
      // deals are reflected in the list.
      loadDeals();
    })();
  }, [viewAs, viewAsRole]);

  // Pulse the showcase banner whenever the access profile changes, so a persona switch
  // visibly changes what the seat can access (not just the answer framing).
  useEffect(() => {
    if (!viewAs) return;
    setAccFlash(true);
    const id = setTimeout(() => setAccFlash(false), 1500);
    return () => clearTimeout(id);
  }, [viewAs, roleLabel, canWrite, canViewStage2]);

  // Critical data load with an explicit failure/retry state, so a transient API error
  // degrades to "last known data + Retry" instead of a silent blank.
  function loadDeals() {
    return af('/api/deals')
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d) => { if (Array.isArray(d)) setDeals(d); setDealsError(false); })
      .catch(() => setDealsError(true));
  }

  async function refreshData() {
    loadDeals();
    af('/api/analytics').then((r) => r.json()).then(setAnalytics).catch(() => {});
    fetch('/api/pipeline').then((r) => r.json()).then(setPipeline).catch(() => {});
  }

  function askAbout(dealId: string) {
    setChatFocusDealId(dealId);
    setChatOpen(true);
  }

  // A suggested question from the portfolio briefing. It seeds the composer rather
  // than sending: the user still reads and edits before anything is asked on their
  // behalf, which is the same rule the deal cockpit follows.
  function askQuestion(q: string) {
    setChatFocusDealId('');
    setChatSeed(q);
    setChatSeedNonce((n) => n + 1);
    setChatOpen(true);
  }

  async function extendLease() {
    try {
      const s: PlatformStatus = await fetch('/api/platform/wake', {
        method: 'POST',
        headers: ssoToken ? { 'content-type': 'application/json', authorization: `Bearer ${ssoToken}` } : { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'hour', ssoToken: ssoToken || undefined }),
      }).then((r) => r.json());
      setPlatform(s);
    } catch { /* ignore */ }
  }

  // Platform asleep (power control on, orchestrator offline) → show the wake gate.
  if (platform && platform.control && !platform.online) {
    return <Offline status={platform} ssoToken={ssoToken} />;
  }

  return (
    <div className="appwrap">
      <style>{GLOBAL_CSS}</style>

      {platform ? <OnlineLeaseBanner status={platform} onExtend={extendLease} /> : null}

      <header className="topbar">
        <div className="brand">
          <div className="logo">◆</div>
          <div>
            <div className="brand-t">Deal Dashboard</div>
            <div className="brand-s">Deal flow, market intel and your team’s AI assistant — in one place</div>
          </div>
        </div>
        <div className="topbar-r">
          {persona?.name ? <span className="badge" title="Signed-in persona">{persona.name}</span> : null}
          {roleLabel ? <span className="badge" title="Your role">{isAdmin ? '★ ' : ''}{roleLabel}</span> : null}
          {demoUsers.length ? (
            <select className="viewas" value={viewAs} onChange={(e) => { setViewAsRole(''); setViewAs(e.target.value); }} title="Sign in as one of the showcase profiles to see their view and access">
              {demoUsers.map((u) => (<option key={u.id} value={u.upn}>👤 {u.label}</option>))}
            </select>
          ) : null}
          {teamsInfo?.inTeams ? <a className="dashlink" href={cfg?.appBaseUrl || window.location.origin} target="_blank" rel="noopener noreferrer">Open web console ↗</a> : null}
          {canViewStage2 ? <button className="asktoggle" onClick={() => setIntakeOpen(true)} title="Create a new deal via guided intake">+ New deal</button> : null}
          {isAdmin ? <button className="gearbtn" onClick={() => setAdminGroupsOpen(true)} title="Admin — deal groups &amp; territories" aria-label="Deal groups and territories"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }} aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg></button> : null}
          <button className={`asktoggle${chatOpen ? ' on' : ''}`} onClick={() => setChatOpen((v) => !v)}>{chatOpen ? 'Hide agents' : '💬 Ask agents'}</button>
          <button className="gearbtn" onClick={() => setTheme(toggleTheme())} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-label="Toggle light or dark theme">{theme === 'dark' ? '☀' : '🌙'}</button>
          <button className={`gearbtn${settingsOpen ? ' on' : ''}`} onClick={() => setSettingsOpen((v) => !v)} title="Settings — data sources & administration" aria-label="Settings">⚙</button>
        </div>
      </header>

      {viewAs ? (
        <>
          <style>{`
            .sbn { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:6px 12px 0; padding:7px 12px; border-radius:8px; border:1px solid var(--border); background:var(--card); color:var(--muted); font-size:12px; line-height:1.4; }
            .sbn strong { color: var(--fg); }
            .sbn.flash { animation: sbnflash 1.5s ease-out; }
            @keyframes sbnflash { 0% { border-color: var(--accent); box-shadow: 0 0 0 2px var(--chip); } 100% { border-color: var(--border); box-shadow: none; } }
            .sbn-chips { display:flex; flex-wrap:wrap; gap:6px; margin-left:auto; }
            .sbn-chip { font-size:11px; font-weight:600; padding:1px 8px; border-radius:999px; border:1px solid var(--border); white-space:nowrap; }
            .sbn-chip.on { color: var(--good); border-color: var(--good-br); }
            .sbn-chip.off { color:var(--muted); }
          `}</style>
          <div role="note" className={`sbn${accFlash ? ' flash' : ''}`}>
            <span>Showcase mode — viewing as <strong>{persona?.name || viewAs}</strong>. Their <strong>role</strong> controls what they can access (RBAC is still enforced); the <strong>persona lens</strong> controls how the assistant frames answers for that seat.</span>
            <span className="sbn-chips">
              <span className="sbn-chip">{isAdmin ? '★ ' : ''}{roleLabel || 'role'}</span>
              <span className={`sbn-chip ${canWrite ? 'on' : 'off'}`}>{canWrite ? 'Can act · write' : 'Read-only'}</span>
              <span className={`sbn-chip ${canViewStage2 ? 'on' : 'off'}`}>{canViewStage2 ? 'Stage-2 visible' : 'Stage-2 · status-only'}</span>
            </span>
          </div>
        </>
      ) : null}

      {/* Opening a deal REPLACES the workspace rather than floating a modal over it.
          A deal is the main thing you work on, not an interruption to something else —
          so it gets the whole canvas, the tab bar it came from is preserved, and the
          way back is an explicit breadcrumb rather than a dismiss. */}
      {openDealId ? (
        <nav className="crumbs" aria-label="Breadcrumb">
          <button className="crumb-back" onClick={() => setOpenDealId('')}>
            <span aria-hidden="true">←</span> {backLabel}
          </button>
          <span className="crumb-sep" aria-hidden="true">/</span>
          <span className="crumb-now" aria-current="page">{openDealName || 'Deal'}</span>
        </nav>
      ) : (
        <nav className="maintabs">
          {mainTabs.map(([k, label]) => (
            <button key={k} className={`maintab${!settingsOpen && mainTab === k ? ' on' : ''}`} onClick={() => { setSettingsOpen(false); setMainTab(k); }}>{label}</button>
          ))}
        </nav>
      )}

      {dealsError ? (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 12px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bad-br)', background: 'var(--bad-bg)', fontSize: 13 }}>
          <span>⚠ Couldn’t refresh deals — showing the last known data.</span>
          <button className="maintab" style={{ marginLeft: 'auto' }} onClick={() => loadDeals()}>Retry</button>
        </div>
      ) : null}

      <div className="layout">
        {openDealId ? (
          <DealDetail dealId={openDealId} canViewStage2={canViewStage2} canWrite={canWrite} agents={visibleAgents} deals={deals} viewAsRole={viewAsRole} onChanged={refreshData} onClose={() => setOpenDealId('')} backLabel={backLabel} />
        ) : (
          <main className="main">
          {settingsOpen ? (
            <Settings isAdmin={isAdmin} ssoToken={ssoToken} viewAs={viewAs} onClose={() => setSettingsOpen(false)} />
          ) : mainTab === 'overview' ? (
            <>
              <AgentGuide roleLabel={roleLabel} canViewStage2={canViewStage2} canWrite={canWrite} onAsk={() => setChatOpen(true)} />
              <Dashboard pipeline={pipeline} deals={deals} market={market} config={config} onAsk={askAbout} onAskQuestion={askQuestion} onOpen={setOpenDealId} canWrite={canWrite} roleLabel={roleLabel} viewerKey={`${viewAs}|${viewAsRole}`} />
            </>
          ) : mainTab === 'sourcing' ? (
            <Stage1 deals={deals} onChanged={refreshData} onOpenDeal={setOpenDealId} />
          ) : mainTab === 'fund' ? (
            <Fund />
          ) : mainTab === 'report' ? (
            <PowerBI ssoToken={ssoToken} analytics={analytics} pipeline={pipeline} deals={deals} market={market} config={config} dealId="" />
          ) : (
            <Deals deals={deals} onOpen={setOpenDealId} onAsk={askAbout} />
          )}
          </main>
        )}
        {chatOpen ? <ChatPanel agents={visibleAgents} deals={deals} focusDealId={chatFocusDealId} onClose={() => setChatOpen(false)} viewAsRole={viewAsRole} canWrite={canWrite} seed={chatSeed} seedNonce={chatSeedNonce} /> : null}
      </div>

      {intakeOpen ? <IntakeWizard isAdmin={isAdmin} onClose={() => setIntakeOpen(false)} onCreated={(id) => { setIntakeOpen(false); refreshData(); setOpenDealId(id); }} /> : null}
      {adminGroupsOpen ? <AdminGroups deals={deals} onClose={() => setAdminGroupsOpen(false)} /> : null}
    </div>
  );
}

const GLOBAL_CSS = `
* { box-sizing: border-box; }
html, body, #root { margin: 0; height: 100%; }
.appwrap { display: flex; flex-direction: column; height: 100vh; background: var(--bg); color: var(--fg); font: 14px/1.5 "Segoe UI", system-ui, sans-serif; }
/* Buttons don't inherit text colour by default, so a content button with no explicit
   colour renders UA-default black — unreadable in dark mode (e.g. the Stage-1 funnel).
   Default every button to the theme foreground; coloured buttons still override this. */
button { color: inherit; }

/* ============================================================================
   Design system — shared primitives.
   These are the vocabulary the whole app speaks: a card with a header/body, a
   status chip, an AI-labelled surface, an action row. Feature components compose
   them instead of inventing local styles, so a facelift lands everywhere at once.
   ========================================================================== */

/* --- layout helpers --- */
.spacer { flex: 1; }
.sub { color: var(--muted); font-size: 11.5px; }
.grid { display: grid; gap: 12px; }
.g2 { grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); }
.g3 { grid-template-columns: minmax(0, 260px) minmax(0, 1.4fr) minmax(0, 320px); }
@media (max-width: 1150px) { .g2, .g3 { grid-template-columns: 1fr; } }

/* --- card --- */
.card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow); margin-bottom: 12px; }
.card > .hd { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 11px 14px; border-bottom: 1px solid var(--border); }
.card > .hd h3 { font-size: 14px; margin: 0; }
.card > .bd { padding: 12px 14px; }
.note { color: var(--muted); font-size: 12px; padding: 10px 14px; border-top: 1px dashed var(--border); }

/* --- AI surfaces: always visually distinct from authoritative ones --- */
.aicard { border-color: var(--ai-br); }
.aicard > .hd { background: var(--ai-bg); }
.aibadge { font-size: 10.5px; font-weight: 700; padding: 1.5px 7px; border-radius: 999px; color: var(--ai); background: var(--ai-bg); border: 1px solid var(--ai-br); white-space: nowrap; }
.narr { font-size: 13.5px; line-height: 1.65; }
.narr p { margin: 0 0 9px; }
.narr b { font-weight: 650; }
/* Inline evidence marker — every AI claim can be traced to a source. */
cite { font: inherit; font-style: normal; font-size: 9.5px; font-weight: 700; color: var(--ai); background: var(--ai-bg); border: 1px solid var(--ai-br); border-radius: 3px; padding: 0 3px; margin-left: 2px; vertical-align: super; }
cite button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
cite:has(button):hover, cite:focus-within { background: var(--ai); color: var(--accent-fg); }
.suggest { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; padding-top: 10px; margin-top: 4px; border-top: 1px dashed var(--border); }
.sgchip { border: 1px solid var(--accent); color: var(--accent); background: transparent; border-radius: 999px; padding: 4px 11px; font-size: 12px; font-weight: 600; cursor: pointer; }
.sgchip:hover { background: var(--accent); color: var(--accent-fg); }
.vote { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-top: 1px solid var(--border); color: var(--muted); font-size: 12px; flex-wrap: wrap; }
.vote button { border: 1px solid var(--border); background: none; border-radius: 7px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
.vote button:hover { border-color: var(--accent); color: var(--accent); }
.vote button.on { border-color: var(--accent); color: var(--accent); background: var(--chip); }

/* --- attention queue --- */
.att { padding: 12px 14px; border-bottom: 1px solid var(--border); }
.att:last-child { border-bottom: none; }
.att-t { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.att-t .rank { font-weight: 800; color: var(--muted); font-size: 12px; }
.att-t .name { font-weight: 650; font-size: 13.5px; }
.att-l { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; margin-top: 4px; flex-wrap: wrap; }
.impact { display: flex; align-items: center; gap: 6px; margin-top: 5px; font-size: 12px; font-weight: 600; color: var(--bad); }
.acts { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 9px; }
.legend { display: flex; gap: 14px; flex-wrap: wrap; color: var(--muted); font-size: 11.5px; padding: 0 14px 10px; }
.legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }

/* Whose desk this page was built for. Sits directly above the briefing because it
   is the precondition for reading it: the same records say different things to a
   lane owner and to an IC chair, and the reader is entitled to know which one the
   page assumed they were. */
.seatline { margin: 0 0 10px; padding: 7px 10px; border-left: 3px solid var(--accent); background: var(--accent-bg, rgba(99,102,241,.08)); border-radius: 0 6px 6px 0; font-size: 12px; color: var(--text); }
.seatline b { font-weight: 650; }

/* --- milestones --- */
.ms { display: flex; align-items: flex-start; gap: 10px; padding: 9px 14px; border-bottom: 1px solid var(--border); }
.ms:last-child { border-bottom: none; }
.dot { width: 10px; height: 10px; border-radius: 999px; margin-top: 5px; flex: 0 0 auto; background: var(--border); }
.dot.done { background: var(--good); } .dot.now { background: var(--accent); }
.dot.risk { background: var(--warn); } .dot.blocked { background: var(--bad); }
.ms .k { font-weight: 650; font-size: 13px; }
.ms .m { color: var(--muted); font-size: 11.5px; }
.riskdetail { margin: 8px 0 2px; padding: 10px 12px; border: 1px solid var(--warn-br); background: var(--warn-bg); border-radius: 8px; font-size: 12.5px; }
details > summary { cursor: pointer; color: var(--ai); font-size: 12px; font-weight: 600; margin-top: 5px; list-style: none; }
details > summary::-webkit-details-marker { display: none; }
details > summary:before { content: "\\25B8 "; }
details[open] > summary:before { content: "\\25BE "; }

/* --- workflow steps --- */
.pills { display: flex; gap: 6px; flex-wrap: wrap; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.pillbtn { border: 1px solid var(--border); background: transparent; border-radius: 999px; padding: 3px 12px; font-size: 12px; font-weight: 600; color: var(--muted); cursor: pointer; }
.pillbtn.on { border-color: var(--accent); color: var(--accent); background: var(--chip); }
.step { border-bottom: 1px solid var(--border); padding: 10px 14px; }
.step:last-child { border-bottom: none; }
.step.flagged { border: 1px solid var(--bad-br); border-radius: 9px; background: var(--bad-bg); margin: 6px 8px; }
.step-r { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.step-r .k { font-weight: 650; font-size: 13px; }
.step-r .m { color: var(--muted); font-size: 12px; }
.blocker { margin-top: 10px; border: 1px solid var(--bad-br); background: var(--bad-bg); border-radius: 9px; padding: 11px 13px; }
.blocker h4 { font-size: 12.5px; color: var(--bad); margin: 0 0 6px; }
.commit { border: 1px solid var(--border); background: var(--card); border-radius: 9px; padding: 11px 13px; margin-bottom: 9px; }
.quote { font-style: italic; color: var(--muted); border-left: 2px solid var(--ai-br); padding-left: 9px; margin: 6px 0; font-size: 12.5px; }
.prefill { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
.prefill b { color: var(--fg); }

/* --- threads --- */
.rail { padding: 6px 0; max-height: 60vh; overflow-y: auto; }
.railgrp { padding: 9px 12px 4px; font-size: 10.5px; font-weight: 800; letter-spacing: .06em; color: var(--muted); text-transform: uppercase; }
.thrd { padding: 9px 12px; border-left: 2px solid transparent; cursor: pointer; width: 100%; text-align: left; background: none; border-top: none; border-right: none; border-bottom: none; display: block; }
.thrd:hover { background: var(--hover); }
.thrd.on { background: var(--chip); border-left-color: var(--accent); }
.thrd .k { font-weight: 650; font-size: 12.5px; }
.thrd .p { color: var(--muted); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.anchor { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--ai); margin: 2px 0; }
.msg { display: flex; gap: 9px; margin-bottom: 12px; }
.msg .av { width: 30px; height: 30px; border-radius: 999px; background: var(--chip); color: var(--muted); display: grid; place-items: center; font-size: 11px; font-weight: 700; flex: 0 0 auto; }
.bub { border: 1px solid var(--border); background: var(--surface); border-radius: 10px; padding: 9px 11px; max-width: 640px; font-size: 13px; }
.bub .who { font-weight: 650; font-size: 12.5px; margin-bottom: 3px; }
.bub .t { color: var(--muted); font-size: 11px; margin-top: 5px; }
.msg.me { flex-direction: row-reverse; }
.msg.me .bub { background: var(--chip); }
.dl { padding: 9px 14px; border-bottom: 1px solid var(--border); }
.dl:last-child { border-bottom: none; }

/* --- documents --- */
.docgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.doc { border: 1px solid var(--border); border-radius: 10px; background: var(--card); padding: 12px; }
.doc .t { display: flex; align-items: flex-start; gap: 8px; }
.doc .k { font-weight: 650; font-size: 13px; margin-top: 6px; }
.callout { margin: 9px 0; padding: 9px 11px; border-radius: 8px; font-size: 12px; border: 1px solid var(--warn-br); background: var(--warn-bg); }
.callout.bad { border-color: var(--bad-br); background: var(--bad-bg); }
.callout.good { border-color: var(--good-br); background: var(--good-bg); }
.callout.ai { border-color: var(--ai-br); background: var(--ai-bg); }
.chg { display: flex; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); }
.chg:last-child { border-bottom: none; }
.chg .k, .gap .k { font-weight: 650; font-size: 13px; }
/* An icon glyph that has to line up with the text beside it. */
.ic { flex: 0 0 auto; font-size: 15px; line-height: 1.3; }
/* A delta is only red when the change is bad news. Neutral and favourable
   changes must not be dressed up as problems. */
.delta { color: var(--warn); font-weight: 600; font-size: 12.5px; }
.delta.bad { color: var(--bad); }
.delta.good { color: var(--good); }
.cmt { padding: 10px 0; border-bottom: 1px solid var(--border); }
.cmt:last-child { border-bottom: none; }
.gap { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.gap:last-child { border-bottom: none; }
.searchrow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.searchrow input { background: var(--input-bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px 11px; color: var(--fg); font: inherit; min-width: 230px; flex: 1; }

/* --- ask box --- */
.askchips { display: flex; gap: 7px; flex-wrap: wrap; }
.askbox { display: flex; gap: 8px; margin-top: 10px; }
.askbox input { flex: 1; min-width: 0; background: var(--input-bg); border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px; color: var(--fg); font: inherit; }
/* An action that belongs inline in a sentence. It must be a <button>, not an <a>,
   because it performs an action rather than navigating — but it should read as a link. */
.linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-decoration: underline; }
.linkish:hover { opacity: .8; }

.topbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--surface); flex: 0 0 auto; }

.brand { display: flex; align-items: center; gap: 12px; }
.logo { width: 34px; height: 34px; border-radius: 8px; background: var(--accent); color: var(--accent-fg); display: grid; place-items: center; font-size: 18px; }
.brand-t { font-weight: 700; font-size: 16px; }
.brand-s { color: var(--muted); font-size: 12px; }
.topbar-r { display: flex; align-items: center; gap: 10px; }
.badge { background: var(--chip); padding: 4px 10px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
.viewas { background: var(--input-bg); color: var(--fg); border: 1px solid var(--border); border-radius: 8px; padding: 5px 8px; font: inherit; font-size: 12px; max-width: 210px; }
.rolechip { font-size: 11px; padding: 4px 9px; border-radius: 999px; font-weight: 700; white-space: nowrap; border: 1px solid transparent; }
.rolechip.full { background: var(--good-bg); border-color: var(--good-br); color: var(--good); }
.rolechip.ltd { background: var(--warn-bg); border-color: var(--warn-br); color: var(--warn); }
.dashlink { color: var(--accent); text-decoration: none; font-size: 12px; font-weight: 600; }
.dashlink:hover { text-decoration: underline; }
.asktoggle { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-fg); padding: 7px 12px; border-radius: 8px; cursor: pointer; font: inherit; font-weight: 600; }
.asktoggle.on { background: transparent; color: var(--accent); }
.gearbtn { border: 1px solid var(--border, #33333f); background: none; color: var(--muted); width: 34px; height: 34px; border-radius: 8px; cursor: pointer; font-size: 16px; line-height: 1; }
.gearbtn:hover { color: var(--fg); border-color: var(--fg); }
.gearbtn.on { color: var(--accent); border-color: var(--accent); }
.layout { flex: 1; display: flex; min-height: 0; }
.main { flex: 1; overflow-y: auto; min-width: 0; }
.maintabs { display: flex; gap: 4px; padding: 8px 16px 0; background: var(--surface); border-bottom: 1px solid var(--border); flex: 0 0 auto; }

/* Breadcrumb — replaces the tab bar while a deal is open. It occupies the same
   slot and height so the canvas below does not jump when you open or leave a deal. */
.crumbs { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: var(--surface); border-bottom: 1px solid var(--border); flex: 0 0 auto; font-size: 13px; min-height: 41px; }
.crumb-back { display: inline-flex; align-items: center; gap: 6px; background: none; border: 1px solid transparent; border-radius: 6px; padding: 4px 8px; color: var(--accent); font: inherit; font-weight: 600; cursor: pointer; }
.crumb-back:hover { background: var(--hover); border-color: var(--border); }
.crumb-back:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.crumb-sep { color: var(--muted); }
.crumb-now { font-weight: 600; color: var(--fg); }

/* The same affordance inside the deal header, for when the breadcrumb has scrolled
   out of view on a small screen. Labelled with the destination, never a bare arrow. */
.backbtn { display: inline-flex; align-items: center; gap: 6px; background: var(--chip); border: 1px solid var(--border); border-radius: 6px; padding: 5px 10px; color: var(--fg); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.backbtn:hover { border-color: var(--accent); color: var(--accent); }
.backbtn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.maintab { border: none; background: none; color: var(--muted); padding: 9px 14px; cursor: pointer; font: inherit; font-weight: 600; font-size: 13px; border-bottom: 2px solid transparent; }
.maintab:hover { color: var(--fg); }
.maintab.on { color: var(--accent); border-bottom-color: var(--accent); }
.stage1, .stage2 { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.stage1 .fstep { border: none; cursor: pointer; }
.stage1 .fstep.on { outline: 2px solid var(--accent); }

/* One deals list, filtered. Rows not cards: the question is "which of these needs me
   today", which is a scanning task down a column, not a browsing task across a grid. */
.dealsview { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.dv-controls { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.dv-filters { display: flex; gap: 4px; flex-wrap: wrap; }
.dv-filter { border: 1px solid var(--border); background: none; color: var(--muted); border-radius: 14px; padding: 4px 10px; cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
.dv-filter:hover { color: var(--fg); }
.dv-filter.on { color: #fff; background: var(--accent); border-color: var(--accent); }
.dv-count { opacity: .7; font-weight: 500; }
.dv-search { margin-left: auto; border: 1px solid var(--border); background: var(--bg); color: var(--fg); border-radius: 6px; padding: 5px 10px; font: inherit; font-size: 13px; min-width: 180px; }
.dv-rows { display: flex; flex-direction: column; }
.dv-row { display: grid; grid-template-columns: 104px minmax(120px, 1.1fr) minmax(120px, 1fr) minmax(180px, 2.4fr) 74px auto; gap: 12px; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--border); cursor: pointer; font-size: 13px; }
.dv-row:last-child { border-bottom: none; }
.dv-row:hover { background: var(--surface-2, rgba(127,127,127,.07)); }
.dv-chip { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 10px; text-align: center; border: 1px solid var(--border); color: var(--muted); white-space: nowrap; }
.dv-chip.good { color: #0e7c3f; border-color: #0e7c3f55; background: #0e7c3f14; }
.dv-chip.warn { color: #9a6400; border-color: #9a640055; background: #9a640014; }
.dv-chip.bad  { color: #b3261e; border-color: #b3261e55; background: #b3261e14; }
.dv-name { font-weight: 600; }
.dv-stage, .dv-size { color: var(--muted); }
/* The reason wraps. It is the most important column on the row and truncating it to one
   line is how "2 required items outstanding: Findings / red-flag report, KYC…" became a
   tooltip nobody opened. */
.dv-why { color: var(--muted); line-height: 1.35; overflow-wrap: anywhere; }
.dv-more { color: var(--accent); font-weight: 600; white-space: nowrap; }
.dv-size { text-align: right; }
.linkbtn { border: none; background: none; color: var(--accent); cursor: pointer; font: inherit; text-decoration: underline; padding: 0; }
.cand-list { display: flex; flex-direction: column; }
.cand { display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.cand:last-child { border-bottom: none; }
.cand-main { flex: 1; min-width: 0; }
.cand-top { display: flex; align-items: center; gap: 8px; }
.cand-co { font-weight: 700; }
.cand-meta { color: var(--muted); font-size: 12px; margin: 2px 0 6px; }
.cand-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.cand-assess { font-size: 12px; background: var(--hover); border-radius: 8px; padding: 6px 9px; }
.cand-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; flex: 0 0 auto; max-width: 240px; justify-content: flex-end; }
.pill.ok { background: var(--good-bg); border: 1px solid var(--good-br); color: var(--good); }
.pill.warn { background: var(--warn-bg); border: 1px solid var(--warn-br); color: var(--warn); }
.pill.bad { background: var(--bad-bg); border: 1px solid var(--bad-br); color: var(--bad); }

/* Dashboard */
.dash { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.kpi { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; box-shadow: var(--shadow); }
.kpi-v { font-size: 24px; font-weight: 700; }
.kpi-l { font-size: 13px; margin-top: 2px; }
.kpi-s { color: var(--muted); font-size: 12px; }
.bizval { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
.bv-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--border); }
.bv-tile { background: var(--card); padding: 14px 16px; }
.bv-v { font-size: 26px; font-weight: 800; color: var(--accent); line-height: 1.1; }
.bv-l { font-size: 13px; font-weight: 600; margin-top: 3px; }
.bv-s { color: var(--muted); font-size: 11.5px; margin-top: 2px; }
.bv-close { padding: 12px 16px; font-size: 13px; line-height: 1.5; color: var(--fg); border-top: 1px solid var(--border); background: var(--hover); }
.bv-close strong { color: var(--accent); }
.attn { display: flex; flex-direction: column; }
.attn-row { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--border); cursor: pointer; }
.attn-row:last-child { border-bottom: none; }
.attn-row:hover { background: var(--hover); }
.attn-main { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.attn-co { font-weight: 700; }
.attn-sub { color: var(--muted); font-weight: 400; font-size: 12px; }
.attn-why { color: var(--muted); font-size: 12px; margin-top: 1px; }
.attn-acts { display: flex; gap: 6px; margin-left: auto; flex: 0 0 auto; }
.panel { background: var(--card); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; }
.panel-h { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); font-weight: 700; }
.panel-h .muted { font-weight: 400; }
.muted { color: var(--muted); font-size: 12px; }
.funnel { display: flex; gap: 8px; padding: 14px 16px; overflow-x: auto; }
.fstep { flex: 1 0 90px; text-align: center; background: var(--hover); border-radius: 10px; padding: 10px 8px; color: var(--fg); }
.fcount { font-size: 20px; font-weight: 700; }
.flabel { font-size: 12px; }
.fkey { color: var(--muted); font-size: 11px; }
.empty-panel { padding: 20px 16px; color: var(--muted); display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.linkbtn { border: none; background: none; color: var(--accent); cursor: pointer; font: inherit; font-weight: 600; padding: 0; }
.deals { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; padding: 14px 16px; }
.dealcard { border: 1px solid var(--border); border-radius: 10px; padding: 12px; background: var(--surface); }
.dc-top { display: flex; justify-content: space-between; align-items: baseline; }
.dc-co { font-weight: 700; }
.dc-size { color: var(--accent); font-weight: 700; font-size: 13px; }
.dc-meta { color: var(--muted); font-size: 12px; margin: 2px 0 8px; }
.dc-bar { height: 6px; background: var(--hover); border-radius: 4px; overflow: hidden; }
.dc-bar span { display: block; height: 100%; background: var(--accent); }
.dc-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.askbtn { border: 1px solid var(--border); background: var(--card); color: var(--fg); border-radius: 6px; padding: 3px 9px; cursor: pointer; font: inherit; font-size: 12px; }
.askbtn:hover { border-color: var(--accent); color: var(--accent); }
.mi { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 14px 16px; }
.mi-col { min-width: 0; }
.mi-h { font-weight: 700; font-size: 13px; margin-bottom: 8px; }
.mi-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px dashed var(--border); font-size: 13px; }
.mi-name { font-weight: 600; }
.mi-val { color: var(--muted); font-size: 12px; }
.pill { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--chip); }
.pill.closed-won { background: var(--good-bg); border: 1px solid var(--good-br); color: var(--good); }
.pill.closed-lost { background: var(--bad-bg); border: 1px solid var(--bad-br); color: var(--bad); }
.pill.on-hold { background: var(--warn-bg); border: 1px solid var(--warn-br); color: var(--warn); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { background: var(--chip); border: 1px solid var(--border); color: var(--muted); padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; white-space: nowrap; }
/* Status tint families. Tinted rather than solid so a row of chips reads as
   information, not as a row of competing buttons. */
.chip.ok, .chip.good, .chip.closed-won { color: var(--good); border-color: var(--good-br); background: var(--good-bg); }
.chip.warn, .chip.on-hold { color: var(--warn); border-color: var(--warn-br); background: var(--warn-bg); }
.chip.bad, .chip.closed-lost { color: var(--bad); border-color: var(--bad-br); background: var(--bad-bg); }
.chip.ai { color: var(--ai); border-color: var(--ai-br); background: var(--ai-bg); }
/* Provenance tag — what is shipping vs extended vs net-new. */
.tag { font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 1px 6px; border-radius: 4px; border: 1px solid; }
.tag.live { color: var(--good); border-color: var(--good-br); background: var(--good-bg); }
.tag.new { color: var(--accent); border-color: var(--accent); background: transparent; }
.tag.ext { color: var(--warn); border-color: var(--warn-br); background: var(--warn-bg); }
.mi-bench { margin-top: 10px; }

/* Chat panel */
/* min-width:0 matters: without it this flex child refuses to shrink below the
   intrinsic width of its widest content, which is how a single long token ends up
   widening the whole panel instead of wrapping inside it. */
.chatpanel { flex: 0 0 380px; max-width: 380px; min-width: 0; display: flex; flex-direction: column; border-left: 1px solid var(--border); background: var(--surface); min-height: 0; }
.chat-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--border); }
.chat-title { font-weight: 700; }
.iconbtn { border: none; background: none; color: var(--muted); cursor: pointer; font-size: 15px; }
/* Agent picker. In a 380px rail a horizontal scroller hides agents off the edge and
   gives no hint they exist, so the chips wrap onto as many lines as they need. */
.rail-v { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.agent { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--border); background: var(--card); border-radius: 10px; cursor: pointer; color: var(--fg); min-width: 0; text-align: left; }
.agent:hover { background: var(--hover); }
.agent.on { border-color: var(--accent); outline: 2px solid var(--accent); }
.agent .av { width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: var(--accent-fg); display: grid; place-items: center; font-size: 11px; font-weight: 700; flex: 0 0 auto; }
.agent .al { display: flex; flex-direction: column; text-align: left; min-width: 0; }
.agent .an { font-weight: 600; font-size: 12px; }
.agent .as { color: var(--muted); font-size: 10px; overflow-wrap: anywhere; }
.scopebar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.scope-l { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
.scope { background: var(--input-bg); color: var(--fg); border: 1px solid var(--border); border-radius: 8px; padding: 5px 8px; font: inherit; font-size: 12px; flex: 1; min-width: 0; }
.thread { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 12px; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.empty { margin: auto; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.empty-t { font-size: 15px; font-weight: 700; }
.empty-s { color: var(--muted); font-size: 12px; }
.starters { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; width: 100%; }
.starter { text-align: left; padding: 10px 12px; border: 1px solid var(--border); background: var(--card); color: var(--fg); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px; }
.starter:hover { background: var(--hover); border-color: var(--accent); }
.av-lg { width: 46px; height: 46px; border-radius: 50%; background: var(--accent); color: var(--accent-fg); display: grid; place-items: center; font-size: 18px; font-weight: 700; }
.row { display: flex; gap: 8px; align-items: flex-end; min-width: 0; }
.row.user { justify-content: flex-end; }
.msg-av { width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: var(--accent-fg); display: grid; place-items: center; font-size: 10px; font-weight: 700; flex: 0 0 auto; }
/* overflow-wrap:anywhere rather than break-word: agent replies routinely contain
   things with no break opportunity at all — a URL, a revision name, an ISIN — and in
   a narrow rail those must break mid-token or they push the panel sideways. */
.bubble { max-width: 82%; min-width: 0; padding: 9px 12px; border-radius: 14px; overflow-wrap: anywhere; }
.bubble.user { background: var(--bubble-user); border-bottom-right-radius: 4px; }
.bubble.agent { background: var(--bubble-agent); border: 1px solid var(--border); border-bottom-left-radius: 4px; }
.bubble .tools { margin-top: 6px; color: var(--muted); font-size: 11px; border-top: 1px dashed var(--border); padding-top: 5px; }
.proposed { margin-top: 8px; border-top: 1px dashed var(--border); padding-top: 7px; display: flex; flex-direction: column; gap: 6px; }
.proposed-h { color: var(--muted); font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; font-weight: 700; }
.proposed-row { display: flex; align-items: center; gap: 8px; }
.proposed-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.proposed-label { font-size: 12.5px; font-weight: 600; overflow-wrap: anywhere; }
/* Wraps to at most two lines. It used to be a single ellipsised line, which meant the
   summary you are being asked to approve was the part you could not read. */
.proposed-sum { font-size: 11.5px; color: var(--muted); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.proposed-src { font-size: 10.5px; color: var(--muted); opacity: .8; overflow-wrap: anywhere; }
.proposed-apply { flex: 0 0 auto; border: 1px solid var(--accent); background: transparent; color: var(--accent); border-radius: 8px; padding: 4px 10px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.proposed-apply:disabled { opacity: .5; cursor: default; }
.md > *:first-child { margin-top: 0; } .md > *:last-child { margin-bottom: 0; }
.md { overflow-wrap: anywhere; }
.md p { margin: 7px 0; } .md h3, .md h4, .md h5 { margin: 10px 0 5px; font-size: 13px; }
.md ul, .md ol { margin: 5px 0; padding-left: 18px; } .md li { margin: 3px 0; }
.md code { background: var(--chip); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
/* Code is the one thing that must NOT be re-wrapped — breaking a line changes what it
   says — so it keeps its own scroller instead of widening the panel. */
.md pre { background: var(--chip); padding: 10px; border-radius: 8px; overflow-x: auto; max-width: 100%; } .md pre code { background: none; padding: 0; }
.md a { color: var(--accent); overflow-wrap: anywhere; }
/* A wide table scrolls inside its own wrapper rather than widening the column it
   sits in. Cells use break-word, not anywhere: a figure should only be split when
   it genuinely cannot fit, never mid-number for the sake of a tidier edge. */
.md .mdtable { overflow-x: auto; max-width: 100%; margin: 8px 0; }
.md table { border-collapse: collapse; font-size: 12px; min-width: 100%; }
.md th, .md td { border: 1px solid var(--border); padding: 5px 8px; text-align: left; vertical-align: top; overflow-wrap: break-word; }
.md th { background: var(--chip); font-weight: 700; }
.typing { display: inline-flex; gap: 4px; }
.typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); animation: b 1.2s infinite ease-in-out; }
.typing span:nth-child(2) { animation-delay: .2s; } .typing span:nth-child(3) { animation-delay: .4s; }
@keyframes b { 0%, 80%, 100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
.composer { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--border); }
.input { flex: 1; resize: none; max-height: 120px; padding: 9px 11px; border: 1px solid var(--border); border-radius: 10px; background: var(--input-bg); color: var(--fg); font: inherit; }
.input:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
.send { width: 42px; border: none; border-radius: 10px; background: var(--accent); color: var(--accent-fg); cursor: pointer; font-size: 15px; }
.send:disabled { opacity: .5; cursor: default; }

/* ---- Accessibility baseline (WCAG 2.2 AA) ---- */
/* Visible keyboard focus on every interactive element (keyboard, not just mouse). */
a:focus-visible, button:focus-visible, [role="button"]:focus-visible, input:focus-visible,
select:focus-visible, textarea:focus-visible, [tabindex]:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px;
}
/* Screen-reader-only text utility for icon-only controls. */
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
/* Honour the OS "reduce motion" preference — disable non-essential animation/transition. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important; animation-iteration-count: 1 !important;
    transition-duration: .001ms !important; scroll-behavior: auto !important;
  }
}

/* Consistent reading width on very wide monitors — centre the content instead of
   letting it sprawl edge-to-edge, so large and standard screens feel the same. */
@media (min-width: 1500px) {
  .main { padding-inline: max(0px, calc((100% - 1440px) / 2)); }
}

@media (max-width: 860px) {
  .mi { grid-template-columns: 1fr; }
  .chatpanel { position: fixed; top: 0; right: 0; bottom: 0; width: 92vw; max-width: 420px; z-index: 30; box-shadow: -8px 0 24px rgba(0,0,0,.25); }
  .topbar { flex-wrap: wrap; gap: 8px; }
  .brand-s { display: none; }
  .maintabs { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .maintab { white-space: nowrap; }
  /* Stack the row rather than let a six-column grid squeeze the reason to two words. */
  .dv-row { grid-template-columns: auto 1fr auto; grid-template-areas: 'chip name size' 'stage stage stage' 'why why why' 'ask ask ask'; row-gap: 4px; }
  .dv-chip { grid-area: chip; } .dv-name { grid-area: name; } .dv-size { grid-area: size; }
  .dv-stage { grid-area: stage; } .dv-why { grid-area: why; } .dv-row .askbtn { grid-area: ask; justify-self: start; }
  .dv-search { margin-left: 0; width: 100%; }
  .kpis { grid-template-columns: repeat(2, 1fr); }
  .deals { grid-template-columns: 1fr; }
  .drawer { width: 100vw; }
  .viewas { max-width: 160px; }
}
@media (max-width: 560px) {
  .kpis { grid-template-columns: 1fr; }
  .topbar-r { flex-wrap: wrap; justify-content: flex-end; }
  /* Below this width a 300px minimum column overflows the viewport. */
  .docgrid { grid-template-columns: 1fr; }
  .searchrow input { min-width: 0; }
}

/* Deal detail — the deal REPLACES the workspace and fills the remaining canvas.
   .drawer-scrim is retained below because the admin and intake wizards are still
   genuine modals; only the deal graduated to being a place of its own.
   The agent chat opens as a right-side sub-panel OVER the deal so it stays in focus. */
.dealpage { flex: 1; min-height: 0; display: flex; }
.dealpage > .drawer { width: 100%; border-left: none; border-right: none; box-shadow: none; }
.drawer-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 40; display: flex; justify-content: center; }
.drawer { width: min(1180px, 100vw); height: 100%; position: relative; background: var(--bg); border-left: 1px solid var(--border); border-right: 1px solid var(--border); display: flex; flex-direction: column; box-shadow: 0 0 44px rgba(0,0,0,.38); }
.drawer-chat { position: absolute; top: 0; right: 0; bottom: 0; left: auto; width: min(460px, 92%); z-index: 6; display: flex; background: var(--bg); border-left: 1px solid var(--border); box-shadow: -8px 0 26px rgba(0,0,0,.30); }
.drawer-chat .chatpanel { flex: 1; max-width: none; border-left: none; }
.drawer-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--surface); }
.drawer-title { font-weight: 700; font-size: 15px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chbtn { border: 1px solid var(--accent); background: var(--chip); color: var(--accent); border-radius: 8px; padding: 6px 10px; cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; white-space: nowrap; }
.chbtn:hover:not(:disabled) { background: var(--accent); color: var(--accent-fg); }
.chbtn:disabled { opacity: .6; cursor: default; }
.drawer-body { flex: 1; overflow-y: auto; padding: 16px; }
.dd-sub { color: var(--muted); font-size: 13px; }
.dd-meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
.dd-thesis { color: var(--fg); font-size: 13px; margin: 8px 0 4px; }
.dd-panel { border: 1px solid var(--border); border-radius: 12px; background: var(--card); margin-top: 14px; overflow: hidden; }
.dd-panel-h { font-weight: 700; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.verdict { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
.verdict-state { font-weight: 800; padding: 3px 10px; border-radius: 999px; background: var(--chip); white-space: nowrap; }
.verdict.ok .verdict-state { background: var(--good-bg); border: 1px solid var(--good-br); color: var(--good); }
.verdict.warn .verdict-state { background: var(--warn-bg); border: 1px solid var(--warn-br); color: var(--warn); }
.verdict.bad .verdict-state { background: var(--bad-bg); border: 1px solid var(--bad-br); color: var(--bad); }
.verdict-head { font-size: 13px; }
.dd-artifacts { padding: 6px 14px 12px; display: flex; flex-direction: column; gap: 6px; }
.artifact { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
.artifact .a-ic { font-weight: 800; }
.artifact.done .a-ic { color: var(--good); }
.artifact.todo .a-ic { color: var(--muted); }
.artifact .a-label { font-weight: 600; }
.artifact .a-detail { color: var(--muted); font-size: 12px; }
.dd-figs { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; padding: 12px 14px; }
.dd-fig { border: 1px solid var(--border); border-radius: 10px; padding: 10px; background: var(--surface); }
.dd-fig .fig-v { font-size: 18px; font-weight: 700; }
.dd-fig .fig-l { font-size: 12px; }
.dd-fig .fig-src { color: var(--muted); font-size: 11px; margin-top: 3px; }
.dd-note { color: var(--muted); font-size: 11px; padding: 0 14px 12px; }
.dd-lanes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px 14px; }
.dd-lane { border: 1px solid var(--border); border-radius: 10px; padding: 10px; background: var(--surface); }
.lane-top { display: flex; justify-content: space-between; align-items: baseline; }
.lane-name { font-weight: 600; font-size: 13px; }
.lane-status { color: var(--muted); font-size: 11px; }
.lane-bar { height: 5px; background: var(--hover); border-radius: 4px; overflow: hidden; margin: 6px 0; }
.lane-bar span { display: block; height: 100%; background: var(--accent); }
.lane-owner { color: var(--muted); font-size: 11px; }

/* Deal workspace tabs / stages / orchestration */
.dd-topmeta { padding: 12px 16px 0; }
.dd-tabs { display: flex; gap: 4px; padding: 8px 12px 0; border-bottom: 1px solid var(--border); overflow-x: auto; background: var(--surface); }
.dd-tab { border: none; background: none; color: var(--muted); padding: 8px 12px; cursor: pointer; font: inherit; font-weight: 600; border-bottom: 2px solid transparent; white-space: nowrap; }
.dd-tab.on { color: var(--accent); border-bottom-color: var(--accent); }
.dd-actionnote { background: var(--chip); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; font-size: 12px; margin-bottom: 12px; }
.stage-group { margin-bottom: 14px; }
.stage-name { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: var(--muted); margin-bottom: 6px; }
.stage-steps { display: flex; gap: 6px; flex-wrap: wrap; }
.fstep-btn { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 62px; padding: 8px 6px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--fg); cursor: pointer; font: inherit; }
.fstep-btn:hover { background: var(--hover); }
.fstep-btn .fs-key { font-weight: 800; font-size: 12px; }
.fstep-btn .fs-label { font-size: 10px; color: var(--muted); }
.fstep-btn.done { border-color: var(--good-br); }
.fstep-btn.done .fs-key { color: var(--good); }
.fstep-btn.cur { border-color: var(--accent); background: var(--chip); }
.fstep-btn.on { outline: 2px solid var(--accent); }
.orch-bar { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
.btn { border: 1px solid var(--border); background: var(--card); color: var(--fg); border-radius: 8px; padding: 8px 12px; cursor: pointer; font: inherit; font-weight: 600; }
.btn:hover:not(:disabled) { border-color: var(--accent); }
.btn:disabled { opacity: .5; cursor: default; }
.btn.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
.btn.ghost { background: none; }
/* A quieter, tertiary action — reads as a link but keeps the button hit target. */
.btn.link { border-color: transparent; background: none; color: var(--muted); font-weight: 500; }
.btn.link:hover { color: var(--fg); border-color: transparent; }
/* Inside a card action row the buttons are compact, so a row of three doesn't
   dominate the content it belongs to. */
.acts .btn, .card .btn.compact { padding: 4px 11px; font-size: 12px; border-radius: 7px; }
.acts .btn.primary:hover { color: var(--accent-fg); opacity: .9; }
.artifact-view { padding: 12px 14px; }
.av-kind { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: var(--muted); margin-bottom: 6px; }
.av-list { margin: 0; padding-left: 18px; font-size: 13px; } .av-list li { margin: 3px 0; }
.dd-empty-p { padding: 14px; color: var(--muted); font-size: 13px; }
.ws-grid { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.ws-row { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; border-bottom: 1px dashed var(--border); padding-bottom: 6px; }
.ws-row a { color: var(--accent); }

/* Deep-dive research (Stage 1 target detail + analyst research; Stage 2 market research) */
.td-toggle { border: none; background: none; color: var(--accent); cursor: pointer; font: inherit; font-weight: 600; font-size: 12px; padding: 4px 0 0; }
.td-wrap { width: 100%; margin-top: 8px; border-top: 1px dashed var(--border); padding-top: 8px; }
.td-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.td-panel { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); padding: 10px 12px; min-width: 0; }
.td-panel.td-wide { grid-column: 1 / -1; }
.td-panel-h { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-weight: 700; font-size: 13px; margin-bottom: 8px; }
.td-filings { display: flex; flex-direction: column; gap: 8px; }
.td-filing { border-left: 2px solid var(--border); padding-left: 8px; }
.td-filing-head { font-weight: 600; font-size: 13px; }
.td-link { color: var(--accent); text-decoration: none; font-size: 12px; }
.q-card { display: flex; flex-direction: column; gap: 4px; }
.q-top { display: flex; align-items: center; gap: 10px; }
.q-score { font-size: 22px; font-weight: 700; border-radius: 8px; padding: 2px 10px; }
.q-score.ok { color: var(--good); } .q-score.warn { color: var(--warn); } .q-score.bad { color: var(--bad); }
.q-rating { font-weight: 700; }
.td-summary { font-size: 13px; background: var(--hover); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; }
.td-row { display: grid; grid-template-columns: 130px 1fr; gap: 10px; padding: 6px 0; border-top: 1px dashed var(--border); font-size: 13px; }
.td-row.rec { font-weight: 600; }
.td-k { color: var(--muted); font-size: 12px; }
.td-risks { margin: 0; padding-left: 16px; } .td-risks li { margin: 2px 0; }
.rc-list { display: flex; flex-direction: column; }
.rc { border-bottom: 1px solid var(--border); }
.rc-hd { width: 100%; display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: none; border: none; cursor: pointer; color: var(--fg); text-align: left; }
.rc-hd:hover { background: var(--hover); }
.rc-caret { color: var(--muted); }
.rc-main { flex: 1; min-width: 0; }
.rc-body { padding: 4px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
.rc-rank { display: flex; align-items: center; gap: 8px; }
.rc-rank-badge { font-size: 18px; font-weight: 700; color: var(--accent); }
.rc-peer { display: flex; align-items: center; gap: 6px; font-size: 13px; margin: 3px 0; }
.peer-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.peer-dot.listed { background: #1b7f37; } .peer-dot.private { background: var(--muted); }
.rc-view { border-top: 1px dashed var(--border); padding: 8px 0; font-size: 13px; }
.rc-view-top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 4px; }
.mr-list { display: flex; flex-direction: column; padding: 6px 14px 12px; }
.mr-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px dashed var(--border); font-size: 13px; }
.mr-name { font-weight: 600; display: flex; align-items: center; gap: 6px; }
.mr-val { color: var(--muted); font-size: 12px; }
/* Workspace VDR + quick links */
.chbtn.spo { }
.wsp-links { display: flex; flex-wrap: wrap; gap: 10px; padding: 12px 14px; }
.orch-links { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 0 12px; }
.wsp-link { border: 1px solid var(--border); background: var(--surface); color: var(--fg); border-radius: 8px; padding: 8px 12px; cursor: pointer; font: inherit; font-weight: 600; font-size: 13px; }
.wsp-link:hover { border-color: var(--accent); }
.wsp-link:disabled { opacity: .5; cursor: default; }
.wsp-link.teams { border-color: #4b53bc; color: #4b53bc; }
.wsp-link.spo { border-color: #036c70; color: #036c70; }
.wsp-link.mr { border-color: var(--accent); color: var(--accent); }
.vdr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; padding: 12px 14px; }
.vdr-folder { display: block; border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px; background: var(--surface); text-decoration: none; color: var(--fg); font-size: 13px; }
.vdr-folder:hover { border-color: var(--accent); color: var(--accent); }
.tpl-list { display: flex; flex-direction: column; padding: 6px 14px 12px; }
.tpl-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--border); text-decoration: none; color: var(--fg); font-size: 13px; }
.tpl-row:hover .tpl-name { color: var(--accent); }
.tpl-name { font-weight: 600; }
@media (max-width: 620px) { .td-grid { grid-template-columns: 1fr; } .td-row { grid-template-columns: 1fr; gap: 2px; } }
`;

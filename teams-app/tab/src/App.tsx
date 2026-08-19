// Root shell for the Deal Room console (served both inside Teams and standalone).
// Owns: the top bar (persona / role badges + "sign in as" demo-profile and
// "view as" role switchers), the main tab nav (Overview · Stage 1 · Stage 2 ·
// Lifecycle · Fund & Portfolio), the collapsible agents panel, and the deal-detail
// overlay. Access state (which agents/tabs the caller may see) comes from the
// orchestrator via POST /api/teams/context; all data calls proxy to /api on the
// shared backend. Add a new main tab by extending the mainTab union + the nav map.
import { useEffect, useRef, useState } from 'react';
import { initTeams, getSsoToken, toggleTheme, type TeamsInfo } from './teams';
import { af, setAuthContext } from './authFetch';
import Notifications from './Notifications';
import Dashboard from './Dashboard';
import AgentGuide from './AgentGuide';
import ChatPanel from './ChatPanel';
import DealDetail from './DealDetail';
import Stage1 from './Stage1';
import Deals, { type DealsFilter } from './Deals';
import Fund from './Fund';
import PowerBI from './PowerBI';
import Settings from './Settings';
import IntakeWizard from './IntakeWizard';
import AdminGroups from './AdminGroups';
import Offline, { OnlineLeaseBanner, type PlatformStatus } from './Offline';
import type { Agent, Analytics, BackendConfig, Deal, MarketIntel, Persona, Pipeline } from './types';

type TeamsConfig = { demoMode: boolean; backend: string; sso: boolean; bot: boolean; backendUrl?: string; appBaseUrl?: string };

// The user talks to ONE assistant. It fronts the orchestrator, which brings in the
// right specialist agents (sourcing, screening, diligence, modelling, IC-memo,
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

const DEALS_FILTERS: DealsFilter[] = ['all', 'attention', 'origination', 'diligence', 'execution', 'value'];

// The list view, as an address. Only non-default state is written, so a plain list stays
// a plain '#/deals'.
function listParams(filter: DealsFilter, query: string): string {
  const p = new URLSearchParams();
  if (filter && filter !== 'all') p.set('filter', filter);
  if (query.trim()) p.set('q', query.trim());
  const s = p.toString();
  return s ? `?${s}` : '';
}

// WHERE THIS TAB SHOULD OPEN.
//
// Teams reloads a tab at its configured content URL, with no fragment, every time you
// leave it for a channel and come back. So the address bar — which is what everything
// below reads to restore your place — is empty precisely when you most want your place
// back, and the deal you were reading became the home screen. The last route is kept
// alongside it and used only when the address says nothing.
const ROUTE_KEY = 'dr.route';
const KNOWN_ROUTE = /^#\/(deal|settings|overview|sourcing|deals|fund|report)\b/;
const bootHash: string = (() => {
  const h = window.location.hash || '';
  if (KNOWN_ROUTE.test(h)) return h;
  try { return localStorage.getItem(ROUTE_KEY) || ''; } catch { return ''; }
})();

function hashParam(name: string): string {
  const h = window.location.hash || '';
  const i = h.indexOf('?');
  if (i < 0) return '';
  try { return new URLSearchParams(h.slice(i + 1)).get(name) || ''; } catch { return ''; }
}

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
  // The deal list takes the better part of twenty seconds to arrive on a cold start.
  // Until this flips false, every screen that counts deals was showing its "nothing
  // here" state -- a partner opening the product for the first time was told "There
  // are no live deals yet", believed her login had failed, and nearly closed the tab.
  // An empty firm and a firm that has not finished loading are not the same sentence.
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState(false);
  const [dealsFilter, setDealsFilter] = useState<DealsFilter>(() => {
    // The address wins over session storage: a link someone sent you must show what they
    // were looking at, not what you were.
    const fromUrl = hashParam('filter');
    if (DEALS_FILTERS.includes(fromUrl as DealsFilter)) return fromUrl as DealsFilter;
    try {
      const v = sessionStorage.getItem('dr.deals.filter') || '';
      return DEALS_FILTERS.includes(v as DealsFilter) ? (v as DealsFilter) : 'all';
    } catch {
      return 'all';
    }
  });
  const [dealsQuery, setDealsQuery] = useState(() => {
    const fromUrl = hashParam('q');
    if (fromUrl) return fromUrl;
    try { return sessionStorage.getItem('dr.deals.query') || ''; } catch { return ''; }
  });
  const [dealsCompare, setDealsCompare] = useState<string[]>(() => {
    try {
      const raw = sessionStorage.getItem('dr.deals.compare');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((x) => typeof x === 'string').slice(0, 4);
    } catch {
      return [];
    }
  });
  const [dealsScrollTop, setDealsScrollTop] = useState(0);
  const [agents, setAgents] = useState<Agent[]>([ORCHESTRATOR]);
  // Agents panel starts collapsed — it opens on an explicit "Ask" action so the
  // dashboard isn't crowded on first load.
  const [chatOpen, setChatOpen] = useState(false);
  const [chatFocusDealId, setChatFocusDealId] = useState('');
  const [chatSeed, setChatSeed] = useState('');
  const [chatSeedNonce, setChatSeedNonce] = useState(0);
  const [openDealId, setOpenDealId] = useState(() => {
    // The address never changed, on any screen, in a whole session. So there was no
    // browser Back, no bookmark, and -- the one a partner cared about -- no link she
    // could paste into an email to say "look at this deal". Everything below keeps the
    // address in step with where you are, and lets an address put you back there.
    const m = /[#/]deal\/([A-Za-z0-9_-]+)/.exec(bootHash);
    return m ? m[1] : '';
  });
  // The page WITHIN the open deal, so a link can point at the IC readiness board rather
  // than just at the deal.
  const [dealTab, setDealTab] = useState(() => {
    const m = /[#/]deal\/[A-Za-z0-9_-]+\/([A-Za-z0-9_-]+)/.exec(bootHash);
    return m ? m[1] : '';
  });
  const [canViewStage2, setCanViewStage2] = useState(true);
  const [canWrite, setCanWrite] = useState(true);
  const [accFlash, setAccFlash] = useState(false);
  // The borrowed-identity note is worth reading once and worth nothing the fortieth
  // time. Left permanent it became the loudest thing on every screen in a product whose
  // subject is supposed to be the deals — a demo explaining itself over the top of the
  // thing it is demonstrating. So it can be acknowledged, and it remembers WHO was
  // acknowledged: change person and it returns, because that is the only moment the
  // explanation is news again. The topbar names the current person either way, so
  // dismissing it loses nothing.
  const [sbnAck, setSbnAck] = useState(() => {
    try { return localStorage.getItem('dr_sbn_ack') || ''; } catch { return ''; }
  });
  const [demoUsers, setDemoUsers] = useState<{ id: string; upn: string; label: string; name?: string; roleLabel?: string; agentCount?: number }[]>([]);
  const [viewAs, setViewAs] = useState('');
  // False until the seat has been resolved and attached to outbound requests. Nothing
  // that reads a single deal may run before it is true.
  const [seatReady, setSeatReady] = useState(false);
  // Access profile from the orchestrator: which agents this user may use, and
  // the roles they can "view as" (own role + any lower in the hierarchy).
  const [allowedPersonas, setAllowedPersonas] = useState<string[] | null>(null);
  const [viewAsRole, setViewAsRole] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  // The access tier and the job are different facts. The header printed the tier, so the
  // investor-relations seat wore "Partner / Deal Sponsor" and the operating partner was
  // labelled "Deal Team".
  const [seatLabel, setSeatLabel] = useState('');
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
  const [mainTab, setMainTab] = useState<MainTab>(() => {
    const m = /#\/(overview|sourcing|deals|fund|report)\b/.exec(bootHash);
    if (m) return m[1] as MainTab;
    return legacyTab(new URLSearchParams(window.location.search).get('view'));
  });
  const [settingsOpen, setSettingsOpen] = useState(() => /#\/settings\b/.test(bootHash));
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

  // "Deals" is a broken promise: the list under it is filtered to diligence, IC and
  // value creation, so a screening name a partner discussed this morning is genuinely
  // not there, and the only way to know that is to have read the filter. Naming both
  // tabs for the part of the pipeline they actually hold means the reader can tell
  // which one to open without opening either.
  const mainTabs: [typeof mainTab, string][] = [
    ['overview', 'Home'], ['sourcing', 'Sourcing & screening'], ['deals', 'All deals'], ['fund', 'Fund & Portfolio'],
    // Four of the five tabs name a subject; the fifth named a file format, and the LP
    // report actually lives under Fund & Portfolio. Two doors plausibly led to a report
    // and only one of them was called Report.
    ['report', 'Firm reporting'],
  ];

  // The breadcrumb names the exact view you came from, so going back is a known
  // destination rather than a guess. `mainTab` is never cleared when a deal opens,
  // which is what makes that promise true.
  const backLabel = mainTabs.find(([k]) => k === mainTab)?.[1] || 'Home';
  const openDealName = deals.find((d) => d.id === openDealId)?.company || '';

  function applyAccess(ctx: any) {
    if (!ctx) return;
    // Assigned or absent — never left over. Switching showcase profiles (or turning
    // demo mode off) has to be able to take the seat AWAY, and `if (ctx.persona)`
    // could only ever set one, so the previous profile's seat stayed bound and kept
    // filtering the agent list after the user had moved on.
    setPersona(ctx.persona || null);
    setCanViewStage2(!!ctx.canViewStage2);
    setCanWrite(ctx.canWrite !== false);
    if (Array.isArray(ctx.allowedPersonas)) setAllowedPersonas(ctx.allowedPersonas);
    if (typeof ctx.roleLabel === 'string') setRoleLabel(ctx.roleLabel);
    if (typeof ctx.seatLabel === 'string') setSeatLabel(ctx.seatLabel);
    setIsAdmin(!!ctx.isAdmin);
  }

  useEffect(() => {
    (async () => {
      setTeams(await initTeams());
      setTheme(document.documentElement.dataset.theme || 'default');
      // These do not depend on the SSO token, and awaiting it first held every one of them
      // behind the four-second cap — four seconds of an empty screen before anything was
      // even asked for. Identity still gates what comes BACK: loadScoped/loadDeals go
      // through af(), which attaches the seat.
      fetch('/api/teams/config').then((r) => r.json()).then(setCfg).catch(() => {});
      // af(), not fetch(): /api/analytics is now scoped to the caller, so it has to be
      // asked as somebody. A bare fetch would carry no identity and the numbers would
      // silently revert to the whole book — which is the leak these counters started as.
      loadScoped();
      fetch('/api/market-intel').then((r) => r.json()).then(setMarket).catch(() => {});
      loadDeals();

      fetch('/api/config').then((r) => r.json()).then((backendCfg: BackendConfig) => {
        setConfig(backendCfg);
        // Single-agent surface: the user only ever talks to the one assistant; it
        // brings in the specialist agents server-side. We deliberately do NOT list
        // the persona agents as separately selectable chat targets.
        setAgents([ORCHESTRATOR]);
      }).catch(() => {});

      // SSO token identifies the caller so /platform/status can report isAdmin (the
      // "keep online indefinitely" path is admin-only). Absent outside Teams — fine.
      const tok = await getSsoToken().catch(() => null);
      if (tok) { setSsoToken(tok); setAuthContext({ ssoToken: tok }); }
      fetch('/api/platform/status', tok ? { headers: { authorization: `Bearer ${tok}` } } : undefined)
        .then((r) => r.json()).then(setPlatform).catch(() => setPlatform(null));

      getSsoToken().then((token) =>
        fetch('/api/teams/context', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ssoToken: token }) }).then((r) => r.json())
      ).then((ctx) => {
        applyAccess(ctx);
        if (Array.isArray(ctx?.demoUsers)) {
          setDemoUsers(ctx.demoUsers);
          // Demo mode: start the showcase as the first profile (Administrator) so the
          // full access model is visible; real Teams users keep their SSO identity.
          //
          // A reload used to dump you back to Administrator without saying so, which is
          // disorienting mid-review -- controls appear and disappear and it looks like a
          // permissions bug rather than a reset identity. Restore the last choice if it
          // is still a valid profile.
          if (ctx.demoUsers.length) {
            let saved = '';
            try { saved = localStorage.getItem('dr.viewAs') || ''; } catch { /* storage blocked */ }
            // An explicit ?dr_as= in the URL is a deliberate instruction and used to be
            // silently ignored whenever a previous choice had been stored -- so a link
            // shared to show someone the analyst's view opened on whoever the recipient
            // last was, with nothing on screen to say the link had been overruled.
            let fromUrl = '';
            try { fromUrl = new URLSearchParams(window.location.search).get('dr_as') || ''; } catch { /* no location */ }
            const urlOk = !!fromUrl && ctx.demoUsers.some((u: any) => u.id === fromUrl || u.upn === fromUrl);
            const ok = !!saved && ctx.demoUsers.some((u: any) => u.id === saved || u.upn === saved);
            const chosen = urlOk ? fromUrl : ok ? saved : ctx.demoUsers[0].id;
            if (urlOk) { try { localStorage.setItem('dr.viewAs', fromUrl); } catch { /* storage blocked */ } }
            // Set the header BEFORE the state update. React runs child effects before
            // parent ones, so the dashboard's first identity-aware fetch went out before
            // the effect below had attached x-dr-as -- and the reply it cached was the
            // anonymous one. That is why an administrator was told no role was assigned
            // to them: the page was showing a briefing composed for nobody.
            setAuthContext({ as: chosen });
            setViewAs((v: string) => v || chosen);
          }
        }
        setSeatReady(true);
      }).catch(() => { setSeatReady(true); });
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
      // Record it server-side as well, so the assistant in the Teams channels answers as
      // the same person. This runs on the initial selection too, not only on a change:
      // the dropdown opens on the first profile without anyone touching it, and the tab
      // and the channels disagreeing about who you are is exactly the bug being fixed.
      void setActingAs(viewAs);
      const ctx = await fetch('/api/teams/context', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ as: viewAs, viewAsRole }) }).then((r) => r.json()).catch(() => null);
      applyAccess(ctx);
      // Re-pull the pipeline as the newly selected identity so status-only / hidden
      // deals are reflected in the list.
      //
      // The funnel and the headline counters have to come with it. They were fetched
      // once on mount, before anyone had been chosen, so the analyst's report showed
      // "19 Sourced" three centimetres above "Every deal you can see - 4 records",
      // under a caption promising the funnel covered only their deals.
      loadDeals();
      loadScoped();
    })();
  }, [viewAs, viewAsRole]);

  // Keep the address bar in step with where you are. Before this, the URL never moved
  // on any screen, so there was no browser Back, no bookmark, and no way to send a
  // colleague a link to a deal -- which for a partner who lives in Outlook is the
  // single most ordinary thing she asked the product to do.
  // Opening a DIFFERENT deal starts on its brief, not on whichever page you were
  // reading on the last one.
  const lastDeal = useRef(openDealId);
  useEffect(() => {
    if (lastDeal.current !== openDealId) { lastDeal.current = openDealId; setDealTab(''); }
  }, [openDealId]);

  useEffect(() => {
    // Settings had no address of its own, so it wore whichever page you were reading
    // when you opened it -- and a link sent from Settings landed the recipient
    // somewhere else entirely.
    //
    // The list's filter and search now travel in the address too. They were held in
    // session storage, which restores your own view and cannot be bookmarked, cannot be
    // sent to a colleague, and is not undone by Back. "Every deal with Legal DD not
    // started" was a view you could reach and never refer to.
    const listQs = !settingsOpen && !openDealId && mainTab === 'deals' ? listParams(dealsFilter, dealsQuery) : '';
    const want = settingsOpen ? '#/settings' : openDealId ? `#/deal/${openDealId}${dealTab ? `/${dealTab}` : ''}` : `#/${mainTab}${listQs}`;
    try { localStorage.setItem(ROUTE_KEY, want); } catch { /* storage blocked */ }
    if (window.location.hash !== want) {
      // Typing in the search box must not push a history entry per keystroke, or Back
      // becomes a way to retype what you just typed.
      //
      // Nor must moving between a deal's tabs. Reading five tabs of one deal pushed five
      // entries, so Back walked you backwards through what you had just read and took
      // five presses to return to the list you came from. People stop trusting Back, and
      // then never reach the filter restore above. Only OPENING a deal is a new place.
      const routeKey = (h: string) => h.split('?')[0].replace(/^(#\/deal\/[A-Za-z0-9_-]+)\/.*$/, '$1');
      const sameRoute = routeKey(window.location.hash) === routeKey(want);
      try {
        if (sameRoute) window.history.replaceState(null, '', want);
        else window.history.pushState(null, '', want);
      } catch { /* sandboxed frame */ }
    }
  }, [mainTab, openDealId, dealTab, settingsOpen, dealsFilter, dealsQuery]);

  // Keep compare picks valid for THIS viewer only. A persona/role change can make a
  // previously visible deal disappear (or become status-only), and keeping those ids
  // selected reads as though the hidden rows still exist in the list.
  useEffect(() => {
    const visible = new Set((deals || []).filter((d: any) => !(d.locked || d.accessLevel === 'status')).map((d) => d.id));
    setDealsCompare((c) => c.filter((id) => visible.has(id)));
  }, [deals]);

  // Persist Deals view state for this browser session. This keeps triage context across
  // reloads and short navigations without turning it into a global preference.
  useEffect(() => {
    try {
      sessionStorage.setItem('dr.deals.filter', dealsFilter);
      sessionStorage.setItem('dr.deals.query', dealsQuery);
      sessionStorage.setItem('dr.deals.compare', JSON.stringify(dealsCompare));
    } catch {
      // private mode or blocked storage; state still works in-memory
    }
  }, [dealsFilter, dealsQuery, dealsCompare]);

  // Returning from a deal should put you back at the same place in the list.
  useEffect(() => {
    if (openDealId || settingsOpen || mainTab !== 'deals') return;
    const id = window.requestAnimationFrame(() => {
      if (mainRef.current) mainRef.current.scrollTop = dealsScrollTop;
    });
    return () => window.cancelAnimationFrame(id);
  }, [openDealId, settingsOpen, mainTab, dealsScrollTop]);

  // Escape closes the open deal. A full-screen drawer with mouse-only dismissal traps
  // anyone working from the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (settingsOpen) { setSettingsOpen(false); return; }
      if (openDealId) setOpenDealId('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openDealId, settingsOpen]);

  // ...and let the browser's own Back and Forward buttons work, because a person who
  // has been given a URL that changes will press them.
  useEffect(() => {
    const onPop = () => {
      const h = window.location.hash || '';
      // Settings renders inside the branch that only runs when no deal is open, so
      // opening Settings while a deal was open changed the address and nothing else.
      // Close the deal on the way in, exactly as the gear button already does.
      if (/#\/settings\b/.test(h)) { setSettingsOpen(true); setOpenDealId(''); return; }
      setSettingsOpen(false);
      const d = /[#/]deal\/([A-Za-z0-9_-]+)(?:\/([A-Za-z0-9_-]+))?/.exec(h);
      if (d) { setOpenDealId(d[1]); setDealTab(d[2] || ''); return; }
      setOpenDealId('');
      const t = /#\/(overview|sourcing|deals|fund|report)\b/.exec(h);
      if (t) setMainTab(t[1] as MainTab);
      // Back out of a filtered list and the filter has to come back with it, or Back
      // returns you to the right page showing the wrong thing.
      if (t && t[1] === 'deals') {
        const f = hashParam('filter');
        setDealsFilter(DEALS_FILTERS.includes(f as DealsFilter) ? (f as DealsFilter) : 'all');
        setDealsQuery(hashParam('q'));
      }
    };
    window.addEventListener('popstate', onPop);
    // Typing or pasting an address into the bar while the app is already open fires
    // hashchange, not popstate. Without this, `#/settings` pasted from a deal page did
    // nothing at all and read as a dead link until you forced a reload.
    window.addEventListener('hashchange', onPop);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('hashchange', onPop); };
  }, []);

  // Pulse the showcase banner whenever the access profile changes, so a persona switch
  // visibly changes what the seat can access (not just the answer framing).
  useEffect(() => {
    if (!viewAs) return;
    setAccFlash(true);
    const id = setTimeout(() => setAccFlash(false), 1500);
    return () => clearTimeout(id);
  }, [viewAs, roleLabel, seatLabel, canWrite, canViewStage2]);

  // The counters and the funnel are scoped server-side to whoever asks, so they have to
  // be re-asked every time the person changes — and only the LATEST answer may win.
  //
  // Without the sequence guard the page had a race it lost silently: the first request
  // goes out on mount, before a profile has been chosen, so it is anonymous and comes
  // back with the whole book. The second goes out a moment later as the analyst. If the
  // anonymous one is slower — and it usually was, being the larger result — it lands
  // last and overwrites the scoped one, and the report reads "19 Sourced" above a table
  // of four deals. Numbering the requests and ignoring anything but the newest fixes it.
  const scopedSeq = useRef(0);
  const mainRef = useRef<HTMLElement | null>(null);
  function loadScoped() {
    const seq = ++scopedSeq.current;
    af('/api/analytics').then((r) => r.json()).then((d) => { if (seq === scopedSeq.current) setAnalytics(d); }).catch(() => {});
    af('/api/pipeline').then((r) => r.json()).then((d) => { if (seq === scopedSeq.current) setPipeline(d); }).catch(() => {});
  }

  // Critical data load with an explicit failure/retry state, so a transient API error
  // degrades to "last known data + Retry" instead of a silent blank.
  function loadDeals() {
    return af('/api/deals')
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d) => { if (Array.isArray(d)) setDeals(d); setDealsError(false); })
      .catch(() => setDealsError(true))
      .finally(() => setDealsLoading(false));
  }

  async function refreshData() {
    loadDeals();
    loadScoped();
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

  // Tell the server which showcase profile we have switched to, so the assistant in the
  // Teams channels answers as that person too. Without this the switcher only changed
  // the tab, and the same question asked in a channel came back in your own voice.
  async function setActingAs(as: string) {
    try {
      const token = ssoToken || (await getSsoToken().catch(() => null)) || '';
      await fetch('/api/teams/acting-as', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ as, ssoToken: token }),
      });
    } catch { /* the tab still switches; only the channel assistant lags */ }
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
            {/* The product answered to four names -- "Deal Dashboard" here, "THE DEAL ROOM"
            on the report, "Deal Room Report", "Deal Room Assistant". People cannot tell
            a colleague what to open. One name, and it is the one on the LP document. */}
        <div className="brand-t">The Deal Room</div>
            <div className="brand-s">Deal flow, market intel and your team’s AI assistant — in one place</div>
          </div>
        </div>
        <div className="topbar-r">
          {isDemoMode && persona?.name ? <span className="badge" title="The person you are signed in as">{persona.name}</span> : null}
          {(seatLabel || roleLabel) ? <span className="badge" title={roleLabel ? `Access level: ${roleLabel}` : 'Your role'}>{isAdmin ? '★ ' : ''}{seatLabel || roleLabel}</span> : null}
          {demoUsers.length ? (
            <select className="viewas" value={viewAs} onChange={(e) => {
              // Changing who you are is not a filter, it is a different account. Leaving the
              // open deal on screen meant the previous identity's page -- including its write
              // controls -- stayed visible until something forced a re-fetch. Go back to the
              // list and let the new identity open what it is allowed to open.
              setViewAsRole('');
              setOpenDealId('');
              setAuthContext({ as: e.target.value, viewAsRole: '' });
              try { localStorage.setItem('dr.viewAs', e.target.value); } catch { /* storage blocked */ }
              setViewAs(e.target.value);
            }} title="Sign in as another person to see their view and their access — the assistant in your Teams channels answers as them too">
              {demoUsers.map((u) => (<option key={u.id} value={u.upn}>{u.label}</option>))}
            </select>
          ) : null}
          {teamsInfo?.inTeams ? <a className="dashlink" href={cfg?.appBaseUrl || window.location.origin} target="_blank" rel="noopener noreferrer">Open web console ↗</a> : null}
            {canViewStage2 ? <button className="asktoggle on" onClick={() => setIntakeOpen(true)} title="Create a new deal via guided intake">+ New deal</button> : null}
          {isAdmin ? <button className="gearbtn" onClick={() => setAdminGroupsOpen(true)} title="Admin — deal groups &amp; territories" aria-label="Deal groups and territories"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }} aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg></button> : null}
          {/* Hidden while a deal is open, because the deal page has its own assistant
              button and its own deal-scoped panel. Leaving this one on screen gave the
              reader two identical buttons and, worse, once the portfolio panel stopped
              rendering over a deal it would have been a button that visibly does
              nothing. One assistant, one button, per screen. */}
          {!openDealId ? <button className={`asktoggle${chatOpen ? ' on' : ''}`} onClick={() => setChatOpen((v) => !v)}>{chatOpen ? 'Hide the assistant' : '💬 Ask the assistant'}</button> : null}
          <Notifications af={af} viewAs={viewAs} onOpenDeal={(id) => { setSettingsOpen(false); setOpenDealId(id); }} />
          <button className="gearbtn" onClick={() => setTheme(toggleTheme())} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-label="Toggle light or dark theme">{theme === 'dark' ? '☀' : '🌙'}</button>
          {/* Closing the deal on the way in. Settings renders in the branch this
              ternary takes when no deal is open, so with a deal open the gear used to
              light up accent-blue and change nothing on screen — a control that
              asserts a state change that did not happen, which is the kind of thing
              that makes people stop trusting every other control on the page. */}
          <button className={`gearbtn${settingsOpen ? ' on' : ''}`} onClick={() => { setOpenDealId(''); setSettingsOpen((v) => !v); }} title="Settings — data sources & administration" aria-label="Settings">⚙</button>
        </div>
      </header>

      {viewAs && sbnAck !== (persona?.id || viewAs) ? (
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
            .sbn-x { flex:none; border:0; background:none; color:var(--muted); font-size:15px; line-height:1; cursor:pointer; padding:2px 4px; border-radius:4px; }
            .sbn-x:hover { color: var(--fg); background: var(--chip); }
          `}</style>
          {/* A DISCLAIMER ABOUT YOUR OWN CREDIBILITY IS NOT A FEATURE.
              This read "You are looking at this firm through someone else's eyes — X. The
              deals are the real ones; only the person is borrowed" — above the fold, on
              every screen, every time the seat changed. Switching seats is the strongest
              ten seconds in a walkthrough and the product spent it arguing that it is not
              a fake, which is not a sentence a shipped product says about itself.
              Impersonation is an ordinary administrative capability. State it as one: who
              you are now, and what that person may do. */}
          <div role="note" className={`sbn${accFlash ? ' flash' : ''}`}>
            <span title="Their role controls what they can open — access rules are still enforced. Their job controls how the assistant frames an answer for them.">Now viewing as <strong>{persona?.name || 'another seat'}</strong>{seatLabel ? `, ${seatLabel}` : ''}. Access rules are enforced as they are for them.</span>
            <span className="sbn-chips">
              {/* This fell back to the literal string "role", which is a variable name
                  printed at a reader. If we cannot say what their access is, say nothing. */}
              {roleLabel ? <span className="sbn-chip">{isAdmin ? '★ ' : ''}{roleLabel}</span> : null}
              <span className={`sbn-chip ${canWrite ? 'on' : 'off'}`}>{canWrite ? 'Can act · write' : 'Read-only'}</span>
              {/* "Stage-2 visible" was on every screen in the product and defined on none
                  of them. Stage 2 is our internal name for the confidential half of a
                  deal -- diligence findings, financials, signed terms, valuations -- as
                  opposed to its position in the pipeline, which everybody can see. Say
                  what is behind the door rather than the number we gave the door. */}
              <span className={`sbn-chip ${canViewStage2 ? 'on' : 'off'}`} title={canViewStage2 ? 'You can open diligence findings, financials, signed terms and valuations on the deals you are on.' : 'You can see where each deal stands, but not its diligence findings, financials, signed terms or valuations.'}>{canViewStage2 ? 'Full deal detail' : 'Deal status only'}</span>
            </span>
            <button
              className="sbn-x"
              title="Got it — hide this. It comes back if you switch to someone else."
              aria-label="Hide the access-review note"
              onClick={() => {
                const key = persona?.id || viewAs;
                setSbnAck(key);
                try { localStorage.setItem('dr_sbn_ack', key); } catch { /* private mode — it just stays visible */ }
              }}
            >×</button>
          </div>
        </>
      ) : null}

      {/* Opening a deal REPLACES the workspace rather than floating a modal over it.
          A deal is the main thing you work on, not an interruption to something else —
          so it gets the whole canvas, and the way back is an explicit breadcrumb.

          The five main tabs stay mounted. They used to be deleted the moment a deal
          opened, which made the deal page — the screen an analyst lives on all day, and
          the one a Teams link drops you into — the only screen in the product with no
          way to reach the other four. Getting from a deal to Fund & Portfolio meant
          going back to the list first and waiting for it to rebuild. People stopped
          moving between contexts and opened a second browser tab instead, which is how
          you end up with two personas and two stale sessions at once. */}
      <nav className="maintabs" aria-label="Main">
        {mainTabs.map(([k, label]) => {
          const on = !settingsOpen && mainTab === k && !openDealId;
          return (
            <button
              key={k}
              className={`maintab${on ? ' on' : ''}`}
              // Which page you are on was carried by colour alone, so a screen-reader
              // user heard five identical buttons.
              aria-current={on ? 'page' : undefined}
              onClick={() => { setSettingsOpen(false); setOpenDealId(''); setMainTab(k); }}
            >{label}</button>
          );
        })}
      </nav>
      {openDealId ? (
        <nav className="crumbs" aria-label="Breadcrumb">
          <button className="crumb-back" onClick={() => setOpenDealId('')}>
            <span aria-hidden="true">←</span> {backLabel}
          </button>
          <span className="crumb-sep" aria-hidden="true">/</span>
          <span className="crumb-now" aria-current="page">{openDealName || 'Deal'}</span>
        </nav>
      ) : null}

      {dealsError ? (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 12px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bad-br)', background: 'var(--bad-bg)', fontSize: 13 }}>
          <span>⚠ Couldn’t refresh deals — showing the last known data.</span>
          <button className="maintab" style={{ marginLeft: 'auto' }} onClick={() => loadDeals()}>Retry</button>
        </div>
      ) : null}

      <div className="layout">
        {openDealId && seatReady ? (
          <DealDetail key={openDealId} dealId={openDealId} canViewStage2={canViewStage2} canWrite={canWrite} agents={visibleAgents} deals={deals} viewAsRole={viewAsRole} onChanged={refreshData} onClose={() => setOpenDealId('')} backLabel={backLabel} initialTab={dealTab || undefined} onTabChange={setDealTab} demoMode={isDemoMode}
            />
        ) : openDealId ? (
          /* A deal link opens the deal before anyone has been identified, and the first
             request would go out anonymous -- which the backend answers as the default
             role, i.e. with the whole record. A partner pasted a deal link into a
             read-only analyst's window and read the IRR, the MOIC and the equity cheque
             on a deal that seat is not on. The seat has to be attached to the request
             before the request is made, so the deal waits for it. */
          <main className="main" ref={mainRef}>
            <section className="panel" style={{ margin: 12 }}>
              <div className="panel-h">Opening this deal…</div>
              <div className="muted" style={{ padding: '10px 12px', fontSize: 13 }}>Checking what you are cleared to see before anything is loaded.</div>
            </section>
          </main>
        ) : (
          <main className="main" ref={mainRef}>
          {settingsOpen ? (
            <Settings isAdmin={isAdmin} ssoToken={ssoToken} viewAs={viewAs} onClose={() => setSettingsOpen(false)} />
          ) : mainTab === 'overview' ? (
            <>
              <AgentGuide roleLabel={roleLabel} canViewStage2={canViewStage2} canWrite={canWrite} onAsk={() => setChatOpen(true)} />
                <Dashboard pipeline={pipeline} deals={deals} dealsLoading={dealsLoading} market={market} config={config} onAsk={askAbout} onAskQuestion={askQuestion} onOpen={setOpenDealId} canWrite={canWrite} roleLabel={roleLabel} viewerKey={`${viewAs}|${viewAsRole}`} layoutKey={viewAs} onGoSourcing={() => setMainTab('sourcing')} compare={dealsCompare} onCompareChange={setDealsCompare} demoMode={isDemoMode} />
            </>
          ) : mainTab === 'sourcing' ? (
            <Stage1 deals={deals} onChanged={refreshData} onOpenDeal={setOpenDealId} />
          ) : mainTab === 'fund' ? (
            <Fund deals={deals} onOpenDeal={setOpenDealId} />
          ) : mainTab === 'report' ? (
            <PowerBI ssoToken={ssoToken} analytics={analytics} pipeline={pipeline} deals={deals} market={market} config={config} dealId="" canCertify={canWrite && /partner|admin/i.test(`${viewAsRole || ''} ${roleLabel || ''}`)} />
          ) : (
            <Deals
              deals={deals}
              dealsLoading={dealsLoading}
              onOpen={(id) => {
                if (mainRef.current) setDealsScrollTop(mainRef.current.scrollTop);
                setOpenDealId(id);
              }}
              onAsk={askAbout}
              filter={dealsFilter}
              query={dealsQuery}
              compare={dealsCompare}
              onFilterChange={setDealsFilter}
              onQueryChange={setDealsQuery}
              onCompareChange={setDealsCompare}
              onGoToSourcing={() => setMainTab('sourcing')}
            />
          )}
          </main>
        )}
        {/* Not while a deal is open. The deal page carries its own assistant, already
            scoped to that deal; this one is scoped to the whole portfolio. Both could
            be on screen at once — measured at 459px + 380px of a 1440px window, two
            conversations, two "Ask the assistant" buttons — and the reader could not
            tell which thread they had asked. */}
        {chatOpen && !openDealId ? <ChatPanel agents={visibleAgents} deals={deals} focusDealId={chatFocusDealId} onClose={() => setChatOpen(false)} viewAsRole={viewAsRole} canWrite={canWrite} demoMode={isDemoMode} seed={chatSeed} seedNonce={chatSeedNonce} /> : null}
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
/* Columns are independent stacks, not a table: without this the shorter one stretches to
   the taller one's height and renders as a tall empty panel. */
.g2 { grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); align-items: start; }
.g3 { grid-template-columns: minmax(0, 260px) minmax(0, 1.4fr) minmax(0, 320px); }
@media (max-width: 1150px) { .g2, .g3 { grid-template-columns: 1fr; } }
/* Stacked, the columns fall in source order, which put the four headline numbers below
   the whole briefing -- the exact position they were moved out of. The visual fix lived
   in the grid; the reading order lives in the DOM. */
@media (max-width: 1150px) { .grid.g2 { display: flex; flex-direction: column; } .grid.g2 > .hero-r { order: -1; } }

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
/* Distinct from .aibadge on purpose — this names a real integration, not an AI claim. */
.poweredby { font-size: 10.5px; font-weight: 700; padding: 1.5px 8px; border-radius: 999px; color: var(--accent); background: var(--chip); border: 1px solid var(--accent); white-space: nowrap; }
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
.att-more { padding: 8px 14px; border-bottom: 1px solid var(--border); }
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
   workstream lead and to an IC chair, and the reader is entitled to know which one the
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
.stage1 .fstep:disabled { cursor: default; opacity: .75; }
.stage1 .fstep.on { outline: 2px solid var(--accent); }

/* One deals list, filtered. Rows not cards: the question is "which of these needs me
   today", which is a scanning task down a column, not a browsing task across a grid. */
.dealsview { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.dv-controls { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.dv-filters { display: flex; gap: 4px; flex-wrap: wrap; }
.dv-filter { border: 1px solid var(--border); background: none; color: var(--muted); border-radius: 14px; padding: 4px 10px; cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
.dv-filter:hover { color: var(--fg); }
.dv-filter:disabled { opacity: .45; cursor: default; }
.dv-filter:disabled:hover { color: var(--muted); }
/* Refused rather than removed: these stay focusable and readable, they just have
   nothing behind them. */
.isoff { opacity: .45; cursor: default; }
.dv-filter.isoff:hover, .comparebtn.isoff:hover, .askbtn.isoff:hover { color: var(--muted); border-color: var(--border); background: var(--chip); }
.dv-filter.on { color: #fff; background: var(--accent); border-color: var(--accent); }
.dv-count { opacity: .7; font-weight: 500; }
.dv-search { margin-left: auto; border: 1px solid var(--border); background: var(--bg); color: var(--fg); border-radius: 6px; padding: 5px 10px; font: inherit; font-size: 13px; min-width: 180px; }
.dv-rows { display: flex; flex-direction: column; }
.dv-row { display: grid; grid-template-columns: 104px minmax(120px, 1.1fr) minmax(120px, 1fr) minmax(180px, 2.4fr) 74px auto; gap: 12px; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--border); cursor: default; font-size: 13px; }
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
.dv-actions { display: inline-flex; align-items: center; gap: 8px; justify-self: end; }
.dv-askbtn { white-space: nowrap; }
.comparebtn { border: 1px solid var(--border); background: var(--chip); color: var(--muted); border-radius: 6px; padding: 3px 9px; cursor: pointer; font: inherit; font-size: 12px; white-space: nowrap; }
.comparebtn:hover { border-color: var(--accent); color: var(--accent); }
.comparebtn.on { border-color: var(--accent); color: var(--accent); background: var(--surface); }
/* Opening the deal is the whole point of the row and it read as a caption beside the
   company name — an outline the same weight as Compare and Ask. It is the primary action
   and now looks like one; the other two stay quiet beside it. */
.openbtn { border: 1px solid var(--accent); background: var(--accent); color: #fff; border-radius: 6px; padding: 5px 14px; cursor: pointer; font: inherit; font-size: 12px; font-weight: 700; white-space: nowrap; }
.openbtn:hover { filter: brightness(1.08); }
/* The company name is what people click first, so it has to accept the click. */
.dv-open { border: none; background: none; padding: 0; font: inherit; font-weight: 600; color: var(--fg); text-align: left; cursor: pointer; }
.dv-open:hover { color: var(--accent); text-decoration: underline; }
/* A cited source that names a page in this product opens it. The ones that name a record
   rather than a page stay as text, because a link that goes nowhere is worse. */
.srcbtn { border: none; background: none; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-align: left; }
.srcbtn:hover { text-decoration: underline; }
.linkbtn { border: none; background: none; color: var(--accent); cursor: pointer; font: inherit; text-decoration: underline; padding: 0; }
.cand-list { display: flex; flex-direction: column; }
.cand { display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.cand:last-child { border-bottom: none; }
.cand-main { flex: 1; min-width: 0; }
.cand-top { display: flex; align-items: center; gap: 8px; }
.cand-score { position: relative; }
.cand-score > summary { list-style: none; cursor: pointer; }
.cand-score > summary::-webkit-details-marker { display: none; }
.cand-score[open] > summary { outline: 1px solid var(--border); }
.cand-score-body { position: absolute; z-index: 40; top: calc(100% + 5px); left: 0; min-width: 290px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px; box-shadow: 0 6px 20px rgba(0,0,0,.22); display: flex; flex-direction: column; gap: 3px; }
.cand-score-basis { font-size: 11.5px; color: var(--muted); line-height: 1.5; margin-bottom: 4px; }
.cand-score-row { display: flex; justify-content: space-between; gap: 14px; font-size: 12px; }
.cand-score-row .pos { color: var(--good); } .cand-score-row .warn { color: var(--warn); } .cand-score-row .neg { color: var(--muted); }
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
/* The standing line that says how the page is arranged and offers to change it. Kept
   deliberately quiet — it is scaffolding, not content. */
.dashbar { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 12px; margin-bottom: -6px; }
.modlist { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 0 16px; padding: 8px 10px 12px; }
.modrow { display: flex; align-items: flex-start; gap: 10px; padding: 8px 8px; border-radius: 8px; cursor: pointer; }
.modrow:hover { background: var(--chip); }
.modrow input { margin: 2px 0 0; width: 15px; height: 15px; accent-color: var(--accent); cursor: pointer; flex: none; }
.modrow .modname { display: block; font-size: 12.5px; font-weight: 650; }
.modrow .sub { display: block; }
.modrow.off .modname, .modrow.off .sub { opacity: .5; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
/* In the narrow hero column auto-fit fits three, so the fourth tile sat alone beside
   empty space -- on the strip a partner reads first. */
.dash .grid.g2 .kpis { grid-template-columns: repeat(2, 1fr); }
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
/* --- deal lifecycle bar: how long the process actually takes, not where the money sits --- */
.lifecycle { padding: 4px 16px 16px; }
.lc-bar { display: flex; gap: 3px; height: 34px; margin: 10px 0 6px; border-radius: 8px; overflow: hidden; }
.lc-seg { display: flex; align-items: center; justify-content: center; min-width: 36px; color: var(--accent-fg); font-size: 12px; font-weight: 700; }
.lc-seg.lc-good { background: var(--good); }
.lc-seg.lc-warn { background: var(--warn); }
.lc-seg.lc-bad { background: var(--bad); }
.lc-days { white-space: nowrap; }
.lc-labels { display: flex; gap: 3px; }
.lc-label { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted); min-width: 0; }
.lc-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.lc-dot.lc-good { background: var(--good); }
.lc-dot.lc-warn { background: var(--warn); }
.lc-dot.lc-bad { background: var(--bad); }
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
/* 380px was a sidebar, and the assistant now writes decision-grade answers into it —
   a thousand characters of analysis in a column that narrow is a ribbon of text nobody
   reads. It scales with the window, and the reader can widen it further for a long one. */
.chatpanel { flex: 0 0 clamp(420px, 38vw, 760px); max-width: 760px; min-width: 0; display: flex; flex-direction: column; border-left: 1px solid var(--border); background: var(--surface); min-height: 0; }
.chatpanel.wide { flex: 0 0 min(1180px, 82vw); max-width: min(1180px, 82vw); }
/* Long words — a URL, a long company name — must wrap rather than force a scrollbar and
   truncate everything beside them. */
.chatpanel .md { overflow-wrap: anywhere; }
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
.typing-wrap { display:inline-flex; align-items:center; gap:8px; }
.doc-row { display:flex; align-items:center; gap:8px; padding:6px 8px; border:1px solid var(--border); border-radius:8px; }
.doc-open { flex:1; display:flex; align-items:center; gap:10px; background:none; border:0; padding:4px; text-align:left; cursor:pointer; color:inherit; font:inherit; border-radius:6px; }
.doc-open:hover { background: var(--chip); }
.doc-ico { font-size:18px; }
.doc-name { font-weight:600; flex:1; }
.doc-meta { font-size:12px; white-space:nowrap; }
.doc-acts { display:flex; gap:6px; flex:none; }
.btn.xs { font-size:11px; padding:2px 8px; }
.doc-reader { border:1px solid var(--border); border-radius:10px; overflow:hidden; margin-bottom:12px; background:var(--card); }
.doc-reader-bar { display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid var(--border); }
.doc-reader-name { font-weight:700; flex:1; }
.doc-frame { width:100%; height:min(70vh, 720px); border:0; display:block; background:#fff; }
.doc-reader-note { padding:8px 10px; font-size:12px; border-top:1px solid var(--border); }
.notif { position: relative; display: inline-flex; }
.notif-dot { position:absolute; top:-2px; right:-2px; min-width:15px; height:15px; padding:0 3px; border-radius:999px; background:var(--bad,#dc2626); color:#fff; font-size:9.5px; font-weight:800; line-height:15px; text-align:center; }
.notif-panel { position:absolute; top:calc(100% + 8px); right:0; width:min(420px, 92vw); max-height:70vh; overflow:auto; z-index:60; background:var(--card); border:1px solid var(--border); border-radius:10px; box-shadow:0 12px 32px rgba(0,0,0,.22); }
.notif-head { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px; border-bottom:1px solid var(--border); }
.notif-title { font-weight:700; }
.notif-empty { padding:14px 12px; color:var(--muted); font-size:12.5px; line-height:1.5; }
.notif-list { display:flex; flex-direction:column; }
.notif-item { display:flex; gap:10px; align-items:flex-start; text-align:left; padding:10px 12px; background:none; border:0; border-bottom:1px solid var(--border); cursor:pointer; color:inherit; font:inherit; }
.notif-item:hover { background: var(--chip); }
.notif-item.is-new { background: var(--chip); }
.notif-kind { flex:none; width:20px; height:20px; border-radius:999px; display:grid; place-items:center; font-size:11px; font-weight:800; border:1px solid var(--border); }
.notif-kind.k-needs-you { color:var(--warn,#b45309); border-color:var(--warn,#b45309); }
.notif-kind.k-decision { color:var(--good,#15803d); border-color:var(--good,#15803d); }
.notif-body { display:flex; flex-direction:column; gap:2px; min-width:0; }
.notif-line { font-weight:600; }
.notif-sub { font-size:11.5px; color:var(--muted); }
.notif-foot { padding:9px 12px; font-size:11.5px; color:var(--muted); border-top:1px solid var(--border); }
.typing-status { font-size:12px; color:var(--muted); }
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
/* Costs nothing until it is focused, and saves twenty tab stops when it is. */
.skiplink { position: absolute; left: -9999px; top: 0; z-index: 40; background: var(--accent); color: #fff; border: 0; border-radius: 0 0 6px 0; padding: 8px 14px; font: inherit; font-weight: 600; cursor: pointer; }
.skiplink:focus-visible { left: 0; }
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
  .dv-row { grid-template-columns: auto 1fr auto; grid-template-areas: 'chip name size' 'stage stage stage' 'why why why' 'actions actions actions'; row-gap: 4px; }
  .dv-chip { grid-area: chip; } .dv-name { grid-area: name; } .dv-size { grid-area: size; }
  .dv-stage { grid-area: stage; } .dv-why { grid-area: why; }
  .dv-actions { grid-area: actions; justify-self: start; }
  .dv-actions { flex-wrap: wrap; }
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
   The agent chat opens as a right-side sub-panel OVER the deal so it stays in focus.

   min-width: 0 is load-bearing. As a flex item in a row, .dealpage defaults to a
   min-width of auto, which means min-content, and its widest descendant is the
   twelve-button tab strip. Without this the strip could not scroll inside itself,
   so it pushed the deal page out to 1626px and the whole window scrolled sideways
   at every viewport we support -- on the screen this product is opened in most.
   Its sibling .main has always carried this, which is why the fault only ever
   showed on a deal. */
.dealpage { flex: 1; min-width: 0; min-height: 0; display: flex; }
.dealpage > .drawer { width: 100%; border-left: none; border-right: none; box-shadow: none; }
.drawer-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 40; display: flex; justify-content: center; }
.drawer { width: min(1180px, 100vw); height: 100%; position: relative; background: var(--bg); border-left: 1px solid var(--border); border-right: 1px solid var(--border); display: flex; flex-direction: column; box-shadow: 0 0 44px rgba(0,0,0,.38); }
.drawer-split { flex: 1; min-height: 0; display: flex; position: relative; }
.drawer-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.drawer-chat { flex: none; width: min(440px, 42%); min-width: 320px; display: flex; background: var(--bg); border-left: 1px solid var(--border); }
.drawer-chat .chatpanel { flex: 1; max-width: none; border-left: none; }
/* Below about 980px there is not room for a deal and a conversation side by side, so
   the assistant goes back to sitting over the deal -- but over the DEAL, never over
   the deal's header, which is where the buttons a partner reaches for actually live. */
@media (max-width: 980px) {
  .drawer-chat { position: absolute; top: 0; right: 0; bottom: 0; width: min(460px, 92%); z-index: 6; box-shadow: -8px 0 26px rgba(0,0,0,.30); }
}
.badlink { margin: 0; padding: 9px 16px; font-size: 12.5px; background: var(--warn-bg, #fff6e5); color: var(--warn, #8a5a00); border-bottom: 1px solid var(--border); }
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
/* Every one of these headers is written as Title<span className="muted">qualifier</span>,
   and with no layout on the container the two ran straight into each other — the deal
   page was printing "Deal workspaceset up by Simone Garnett". Match .panel-h: the
   qualifier belongs on the right, in its own column. */
.dd-panel-h { font-weight: 700; padding: 10px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.dd-panel-h .muted { font-weight: 400; text-align: right; }
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
.artifact .a-act { margin-left: auto; flex: 0 0 auto; }
.dd-figs { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; padding: 12px 14px; }
.dd-fig { border: 1px solid var(--border); border-radius: 10px; padding: 10px; background: var(--surface); }
.dd-fig .fig-v { font-size: 18px; font-weight: 700; }
.dd-fig .fig-l { font-size: 12px; }
.dd-fig .fig-src { color: var(--muted); font-size: 11px; margin-top: 3px; }
.dd-fig .fig-src-none { color: var(--warn); }
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
/* The deal identity block and the where-to-start prompt fold away once you begin
   reading, and unfold again at the top. The title, the four actions and every tab
   stay exactly where they were: you still need to know which deal you are in, and
   you still need to be able to leave the page you are on. The inline styles on the
   where-to-start banner outrank a class selector, hence !important -- the
   alternative was to move a dozen computed colours into global CSS. */
.dd-topmeta, .dd-nba { transition: max-height .18s ease, opacity .12s ease; }
.dd-condensed .dd-topmeta, .dd-condensed .dd-nba { max-height: 0 !important; opacity: 0 !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important; border-width: 0 !important; }
@media (prefers-reduced-motion: reduce) { .dd-topmeta, .dd-nba { transition: none; } }
/* Nine tabs on one line ran off the right-hand edge of a normal laptop window:
   "Diligence workstrea..." was chopped in half and Documents and More were past the
   edge, behind a scrollbar a few pixels tall that nobody notices. Two of the most
   valuable things in the product -- the data room and the document generator -- were
   literally off-screen, and a partner exploring on her own never found either.
   Let the strip wrap onto a second line: a tab you cannot see is a tab you do not have. */
.dd-tabs { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px 0; border-bottom: 1px solid var(--border); background: var(--surface); }
.dd-tab { border: none; background: none; color: var(--muted); padding: 8px 12px; cursor: pointer; font: inherit; font-weight: 600; border-bottom: 2px solid transparent; white-space: nowrap; }
.dd-tab.on { color: var(--accent); border-bottom-color: var(--accent); }
/* Separates the five places you can go from the two things that comment on wherever you
   are. A hairline rather than a heading, because the reader should feel the ranking
   rather than have to read it. */
.dd-tabdiv { flex: 0 0 auto; align-self: center; width: 1px; height: 18px; background: var(--border); margin: 0 8px; }
/* The channel and the audit trail. Quieter than a tab on purpose: they are commentary,
   and they should not compete with the five for the same glance. */
/* The rail is its own navigation, below the section row. */
.dd-rails { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 12px 0; background: var(--surface); }
.dd-rail { border: none; background: none; color: var(--muted); padding: 6px 10px; cursor: pointer; font: inherit; font-size: 12px; border-bottom: 2px solid transparent; white-space: nowrap; }
.dd-rail:hover { color: var(--fg); }
.dd-rail.on { color: var(--accent); border-bottom-color: var(--accent); }
/* Sub-navigation inside a group. A segmented control rather than a second tab row, so
   there is never any doubt about which of the two rows is the page you are on. */
.dd-subtabs { display: flex; flex-wrap: wrap; gap: 2px; padding: 8px 12px; background: var(--surface); border-bottom: 1px solid var(--border); }
.dd-subtab { border: 1px solid transparent; background: none; color: var(--muted); padding: 5px 11px; border-radius: 999px; cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; white-space: nowrap; }
.dd-subtab:hover { background: var(--hover); color: var(--fg); }
.dd-subtab.on { background: var(--chip); border-color: var(--border); color: var(--fg); }
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

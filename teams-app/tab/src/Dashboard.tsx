// The "Deals Overview" tab — the portfolio cockpit.
//
// It answers the same three questions the DEAL cockpit answers, one level up, in the
// same visual language, so moving from the portfolio into a deal feels like zooming
// rather than switching applications:
//   1. What changed?      -> Portfolio briefing (narrative, cited, AI-labelled)
//   2. What needs me?     -> Ranked attention queue across every visible deal
//   3. Where are we?      -> KPIs, capital by phase, funnel, deal cards, market intel
//
// The briefing and the queue come from GET /api/home-desk, which composes them from
// records the platform already owns and scopes them to the deals THIS caller can see.
// Everything below the hero is the existing operational detail, unchanged in behaviour.
//
// The page is assembled from named sections rather than written as one block, because
// which of them are worth looking at depends entirely on the job the reader does. Each
// one can be turned off, and the choice is kept per persona. See dashLayout.ts.
import { useEffect, useState } from 'react';
import { af } from './authFetch';
import { Narrative, SourceList, Tag, clock, type Para } from './deskUi';
import { DASH_MODULES, readHidden, writeHidden, rememberWho, type ModuleKey } from './dashLayout';
import type { Pipeline, Deal, MarketIntel, BackendConfig } from './types';

type HomeAttention = {
  id: string; rank: number; dealId: string; company: string; stageName?: string | null;
  readiness: number; icInDays?: number | null;
  tag: string; tone: 'bad' | 'warn' | 'good' | 'muted'; why: string; impact?: string | null; basis?: string;
  laneLabel?: string | null; laneProgress?: number | null; placedBy?: string | null; gating?: string[];
};
type HomeCommitment = {
  dealId: string; company: string; author: string; headline: string; quote?: string;
  dueText?: string | null; laneLabel?: string | null; confidence?: string; basis?: string; yours?: boolean;
};
type HomeSeat = {
  personaId: string | null; label: string | null; focus: string | null;
  kind: string | null; lanes: string[]; laneLabels: string[]; tailored: boolean;
};
type HomeDesk = {
  generatedAt: string;
  roleLabel?: string | null;
  seat?: HomeSeat | null;
  briefing: { generatedAt: string; paragraphs: Para[]; sources: string[]; suggestions: string[] };
  attention: HomeAttention[];
  attentionEmpty?: string | null;
  phases: { key: string; label: string; count: number; capital: number }[];
  workiq: { total: number; deals: number; yours?: number; items: HomeCommitment[] };
  kpis: { key: string; label: string; value: string; sub: string }[];
  counts: { deals: number; attention: number; icReady: number; commitments: number };
};

function money(n?: number): string {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n)}`;
}

export default function Dashboard({ pipeline, deals, market, config, onAsk, onAskQuestion, onOpen, canWrite, roleLabel, viewerKey, layoutKey, onGoSourcing }: {
  pipeline: Pipeline | null; deals: Deal[]; market: MarketIntel | null;
  config: BackendConfig | null; onAsk: (dealId: string) => void; onAskQuestion?: (q: string) => void;
  onOpen: (dealId: string) => void; canWrite?: boolean; roleLabel?: string | null;
  // Identifies WHO the page is currently being rendered for, so the briefing can be
  // re-fetched on an identity switch rather than only on a change in deal count.
  viewerKey?: string;
  // Which persona owns the arrangement of this page. Deliberately NOT viewerKey: that
  // also carries the role override, so changing role would silently hand you a
  // different page than the one you built.
  layoutKey?: string;
  // Lets the empty-tenant card send someone to the screen where a deal comes from.
  // A first-run message that names the next step but cannot take you there is only
  // half an answer.
  onGoSourcing?: () => void;
}) {
  const fabric = config?.fabric || market?.info;
  const comps = market?.comparableDeals || [];
  const precedents = market?.icPrecedents || [];
  const benchmarks = market?.benchmarkFindings || [];

  // The portfolio briefing. It is additive: if the call fails, everything below still
  // renders from the deal list, so a briefing outage never takes the home page down.
  const [home, setHome] = useState<HomeDesk | null>(null);
  const [homeLoading, setHomeLoading] = useState(true);
  const [evidence, setEvidence] = useState(false);
  const [briefOpen, setBriefOpen] = useState(true);
  // Modules render OPEN. A collapsed card is a header floating above dead space,
  // which reads as a layout bug rather than a choice — and it hides the very thing
  // that justifies the card being on the page. Hiding stays available, it is just
  // not the default.
  const [showWorkiq, setShowWorkiq] = useState(true);

  // Which sections this persona keeps, and the panel for changing that.
  const [hidden, setHidden] = useState<ModuleKey[]>(() => readHidden(layoutKey));
  const [customise, setCustomise] = useState(false);
  // A different persona is a different job, so the arrangement is re-read rather than
  // carried across — otherwise whoever you switch to inherits the last person's page.
  useEffect(() => { rememberWho(layoutKey); setHidden(readHidden(layoutKey)); }, [layoutKey]);

  const off = new Set<ModuleKey>(hidden);
  const shows = (k: ModuleKey) => !off.has(k);
  const toggle = (k: ModuleKey) => {
    const next = off.has(k) ? hidden.filter((x) => x !== k) : [...hidden, k];
    setHidden(next);
    writeHidden(layoutKey, next);
  };
  const showEverything = () => { setHidden([]); writeHidden(layoutKey, []); };

  function loadHome() {
    setHomeLoading(true);
    af('/api/home-desk')
      .then((r) => (r.ok ? r.json() : null))
      .then(setHome)
      .catch(() => setHome(null))
      .finally(() => setHomeLoading(false));
  }
  // Re-derive when the visible deal list changes — switching persona or view-as role
  // changes which deals are in scope, and the briefing must never lag behind them.
  // Reload when the deal set OR the viewer changes.
  //
  // Keying on deals.length alone was survivable when every seat got the same page. It
  // is not now: switching between two seats that can see the same nineteen deals leaves
  // the count unchanged, so the effect would not re-fire and the previous person's desk
  // would stay on screen — lane tiles, queue and all — under the new person's name.
  useEffect(loadHome, [deals.length, viewerKey]);

  // Derive the headline counts from the deals THIS caller can actually see, so the
  // totals always match the deal cards below (and change when the persona changes).
  //
  // There is deliberately NO fallback to /api/analytics. That endpoint takes no
  // identity and returns platform-wide totals, so using it when the deal list is empty
  // meant the one viewer who could see nothing — an observer, or someone out of
  // territory — was shown the count and value of every deal in the firm. An empty list
  // is an answer; it is not a reason to reach for an unscoped number.
  const inDiligenceRe = /diligence|approval/i;
  const liveDeals = deals.length;
  const inDiligence = deals.filter((d) => inDiligenceRe.test(`${d.stage || ''} ${d.stageName || ''}`)).length;
  const avgReadiness = deals.length
    ? Math.round(deals.reduce((s, d) => s + (d.readiness || 0), 0) / deals.length)
    : 0;

  // Day-to-day PE headline data, derived from the deals THIS caller can see.
  const pipelineValue = deals.reduce((s, d) => s + (d.dealSize || 0), 0) * 1e6; // total EV in flight
  const avgCheck = deals.length ? pipelineValue / deals.length : 0;
  const sectors = new Set(deals.map((d) => d.sector).filter(Boolean)).size;
  const icReady = deals.filter((d) => (d.readiness ?? 0) >= 80).length;
  // "Next to committee" = the soonest UPCOMING IC among pre-IC deals (never a past-IC,
  // owned/exiting deal — which would show negative days).
  const withIC = deals.filter((d) => typeof d.daysToIC === 'number' && (d.daysToIC as number) >= 0 && /diligence|approval|screen|origin|sourc/i.test(`${d.stage || ''} ${d.stageName || ''}`));
  const nearestIC = withIC.length ? withIC.reduce((a, b) => ((a.daysToIC as number) <= (b.daysToIC as number) ? a : b)) : null;

  const kpis = [
    { label: 'Live deals', value: String(liveDeals), sub: `${inDiligence} in diligence` },
    { label: 'Pipeline value', value: money(pipelineValue), sub: liveDeals ? `avg ${money(avgCheck)} · ${sectors} sector${sectors === 1 ? '' : 's'}` : '—' },
    { label: 'Avg IC readiness', value: `${avgReadiness}%`, sub: `${icReady} ready for IC` },
    { label: 'Next IC', value: nearestIC ? `${nearestIC.daysToIC}d` : '—', sub: nearestIC ? nearestIC.company : 'none scheduled' },
  ];

  // What needs action before it slips: approaching IC but not ready, or early / stalled.
  const priority = (d: Deal) => {
    const r = d.readiness ?? 0;
    const days = typeof d.daysToIC === 'number' ? d.daysToIC : 999;
    if (days <= 21 && r < 80) return { rank: 0, tag: 'Approaching IC', cls: 'bad', why: `IC in ${days}d but only ${r}% ready — close the diligence gaps first` };
    if (r < 40) return { rank: 1, tag: 'Early', cls: 'warn', why: `${r}% IC-ready — needs diligence to progress` };
    if (r >= 80) return { rank: 3, tag: 'IC-ready', cls: 'ok', why: `${r}% ready — nothing outstanding` };
    return { rank: 2, tag: 'On track', cls: 'ok', why: 'No IC date close and nothing flagged' };
  };
  const attention = deals
    .map((d) => ({ d, p: priority(d) }))
    .filter((x) => x.p.rank <= 1)
    .sort((a, b) => a.p.rank - b.p.rank || ((a.d.daysToIC ?? 999) - (b.d.daysToIC ?? 999)))
    .slice(0, 6);

  // Prefer the server's queue — it reasons over the full deal record (lane owners,
  // step position) that the list summary doesn't carry. The local derivation stays
  // as the fallback so the page is never empty just because one call failed.
  const attentionRows: HomeAttention[] = home?.attention?.length
    ? home.attention
    : attention.map(({ d, p }, i) => ({
      id: `local-${d.id}`,
      rank: i + 1,
      dealId: d.id,
      company: d.company,
      stageName: d.stageName || d.stage || null,
      readiness: d.readiness ?? 0,
      icInDays: typeof d.daysToIC === 'number' ? d.daysToIC : null,
      tag: p.tag,
      tone: p.cls === 'ok' ? 'good' : (p.cls as 'bad' | 'warn'),
      why: p.why,
      impact: null,
      basis: 'IC readiness board',
    }));

  // Where the live capital sits in the deal process.
  const PHASES = [
    { key: 'diligence', label: 'Diligence & Approval', re: /diligence|approval/i },
    { key: 'execution', label: 'Execution & Closing', re: /execution|closing|signing/i },
    { key: 'value', label: 'Value & Exit', re: /value|exit|owned|monitor/i },
  ];
  const byPhase = PHASES.map((ph) => {
    const ds = deals.filter((d) => ph.re.test(`${d.stage || ''} ${d.stageName || ''}`));
    return { key: ph.key, label: ph.label, count: ds.length, capital: ds.reduce((s, d) => s + (d.dealSize || 0), 0) * 1e6 };
  });

  // Side-by-side comparison: pick 2–4 deals and scan the same decision fields at once.
  const [compare, setCompare] = useState<string[]>([]);
  const toggleCompare = (id: string) => setCompare((c) => c.includes(id) ? c.filter((x) => x !== id) : c.length >= 4 ? c : [...c, id]);
  const compareDeals = compare.map((id) => deals.find((d) => d.id === id)).filter(Boolean) as Deal[];
  const CMP_ROWS: { label: string; get: (d: Deal) => string }[] = [
    { label: 'Stage', get: (d) => d.stageName || d.stage || '—' },
    { label: 'IC readiness', get: (d) => `${d.readiness ?? 0}%` },
    { label: 'Days to IC', get: (d) => typeof d.daysToIC === 'number' ? (d.daysToIC >= 0 ? `${d.daysToIC}d` : 'past') : '—' },
    { label: 'Deal size', get: (d) => money(d.dealSize ? d.dealSize * 1e6 : undefined) },
    { label: 'Sector', get: (d) => d.sector || '—' },
    { label: 'Status', get: (d) => d.status || '—' },
    { label: 'Priority', get: (d) => priority(d).tag },
    { label: 'Recommended action', get: (d) => priority(d).why },
  ];
  // Copying to the clipboard is invisible, so the button reports on itself for two
  // seconds. Without it the only way to know it worked was to go and paste.
  const [copied, setCopied] = useState(false);
  const copyCompare = () => {
    const header = ['Field', ...compareDeals.map((d) => d.company)].join('\t');
    const rows = CMP_ROWS.map((r) => [r.label, ...compareDeals.map((d) => r.get(d))].join('\t'));
    navigator.clipboard?.writeText([header, ...rows].join('\n'))
      .then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  };

  const kpiRow = home?.kpis?.length ? home.kpis : kpis.map((k) => ({ key: k.label, ...k }));
  const seat = home?.seat || null;
  // What this page is, in the viewer's own terms. Four distinct states, because they
  // are four different truths and running them together is how the old legend came to
  // claim the queue was "weighted for Deal Team" when nothing weighted it at all:
  //   a lane owner   -> which desk, and which lane it owns
  //   a wider seat   -> which desk (IC chair, sourcing, value creation)
  //   admin/observer -> why the page is deliberately NOT weighted to a desk
  //   no seat at all -> say so; do not let the generic view pass as a tailored one
  const seatLine = !seat ? null
    : seat.kind === 'oversight'
      ? <>Administrator view — every deal in the platform, ranked by deal health rather than weighted to one role</>
      : seat.kind === 'observer'
        ? <>Observer access — deal status only, without the workstream detail underneath</>
        : seat.tailored
          ? <>Built for the <b>{seat.label}</b>{seat.laneLabels.length ? <> — you own the <b>{seat.laneLabels.join(' and ')}</b> workstream{seat.laneLabels.length > 1 ? 's' : ''}</> : null}</>
          : <>No specialist role is assigned to you, so this is the general portfolio view</>;

  // What actually reaches the screen: a section the person kept AND that has something
  // to say. Working this out before the markup is what lets the hero collapse to a
  // single full-width column instead of leaving an empty half.
  const showBriefing = shows('briefing');
  const showFollowups = shows('followups') && !!home?.workiq?.total;
  const showAttention = shows('attention');
  const showKpis = shows('kpis');
  const heroLeft = showBriefing || showFollowups;
  const heroRight = showAttention || showKpis;
  const showFunnel = shows('funnel') && !!pipeline?.funnel?.length;
  // Named for the person, so the customise panel can say whose arrangement this is.
  const arrangementFor = seat?.label ? `the ${seat.label}` : 'you';

  // A brand-new fund, or anyone whose access resolves to nothing, used to meet eight
  // sections of zeros: 0 live deals, $0 pipeline, 0% readiness, "—" next IC, three
  // empty funnel tiles, "Nothing is flagged", "No comparables loaded". The most
  // important screen in the product was the only one that did not say what to do
  // next. It says it now — and it distinguishes an empty firm from an empty view,
  // because "add your first deal" is the wrong sentence for an observer who simply
  // cannot see the deals that already exist.
  if (!deals.length) {
    return (
      <div className="dash">
        <section className="panel">
          <div className="panel-h">Nothing to show yet</div>
          <div className="empty-panel" style={{ display: 'grid', gap: 10, textAlign: 'left', padding: '16px 18px' }}>
            {canWrite ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 600 }}>There are no live deals yet.</div>
                <div>A deal reaches this page one of two ways: you pursue a target you have screened, or you enter one directly.</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {onGoSourcing ? <button className="linkbtn" onClick={onGoSourcing}>Go to Sourcing &amp; screening →</button> : null}
                  {onAskQuestion ? <button className="linkbtn" onClick={() => onAskQuestion('What should we source next?')}>Ask what to source next →</button> : null}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>Use <b>+ New deal</b> at the top of the window to enter one you already have.</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 600 }}>No deals are visible to you.</div>
                <div>
                  {seat?.kind === 'observer'
                    ? 'Your access shows deal status only, and no deal has been shared with you yet.'
                    : 'Either no deals are live, or the ones that are live sit outside your territory or team.'}
                  {' '}Ask an administrator to add you to a deal team or territory.
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="dash">
      {/* ================= Portfolio cockpit =================
          Same shape as the deal cockpit: an AI-labelled briefing on the left, the
          ranked queue of what needs a person on the right. Either side can be emptied
          by choice, in which case the other takes the full width. */}
      {heroLeft || heroRight ? (
      <div className={heroLeft && heroRight ? 'grid g2' : 'grid'}>
        {heroLeft ? (
        <div style={{ minWidth: 0 }}>
          {showBriefing ? (
          <div className="card aicard">
            <div className="hd">
              <span className="aibadge">✦ AI</span>
              <h3>Portfolio briefing</h3>
              <Tag kind="new" />
              <span className="spacer" />
              <button className="btn link compact" onClick={loadHome}>↻ Refresh</button>
              <button className="btn link compact" onClick={() => setEvidence((v) => !v)}>🔍 Evidence</button>
              <button className="btn link compact" onClick={() => setBriefOpen((v) => !v)}>{briefOpen ? 'Hide' : 'Show'}</button>
            </div>
            {briefOpen ? (
              <div className="bd">
                {homeLoading && !home ? (
                  <div className="muted">Building your briefing…</div>
                ) : !home ? (
                  <div className="muted">
                    The portfolio briefing is unavailable right now — the deal detail below is still live.
                    <button className="btn link compact" onClick={loadHome}>Retry</button>
                  </div>
                ) : (
                  <>
                    <div className="sub" style={{ marginBottom: 8 }}>
                      Generated {clock(home.briefing.generatedAt)}
                      {/* The old role-scoped legend is only shown when there is no seat
                          line. With both, the card said "scoped to what a Deal Team can
                          see" and then, one line below, described the seat properly —
                          two answers to one question, the weaker one first. */}
                      {seatLine ? null
                        : (home.roleLabel || roleLabel) ? ` · scoped to what a ${home.roleLabel || roleLabel} can see`
                        : ' · scoped to the deals you can see'}
                    </div>
                    {seatLine ? <div className="seatline">{seatLine}</div> : null}
                    <Narrative paragraphs={home.briefing.paragraphs} sources={home.briefing.sources} onCite={() => setEvidence(true)} />
                    {evidence ? <SourceList sources={home.briefing.sources} /> : null}
                    {home.briefing.suggestions.length && onAskQuestion ? (
                      <div className="suggest">
                        <span className="sub" style={{ fontWeight: 600 }}>Ask next</span>
                        {home.briefing.suggestions.map((s, i) => (
                          <button key={i} className="sgchip" onClick={() => onAskQuestion(s)}>{s}</button>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
            <div className="note">
            Composed from the deal record, the IC readiness board and your team's deal channels &mdash; no AI model writes it,
            and it never changes a deal's recorded status. Where a source exists, it is shown.
            </div>
          </div>
          ) : null}

          {/* Follow-ups promised in deal channels that are not tracked anywhere. Proposed
              only — a task is created on the deal that owns it, by a named person. */}
          {showFollowups && home?.workiq ? (
            <div className="card aicard">
              <div className="hd">
                <span className="aibadge">✦ AI</span>
                <h3>Untracked follow-ups</h3>
                <Tag kind="new" />
                <span className="spacer" />
                <span className="chip">{home.workiq.total} across {home.workiq.deals} deal{home.workiq.deals === 1 ? '' : 's'}</span>
                {home.workiq.yours ? <span className="chip warn">{home.workiq.yours} yours</span> : null}
                <button className="btn link compact" onClick={() => setShowWorkiq((v) => !v)}>{showWorkiq ? 'Hide' : 'Show'}</button>
              </div>
              {showWorkiq ? (
                <div className="bd">
                  {home.workiq.items.map((c, i) => (
                    <div className="commit" key={`${c.dealId}-${i}`}>
                      <div className="att-t">
                        <span className="name">{c.author}</span>
                        <span className="chip">{c.company}</span>
                        {c.laneLabel ? <span className="sub">{c.laneLabel}</span> : null}
                        {c.yours ? <span className="chip warn">yours</span> : null}
                        {c.dueText ? <span className="chip warn">📅 {c.dueText}</span> : null}
                      </div>
                      <div className="quote">“{c.quote || c.headline}”</div>
                      <div className="sub">Basis: {c.basis || 'detected in the deal channel'} · not recorded as a task</div>
                      <div className="acts">
                        <button className="btn" onClick={() => onOpen(c.dealId)}>Open {c.company} ▸</button>
                        {onAskQuestion ? (
                          <button className="btn link" onClick={() => onAskQuestion(`On ${c.company}, is this follow-up tracked: "${c.headline}"?`)}>Ask about it</button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  <div className="sub">
                    Detected, not decided. Turning one of these into a tracked task happens on the deal itself,
                    where the audit trail records who did it.
                  </div>
                </div>
              ) : (
                <div className="note">
                  {home.workiq.total} follow-up{home.workiq.total === 1 ? '' : 's'} {home.workiq.total === 1 ? 'was' : 'were'} promised in the deal channels and never
                  turned into a task. Show them to see who owes what, and when.
                </div>
              )}
            </div>
          ) : null}
        </div>
        ) : null}

        {/* ---------------- Attention queue ---------------- */}
        {heroRight ? (
        <div style={{ minWidth: 0 }}>
          {showAttention ? (
          <div className="card">
            <div className="hd">
              <h3>{seat?.tailored && seat.laneLabels.length ? `What needs me in ${seat.laneLabels.join(' & ')}` : 'What needs my attention'}</h3>
              <Tag kind="ext" />
              <span className="spacer" />
              <span className="chip">{attentionRows.length} deal{attentionRows.length === 1 ? '' : 's'}</span>
            </div>
            <div className="legend">
              <span>
                {seat?.tailored && seat.laneLabels.length
                  ? <>Ranked across <b>your {seat.laneLabels.join(' and ')} workstream{seat.laneLabels.length === 1 ? '' : 's'}</b>, on every deal you can see</>
                  : <>Ranked worst-first across every deal you can see</>}
                {canWrite === false ? <> · <b>read-only access</b></> : null}
              </span>
            </div>
            {attentionRows.length === 0 ? (
              // The reason comes from the server, which knows whether the queue is
              // empty because the deals are healthy, because this seat cannot see the
              // records that would rank them, or because there are no deals at all.
              // Guessing "all healthy" here once told an observer everything was on
              // track while their own tiles showed four deals not IC-ready.
              <div className="bd"><div className="muted">{home?.attentionEmpty || 'Nothing is flagged right now.'}</div></div>
            ) : attentionRows.map((a) => (
              <div className="att" key={a.id}>
                <div className="att-t">
                  <span className="rank">#{a.rank}</span>
                  <span className={`chip ${a.tone}`}>{a.tag}</span>
                  <span className="name">{a.company}</span>
                </div>
                <div className="att-l">⏰ {a.why}</div>
                <div className="att-l">
                  {a.stageName ? <span>📍 {a.stageName}</span> : null}
                  <span>📊 {a.readiness}% IC-ready</span>
                  {typeof a.icInDays === 'number' ? <span>📅 IC in {a.icInDays}d</span> : null}
                </div>
                {a.impact ? <div className="impact">⚡ {a.impact}</div> : null}
                {/* Why this row is where it is. A ranked list that cannot answer
                    "why is this above that?" does not survive its first partner. */}
                {a.placedBy ? <div className="sub" style={{ marginTop: 6 }}>Why it is here: {a.placedBy}</div> : null}
                {a.basis ? <div className="sub" style={{ marginTop: 2 }}>Basis: {a.basis}</div> : null}
                <div className="acts">
                  <button className="btn primary" onClick={() => onOpen(a.dealId)}>Open deal ▸</button>
                  <button className="btn link" onClick={() => onAsk(a.dealId)}>Ask the assistant</button>
                </div>
              </div>
            ))}
            <div className="note">
              Opening a deal takes you to that deal's own page. Nothing here changes a deal — it only tells you where to look first.
            </div>
          </div>
          ) : null}

          {/* KPI row sits beside the queue so the headline numbers and the work to be
              done are read together rather than on separate screens. */}
          {showKpis ? (
          <div className="kpis">
            {kpiRow.map((k) => (
              <div key={k.key || k.label} className="kpi">
                <div className="kpi-v">{k.value}</div>
                <div className="kpi-l">{k.label}</div>
                <div className="kpi-s">{k.sub}</div>
              </div>
            ))}
          </div>
          ) : null}
        </div>
        ) : null}
      </div>
      ) : null}

      {/* The way back from a hidden section. Without a standing affordance, turning one
          off is a one-way door: the control that would bring it back went with it.

          It sits BELOW the hero, not above it. As the first row on the home page it
          made arranging the page look like the first task of the day — the partner who
          opened the product to find out what needed them met a settings control before
          a single fact. The label changed for the same reason: nobody wants to
          "customise a page", they want the two sections they never read to stop taking
          up the screen, so the button offers that instead. */}
      <div className="dashbar">
        <span>
          {hidden.length
            ? `${hidden.length} of ${DASH_MODULES.length} sections hidden on this page`
            : `Showing all ${DASH_MODULES.length} sections`}
        </span>
        <span className="spacer" />
        <button className="askbtn" onClick={() => setCustomise((v) => !v)}>
          {customise ? 'Done' : "⚙ Hide sections I don't use"}
        </button>
      </div>

      {customise ? (
        <section className="panel">
          <div className="panel-h">
            <span>Choose what this page shows</span>
            <span className="muted" style={{ fontWeight: 400 }}>
              <button className="askbtn" onClick={showEverything} disabled={!hidden.length}>Show everything</button>
            </span>
          </div>
          <div className="modlist">
            {DASH_MODULES.map((m) => (
              <label key={m.key} className={`modrow${shows(m.key) ? '' : ' off'}`}>
                <input type="checkbox" checked={shows(m.key)} onChange={() => toggle(m.key)} />
                <span>
                  <span className="modname">{m.label}</span>
                  <span className="sub">{m.note}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="note">
            Kept in this browser for {arrangementFor}, so switching profile switches the page with it.
            This changes what you see and nothing else — not what a deal records, and not who is allowed to see it.
          </div>
        </section>
      ) : null}

      {/* Where the live capital sits in the process */}
      {shows('phases') ? (
      <section className="panel">
        <div className="panel-h"><span>Deals by stage</span><span className="muted">{money(pipelineValue)} across {liveDeals} live deal{liveDeals === 1 ? '' : 's'}</span></div>
        <div className="funnel">
          {byPhase.map((ph) => (
            <div key={ph.key} className="fstep">
              <div className="fcount">{money(ph.capital)}</div>
              <div className="flabel">{ph.label}</div>
              <div className="fkey">{ph.count} deal{ph.count === 1 ? '' : 's'}</div>
            </div>
          ))}
        </div>
      </section>
      ) : null}

      {/* Origination funnel */}
      {showFunnel && pipeline?.funnel ? (
        <section className="panel">
          <div className="panel-h"><span>Origination funnel</span><span className="muted">{pipeline.fundName}</span></div>
          <div className="funnel">
            {pipeline.funnel.map((f) => (
              <div key={f.key} className="fstep">
                <div className="fcount">{f.count}</div>
                <div className="flabel">{f.label}</div>
                <div className="fkey">{f.key}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Side-by-side comparison */}
      {compareDeals.length >= 2 ? (
        <section className="panel">
          <div className="panel-h">
            <span>Compare deals</span>
            <span className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="askbtn" onClick={copyCompare}>{copied ? '✓ Copied' : '⧉ Copy as text'}</button>
              <button className="askbtn" onClick={() => setCompare([])}>Clear</button>
            </span>
          </div>
          <div style={{ overflowX: 'auto', padding: '4px 14px 14px' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--border, #23232c)' }}>Field</th>
                  {compareDeals.map((d) => (
                    <th key={d.id} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 700, borderBottom: '1px solid var(--border, #23232c)', cursor: 'pointer' }} onClick={() => onOpen(d.id)}>{d.company} ↗</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CMP_ROWS.map((r) => (
                  <tr key={r.label}>
                    <td style={{ padding: '6px 10px', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border, #1c1c24)' }}>{r.label}</td>
                    {compareDeals.map((d) => (
                      <td key={d.id} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border, #1c1c24)' }}>{r.get(d)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Deals */}
      {shows('deals') ? (
      <section className="panel">
          <div className="panel-h"><span>Pipeline deals</span><span className="muted">{deals.length} active{compare.length ? ` · ${compare.length} selected to compare` : ' · pick 2–4 to compare'}</span></div>
        {deals.length === 0 ? (
          <div className="empty-panel">
            No deals are live yet. Sourced candidates that pass screening appear here.
            <button className="linkbtn" onClick={() => onAsk('')}>Ask what to source next →</button>
          </div>
        ) : (
          <div className="deals">
            {deals.map((d) => (
              // The card takes focus and announces itself as a button, so Enter and
              // Space are the two keys anyone would try - and neither did anything.
              <div
                key={d.id}
                className="dealcard"
                onClick={() => onOpen(d.id)}
                role="button"
                tabIndex={0}
                aria-label={`Open ${d.company}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(d.id); } }}
              >
                <div className="dc-top">
                  <div className="dc-co">{d.company}</div>
                  <div className="dc-size">{money(d.dealSize ? d.dealSize * 1e6 : undefined)}</div>
                </div>
                <div className="dc-meta">{d.sector || '—'} · {d.stageName || d.stage || '—'}{d.status ? ` · ${d.status}` : ''}</div>
                <div className="dc-bar"><span style={{ width: `${Math.max(0, Math.min(100, d.readiness ?? 0))}%` }} /></div>
                <div className="dc-foot">
                  <span className="muted">IC readiness {d.readiness ?? 0}%{typeof d.daysToIC === 'number' ? ` · IC in ${d.daysToIC}d` : ''}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className={`askbtn${compare.includes(d.id) ? ' on' : ''}`} title="Add to comparison" onClick={(e) => { e.stopPropagation(); toggleCompare(d.id); }}>{compare.includes(d.id) ? '✓ Compare' : '+ Compare'}</button>
                    <button className="askbtn" onClick={(e) => { e.stopPropagation(); onAsk(d.id); }}>Ask ▸</button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      ) : null}

      {/* Market intelligence — live Fabric */}
      {shows('market') ? (
      <section className="panel">
        <div className="panel-h">
          <span>Market intelligence</span>
          {/* This fell back to the words "Live market data" precisely when there was
              no source to name — so the header claimed live data directly above "No
              comparables loaded." If we cannot name the source, say so. */}
          <span className="muted">{fabric?.source ? `${fabric.source}${fabric?.freshness?.label ? ` · ${fabric.freshness.label}` : ''}` : 'No market source connected'}</span>
        </div>
        <div className="mi">
          <div className="mi-col">
            <div className="mi-h">Comparable deals</div>
            {comps.length ? comps.slice(0, 6).map((c, i) => (
              <div key={i} className="mi-row">
                <span className="mi-name">{c.company}{c.ticker ? ` (${c.ticker})` : ''}</span>
                <span className="mi-val">{c.dealType || '—'} · {money(c.impliedValuation)}</span>
                {c.status ? <span className={`pill ${String(c.status).toLowerCase().replace(/\s+/g, '-')}`}>{c.status}</span> : null}
              </div>
            )) : <div className="muted">No comparables loaded.</div>}
          </div>
          <div className="mi-col">
            <div className="mi-h">IC voting precedents</div>
            {precedents.length ? precedents.slice(0, 6).map((p, i) => (
              <div key={i} className="mi-row">
                <span className="mi-name">{p.deal}</span>
                <span className="mi-val">{p.decision} · {(p.votesFor ?? 0)}–{(p.votesAgainst ?? 0)}{typeof p.votesAbstain === 'number' ? `–${p.votesAbstain}` : ''}</span>
              </div>
            )) : <div className="muted">No precedents loaded.</div>}
            {benchmarks.length ? (
              <div className="mi-bench">
                <div className="mi-h" style={{ marginTop: 10 }}>Benchmark findings</div>
                <div className="chips">{benchmarks.map((b) => (<span key={b.workstream} className="chip">{b.workstream} · {b.total}</span>))}</div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
      ) : null}
    </div>
  );
}

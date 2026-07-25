// The "Deals Overview" tab: the KPI/value strip (from /api/analytics), the Stage-1
// pipeline funnel (/api/pipeline), the deal cards (/api/deals) and the market-intel
// panel (/api/market-intel). Read-only; onAsk opens the agents panel and onOpen
// drills into a deal's DealDetail overlay.
import type { Analytics, Pipeline, Deal, MarketIntel, BackendConfig } from './types';

function money(n?: number): string {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n)}`;
}

export default function Dashboard({ analytics, pipeline, deals, market, config, agentCount, onAsk, onOpen }: {
  analytics: Analytics | null; pipeline: Pipeline | null; deals: Deal[]; market: MarketIntel | null;
  config: BackendConfig | null; agentCount: number; onAsk: (dealId: string) => void; onOpen: (dealId: string) => void;
}) {
  const fabric = config?.fabric || market?.info;
  const comps = market?.comparableDeals || [];
  const precedents = market?.icPrecedents || [];
  const benchmarks = market?.benchmarkFindings || [];

  // Derive the headline counts from the deals THIS caller can actually see, so the
  // totals always match the deal cards below (and change when the persona changes).
  // Falls back to the system analytics only when the deal list hasn't loaded yet.
  const inDiligenceRe = /diligence|approval/i;
  const liveDeals = deals.length || analytics?.deals || 0;
  const inDiligence = deals.length
    ? deals.filter((d) => inDiligenceRe.test(`${d.stage || ''} ${d.stageName || ''}`)).length
    : (analytics?.inDiligence ?? 0);
  const avgReadiness = deals.length
    ? Math.round(deals.reduce((s, d) => s + (d.readiness || 0), 0) / deals.length)
    : (analytics?.avgReadiness ?? 0);

  const kpis = [
    { label: 'Live deals', value: String(liveDeals), sub: `${inDiligence} in diligence` },
    { label: 'Avg IC readiness', value: `${avgReadiness}%`, sub: `${analytics?.cycleReductionPct ?? 0}% cycle cut` },
    { label: 'Fabric market intel', value: fabric?.mode === 'live' ? 'Live' : (fabric?.mode ? 'Materialized' : '—'), sub: `${comps.length} comps · ${precedents.length} IC precedents` },
    { label: 'Specialist agents', value: String(agentCount), sub: config?.newsAgent === 'live' ? 'orchestrated · news scout live' : 'orchestrated by 1 assistant' },
  ];

  // Quantified business-value story (from /api/analytics). Every number is derived
  // from the live deal record — hours are tallied as agents complete real work.
  const hoursSaved = analytics?.totalHoursSaved ?? 0;
  const fteWeeks = analytics?.fteWeeks ?? Math.round((hoursSaved / 40) * 10) / 10;
  const cyclePct = analytics?.cycleReductionPct ?? 0;
  const daysSaved = analytics?.avgDaysSaved ?? 0;
  const baselineDays = analytics?.baselineDays ?? 45;
  const dealsProcessed = analytics?.deals ?? liveDeals;
  const value = [
    { v: hoursSaved.toLocaleString(), l: 'Analyst hours saved', s: `≈ ${fteWeeks} FTE-weeks redeployed to judgment` },
    { v: `${cyclePct}%`, l: 'Faster to IC', s: `${daysSaved}d saved vs ${baselineDays}-day baseline` },
    { v: String(dealsProcessed), l: 'Deals processed', s: `${inDiligence} in active diligence` },
    { v: `${avgReadiness}%`, l: 'Avg IC readiness', s: 'across the live pipeline' },
  ];

  return (
    <div className="dash">
      {/* KPI row */}
      <div className="kpis">
        {kpis.map((k) => (
          <div key={k.label} className="kpi">
            <div className="kpi-v">{k.value}</div>
            <div className="kpi-l">{k.label}</div>
            <div className="kpi-s">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Quantified business value — the "so-what" close */}
      <section className="panel bizval">
        <div className="panel-h"><span>Business value</span><span className="muted">AI-accelerated deal pipeline · derived from the live record</span></div>
        <div className="bv-grid">
          {value.map((k) => (
            <div key={k.l} className="bv-tile">
              <div className="bv-v">{k.v}</div>
              <div className="bv-l">{k.l}</div>
              <div className="bv-s">{k.s}</div>
            </div>
          ))}
        </div>
        <div className="bv-close">
          One assistant orchestrates {agentCount} specialists across sourcing → diligence → IC — turning{' '}
          <strong>{hoursSaved.toLocaleString()} analyst hours</strong> of manual work into judgment time and getting deals to committee{' '}
          <strong>{cyclePct}% faster</strong>.
        </div>
      </section>

      {/* Origination funnel */}
      {pipeline?.funnel?.length ? (
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

      {/* Deals */}
      <section className="panel">
        <div className="panel-h"><span>Pipeline deals</span><span className="muted">{deals.length} active</span></div>
        {deals.length === 0 ? (
          <div className="empty-panel">
            No deals are live yet. Sourced candidates that clear the screening gate appear here.
            <button className="linkbtn" onClick={() => onAsk('')}>Ask an agent what to source next →</button>
          </div>
        ) : (
          <div className="deals">
            {deals.map((d) => (
              <div key={d.id} className="dealcard" onClick={() => onOpen(d.id)} role="button" tabIndex={0}>
                <div className="dc-top">
                  <div className="dc-co">{d.company}</div>
                  <div className="dc-size">{money(d.dealSize ? d.dealSize * 1e6 : undefined)}</div>
                </div>
                <div className="dc-meta">{d.sector || '—'} · {d.stageName || d.stage || '—'}{d.status ? ` · ${d.status}` : ''}</div>
                <div className="dc-bar"><span style={{ width: `${Math.max(0, Math.min(100, d.readiness ?? 0))}%` }} /></div>
                <div className="dc-foot">
                  <span className="muted">IC readiness {d.readiness ?? 0}%{typeof d.daysToIC === 'number' ? ` · IC in ${d.daysToIC}d` : ''}</span>
                  <button className="askbtn" onClick={(e) => { e.stopPropagation(); onAsk(d.id); }}>Ask ▸</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Market intelligence — live Fabric */}
      <section className="panel">
        <div className="panel-h">
          <span>Market intelligence</span>
          <span className="muted">{fabric?.source ? `${fabric.source}${fabric?.freshness?.label ? ` · ${fabric.freshness.label}` : ''}` : 'Microsoft Fabric / OneLake'}</span>
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
    </div>
  );
}

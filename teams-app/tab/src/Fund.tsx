import { useEffect, useState } from 'react';

// Fund / portfolio lens (post-IC). Three views from the orchestrator:
//   /api/fund/value     — portfolio & pipeline health (companies, MOIC/IRR, add-ons)
//   /api/fund/overview  — fund / LP performance + concentration vs LPA limits
//   /api/fund/portfolio — owned-company monitoring (VCP, KPIs, MOIC, status)

type Concentration = { name: string; equity: number; pctOfFund: number; pctOfInvested: number; limitPct: number | null; status: string };
type Overview = {
  fund: { name: string; strategy: string; vintageYear: number; investmentPeriod: string; fundSizeLabel: string };
  capital: { committed: number; invested: number; reserves: number; dryPowder: number; deployedPct: number; portfolioCompanies: number; dryPowderNote?: string };
  performance: { grossMoic: number; netMoic: number; grossIrrPct: number; netIrrPct: number; dpi: number; rvpi: number; tvpi: number; realized: number; unrealized: number; totalValue: number };
  concentration: { maxSectorPct: number; maxDealPct: number; bySector: Concentration[]; byRegion: Concentration[]; largestPosition: { company: string; pctOfFund: number; limitPct: number; status: string } };
  lpTerms: { preferredReturnPct: number; carryPct: number; managementFeePct: number; esgPolicy: string };
  ilpaSummary: string[];
};
type Lever = { name: string; owner: string; target: string; progressPct: number };
type Kpi = { label: string; plan: number; actual: number; unit: string };
type Company = {
  id: string; company: string; sector: string; subSector: string; hq: string; status: string; thesis: string;
  holdMonths: number; entryEV: number; entryEquity: number; entryMultiple: number; entryEbitda: number;
  currentEbitda: number; currentMultiple: number; currentEV: number; currentEquity: number; ebitdaGrowthPct: number;
  realized: number; grossMoic: number; grossIrr: number; vcpProgress: number; hundredDayPct: number;
  levers: Lever[]; kpis: Kpi[]; kpiVariancePct: number; addOns: { completed: number; pipeline: number };
};
type Portfolio = { count: number; statusCounts: { onTrack: number; watch: number; underperform: number }; addOnsClosed: number; addOnsPipeline: number; avgVcpProgress: number; companies: Company[] };
type Value = {
  pipeline: { dealsProcessed: number; inDiligence: number; analystHoursSaved: number; fteWeeksSaved: number; cycleReductionPct: number; avgDaysSaved: number; baselineDays: number; avgIcReadiness: number };
  portfolio: { companies: number; capitalDeployed: number; deployedPct: number; grossMoic: number; grossIrrPct: number; tvpi: number; onTrack: number; watch: number; underperform: number; addOnsClosed: number };
};

const usd = (m: number) => (Math.abs(m) >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${Math.round(m)}M`);
const statusClass = (s: string) => (s === 'on-track' ? 'ok' : s === 'watch' ? 'warn' : s === 'underperform' ? 'bad' : '');
const statusLabel = (s: string) => (s === 'on-track' ? 'On track' : s === 'watch' ? 'Watch' : s === 'underperform' ? 'Underperform' : s);
const concClass = (s: string) => (s === 'breach' ? 'bad' : s === 'near' ? 'warn' : 'ok');
// One set of titles across the product. "Retail MD" and "Supply MD" were a slug with the
// hyphen taken out; nobody in the firm has that on a business card, and the same people
// read as "Commercial Partner" on the deal pages.
const OWNER_LABEL: Record<string, string> = {
  analyst: 'Analyst', partner: 'Partner', principal: 'Principal', 'retail-md': 'Commercial Partner', 'ai-md': 'AI Partner',
  'supply-md': 'Supply Chain Partner', 'operating-partner': 'Operating Partner', 'fund-cfo': 'Fund CFO', 'legal-gc': 'General Counsel', 'ir-lp': 'Investor Relations',
  'finance-md': 'Finance Partner', 'tax-md': 'Tax Partner', 'esg-md': 'Operating Partner — ESG', 'legal-md': 'General Counsel', 'ops-md': 'Operating Partner',
};

type Methodology = {
  asOf: string; sourceOfRecord: string; refreshCadence: string; note: string;
  metrics: { id: string; label: string; unit: string; formula: string; definition: string }[];
};

const unitSuffix = (u?: string) => (u === '%' ? '%' : u === '$M' ? '$m' : '');

// "250% below" is what you get from dividing a -6% actual by a +4% plan. Once a metric
// has crossed zero the proportion of plan stops meaning anything, so say the gap in the
// metric's own units instead of printing a ratio nobody can act on.
const shortfallPhrase = (wk: { k: { plan: number; actual: number; unit?: string }; gap: number; rel: number }) => {
  const sameSign = wk.k.plan > 0 && wk.k.actual >= 0;
  if (!sameSign || wk.k.plan === 0) {
    return `${Math.round(wk.gap * 10) / 10}${wk.k.unit === '%' ? 'pp' : unitSuffix(wk.k.unit)} below plan`;
  }
  return `${Math.round(wk.rel * 100)}% below`;
};

export default function Fund({ deals, onOpenDeal }: { deals?: { id: string; company: string }[]; onOpenDeal?: (id: string) => void } = {}) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [val, setVal] = useState<Value | null>(null);
  const [openId, setOpenId] = useState('');
  const [method, setMethod] = useState<Methodology | null>(null);
  const [showMethod, setShowMethod] = useState(false);
  const [reporting, setReporting] = useState<{ status: string; staleSources: string[]; notice: string | null } | null>(null);
  // Every request here used to swallow its error, so a failed call left `ov`/`pf` null
  // and the whole tab said "Loading…" for ever — the partner is not waiting, they are
  // stuck, and nothing on screen tells them so or offers a way out.
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoadFailed(false);
    const get = (url: string, set: (v: any) => void, required = false) =>
      fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((v) => { if (live) set(v); })
        .catch(() => { if (live && required) setLoadFailed(true); });
    get('/api/fund/overview', setOv, true);
    get('/api/fund/portfolio', setPf, true);
    get('/api/fund/value', setVal);
    get('/api/fund/methodology', setMethod);
    get('/api/fund/reporting-readiness', setReporting);
    return () => { live = false; };
  }, [attempt]);

  if (loadFailed && (!ov || !pf)) return (
    <div className="fnd-wrap"><style>{CSS}</style>
      <p className="fnd-empty">
        The fund and portfolio figures could not be loaded just now.{' '}
        <button className="fnd-retry" onClick={() => { setOv(null); setPf(null); setAttempt((n) => n + 1); }}>Try again</button>
      </p>
    </div>
  );
  if (!ov || !pf) return <div className="fnd-wrap"><style>{CSS}</style><p className="fnd-empty">Loading…</p></div>;

  const p = ov.performance;
  return (
    <div className="fnd-wrap">
      <style>{CSS}</style>

      <div className="fnd-head">
        <h2>{ov.fund.name}</h2>
        <p>{ov.fund.strategy} · vintage {ov.fund.vintageYear} · {ov.fund.investmentPeriod} · {ov.capital.portfolioCompanies} portfolio companies</p>
      </div>

      {method ? (
        <div className="fnd-method">
          <span className="fnd-method-asof">As of {new Date(method.asOf).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {method.sourceOfRecord}</span>
          <button className="fnd-method-btn" onClick={() => setShowMethod((v) => !v)}>{showMethod ? 'Hide methodology' : 'Methodology ▾'}</button>
          {showMethod ? (
            <div className="fnd-method-body">
              <p className="fnd-method-note">{method.note} <b>Refresh:</b> {method.refreshCadence}</p>
              {reporting ? <p className="fnd-method-note"><b>Reporting data freshness:</b> {reporting.status === 'fresh' ? 'all external sources within SLA \u2713' : (reporting.notice || 'some sources stale \u2014 not certified for IC / LP use')}</p> : null}
              <table className="fnd-method-tbl"><tbody>
                {method.metrics.map((m) => (
                  <tr key={m.id}><td className="fnd-method-lbl">{m.label}{m.unit ? ` (${m.unit})` : ''}</td><td className="fnd-method-frm">{m.formula}</td><td className="fnd-method-def">{m.definition}</td></tr>
                ))}
              </tbody></table>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Fund / LP headline */}
      <div className="fnd-kpis">
        <Kpi v={ov.fund.fundSizeLabel} l="Committed capital" s={`${ov.capital.deployedPct}% invested`} />
        <Kpi v={usd(ov.capital.invested)} l="Invested" s={`${usd(ov.capital.dryPowder)} dry powder — ${ov.capital.dryPowderNote || 'net of reserves'}`} />
        <Kpi v={`${p.tvpi.toFixed(2)}x`} l="TVPI (gross)" s={`DPI ${p.dpi.toFixed(2)}x · RVPI ${p.rvpi.toFixed(2)}x`} />
        <Kpi v={`${p.grossMoic.toFixed(2)}x`} l="Gross MOIC" s={`Net ${p.netMoic.toFixed(2)}x`} />
        <Kpi v={`${p.grossIrrPct}%`} l="Gross IRR" s={`Net ${p.netIrrPct}%`} />
        <Kpi v={usd(p.totalValue)} l="Total value" s={`${usd(p.unrealized)} unrealised · ${usd(p.realized)} realised`} />
      </div>

      {/* Watchlist — deteriorating names that need action */}
      {(() => {
        const worstKpi = (c: Company) => {
          // Ranked by raw gap, this always picked the KPI with the biggest numbers on it:
          // revenue 19 units light beat EBITDA nearly a fifth below plan, and the line
          // named revenue as the cause of a 36% equity loss. Rank by proportion of plan.
          const shortfalls = c.kpis
            .map((k) => ({ k, gap: k.plan - k.actual, rel: k.plan ? (k.plan - k.actual) / Math.abs(k.plan) : 0 }))
            .filter((x) => x.gap > 0)
            .sort((a, b) => b.rel - a.rel);
          return shortfalls[0] || null;
        };
        const watch = pf.companies
          .filter((c) => c.status === 'watch' || c.status === 'underperform')
          .sort((a, b) => (a.status === 'underperform' ? 0 : 1) - (b.status === 'underperform' ? 0 : 1) || b.kpiVariancePct - a.kpiVariancePct);
        if (!watch.length) return null;
        return (
          <section className="fnd-panel">
            <div className="fnd-panel-h"><span>Watchlist</span><span className="fnd-mut">{watch.length} name{watch.length === 1 ? '' : 's'} deteriorating or off-plan — review before next quarterly</span></div>
            <div style={{ padding: '4px 14px 12px' }}>
              {watch.map((c, i) => {
                const wk = worstKpi(c);
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--border, #23232c)' : 'none' }}>
                    <span className={`pill ${statusClass(c.status)}`} style={{ flex: '0 0 auto' }}>{statusLabel(c.status)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.company}<span className="fnd-mut" style={{ fontWeight: 400 }}> · {c.sector}</span></div>
                      <div className="fnd-mut" style={{ fontSize: 11.5, marginTop: 1 }}>
                        {wk ? `Largest shortfall vs plan: ${wk.k.label} at ${wk.k.actual}${unitSuffix(wk.k.unit)} against ${wk.k.plan}${unitSuffix(wk.k.unit)} (${shortfallPhrase(wk)})` : `KPI variance ${c.kpiVariancePct}% · value-creation plan ${c.vcpProgress}% complete`}
                        {` · MOIC ${c.grossMoic.toFixed(2)}x · IRR ${c.grossIrr}%`}
                      </div>
                    </div>
                    <button className="askbtn" style={{ flex: '0 0 auto' }} onClick={() => setOpenId(openId === c.id ? '' : c.id)}>{openId === c.id ? 'Hide ▾' : 'Review ▸'}</button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* Portfolio monitoring */}
      <section className="fnd-panel">
        <div className="fnd-panel-h">
          <span>Portfolio monitoring</span>
          <span className="fnd-mut">
            <span className="dot ok" /> {pf.statusCounts.onTrack} on track ·
            <span className="dot warn" /> {pf.statusCounts.watch} watch ·
            <span className="dot bad" /> {pf.statusCounts.underperform} underperform · {pf.addOnsClosed} add-ons closed
          </span>
        </div>
        {/* "6 portfolio companies" here and three deals whose status reads Owned or
            Exiting on Deals in flight are two non-overlapping sets, and nothing on
            either screen said so -- leaving a partner to work out for themselves
            whether the fund holds six companies or nine. It holds six; the other three
            have completed but have not been onboarded to portfolio reporting yet. */}
        <div className="fnd-note">
          Companies onboarded to portfolio reporting. Transactions that have completed but are not yet onboarded stay under Deals in flight.
        </div>
        <div className="fnd-table">
          <div className="fnd-tr fnd-th">
            <span className="c-co">Company</span>
            <span>Hold</span><span className="c-entry">Entry → now</span><span>EBITDA</span><span>MOIC</span><span>Gross IRR</span><span className="c-vcp">Value-creation plan</span><span>Status</span>
          </div>
          {pf.companies.map((c) => (
            <div key={c.id}>
              <button className={`fnd-tr row${openId === c.id ? ' open' : ''}`} onClick={() => setOpenId(openId === c.id ? '' : c.id)}>
                <span className="c-co">
                  <span className="c-name">{c.company}</span>
                  <span className="c-sub">{c.sector} · {c.subSector}</span>
                </span>
                <span>{Math.round(c.holdMonths)} mo</span>
                <span className="c-entry">{c.entryMultiple.toFixed(1)}x → {c.currentMultiple.toFixed(1)}x</span>
                <span className={c.ebitdaGrowthPct >= 0 ? 'pos' : 'neg'}>{c.ebitdaGrowthPct >= 0 ? '+' : ''}{c.ebitdaGrowthPct}%</span>
                <span className={c.grossMoic >= 1 ? 'pos' : 'neg'}><strong>{c.grossMoic.toFixed(2)}x</strong></span>
                <span className={c.grossIrr >= 0 ? 'pos' : 'neg'}>{c.grossIrr}%</span>
                <span className="c-vcp"><span className="bar"><span style={{ width: `${c.vcpProgress}%` }} /></span><em>{c.vcpProgress}%</em></span>
                <span><span className={`pill ${statusClass(c.status)}`}>{statusLabel(c.status)}</span></span>
              </button>
              {openId === c.id ? (
                <div className="fnd-detail">
                  <p className="c-thesis">{c.thesis}</p>
                  <div className="c-grid">
                    <div>
                      {/* "VALUE-CREATION PLAN 57%" in the row above and "100-day 100%"
                          here are two different measures over two different horizons, and
                          side by side they read as the product contradicting itself. */}
                      <div className="c-h">Value-creation levers <span className="fnd-mut">· first 100 days {c.hundredDayPct}% done; the full plan is {c.vcpProgress}%</span></div>
                      {c.levers.map((l) => (
                        <div key={l.name} className="c-lever">
                          <div className="c-lever-top"><span>{l.name}</span><em>{l.progressPct}%</em></div>
                          <div className="bar"><span style={{ width: `${l.progressPct}%` }} /></div>
                          <div className="c-lever-sub">{l.target} · {OWNER_LABEL[l.owner] || l.owner}</div>
                        </div>
                      ))}
                      <div className="c-addons">Add-ons: <strong>{c.addOns.completed}</strong> closed · {c.addOns.pipeline} in pipeline</div>
                    </div>
                    <div>
                      <div className="c-h">KPIs vs underwriting plan</div>
                      <div className="kpi-tbl">
                        <div className="kpi-row kpi-hd"><span>Metric</span><span>Plan</span><span>Actual</span><span>Δ</span></div>
                        {c.kpis.map((k) => {
                          const d = k.actual - k.plan;
                          // The table printed four bare numbers with no units anywhere on
                          // it, so "241 vs 260" could have been $m, a store count or a
                          // percentage. The unit is on the record; put it on the row.
                          const unit = k.unit === '$M' ? '$m' : k.unit;
                          const delta = `${d >= 0 ? '+' : ''}${Math.round(d * 10) / 10}${k.unit === '%' ? 'pp' : ''}`;
                          return (
                            <div key={k.label} className="kpi-row">
                              <span>{k.label}{unit ? <em className="kpi-unit"> ({unit})</em> : null}</span>
                              <span>{k.plan}</span>
                              <span>{k.actual}</span>
                              <span className={d >= 0 ? 'pos' : 'neg'}>{delta}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="c-marks">
                        Entry {usd(c.entryEV)} EV / {usd(c.entryEquity)} equity → current {usd(c.currentEV)} EV / {usd(c.currentEquity)} equity{c.realized ? ` · ${usd(c.realized)} realised` : ''}
                      </div>
                      {/* Expanding this panel was the end of the road: the same company has
                          a full deal page with its workstreams, documents and channel on
                          it, and there was nothing here that led to it. */}
                      {(() => {
                        const match = (deals || []).find((d) => d.company === c.company);
                        return match && onOpenDeal
                          ? <button className="askbtn" style={{ marginTop: 8 }} onClick={() => onOpenDeal(match.id)}>Open the deal page for {c.company} ▸</button>
                          : null;
                      })()}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* Concentration vs LPA limits */}
      <section className="fnd-panel">
        <div className="fnd-panel-h">
          <span>Portfolio concentration vs LPA limits</span>
          <span className="fnd-mut">Max {ov.concentration.maxSectorPct}% per sector · {ov.concentration.maxDealPct}% per deal (of fund)</span>
        </div>
        <div className="fnd-conc">
          {ov.concentration.bySector.map((s) => (
            <div key={s.name} className="conc-row">
              <span className="conc-name">{s.name}</span>
              <span className="conc-bar">
                <span className={`conc-fill ${concClass(s.status)}`} style={{ width: `${Math.min(100, (s.pctOfFund / ov.concentration.maxSectorPct) * 100)}%` }} />
                <span className="conc-limit" title={`LPA limit ${ov.concentration.maxSectorPct}%`} />
              </span>
              <span className="conc-val">{s.pctOfFund}% of fund <em>({s.pctOfInvested}% of invested)</em></span>
            </div>
          ))}
          <div className="conc-note">
            Largest single position: <strong>{ov.concentration.largestPosition.company}</strong> at {ov.concentration.largestPosition.pctOfFund}% of fund
            <span className={`pill ${concClass(ov.concentration.largestPosition.status)}`}>vs {ov.concentration.largestPosition.limitPct}% cap</span>
          </div>
        </div>
      </section>

      {/* Portfolio & pipeline health */}
      {val ? (
        <section className="fnd-panel">
          {/* These are fund-level figures and they stay fund-level -- an LP report that
              shrank because the person opening it lacks deal access would be worse than
              useless. But an analyst who can open four deals was reading "19 Active
              deals" here and "4 records within your access" on the Report an inch away,
              with nothing to tell them the two were counting different things. */}
          <div className="fnd-panel-h"><span>Portfolio &amp; pipeline health</span><span className="fnd-mut">whole fund — not limited to the deals you can open</span></div>
          <div className="fnd-kpis inpanel">
            <Kpi v={String(val.portfolio.companies)} l="Companies owned" s={`${val.portfolio.deployedPct}% deployed`} />
            <Kpi v={String(val.portfolio.onTrack)} l="On track" s={`${val.portfolio.watch} watch · ${val.portfolio.underperform} underperform`} />
            <Kpi v={`${val.portfolio.grossMoic.toFixed(2)}x`} l="Portfolio gross MOIC" s={`${val.portfolio.grossIrrPct}% IRR`} />
            <Kpi v={String(val.portfolio.addOnsClosed)} l="Add-ons closed" s="buy-and-build" />
            <Kpi v={String(val.pipeline.dealsProcessed)} l="Active deals" s={`${val.pipeline.inDiligence} in diligence`} />
            {/* Same words, two numbers, before: this tile read 51% and the LP report 42%.
                Both are now the same average over the same denominator, and the tile
                states that denominator so nobody has to guess which deals are in it. */}
            <Kpi v={`${val.pipeline.avgIcReadiness}%`} l="Avg IC readiness" s={`across ${(val.pipeline as any).preIcDeals ?? 0} deals not yet through committee${(val.pipeline as any).pastCommitteeDeals ? ` · excludes ${(val.pipeline as any).pastCommitteeDeals} already approved` : ''}`} />
          </div>
        </section>
      ) : null}

      {/* ILPA-aligned LP summary */}
      <section className="fnd-panel">
        <div className="fnd-panel-h"><span>LP report summary</span><span className="fnd-mut">ILPA-aligned · {ov.lpTerms.carryPct}% carry · {ov.lpTerms.preferredReturnPct}% pref · {ov.lpTerms.managementFeePct}% fee</span></div>
        <ul className="fnd-ilpa">
          {ov.ilpaSummary.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      </section>
    </div>
  );
}

function Kpi({ v, l, s }: { v: string; l: string; s: string }) {
  return (
    <div className="fnd-kpi">
      <div className="fnd-kpi-v">{v}</div>
      <div className="fnd-kpi-l">{l}</div>
      <div className="fnd-kpi-s">{s}</div>
    </div>
  );
}

const CSS = `
.fnd-wrap { padding: 18px 20px 40px; max-width: 1180px; display: flex; flex-direction: column; gap: 16px; }
.fnd-empty { color: var(--muted); }
.fnd-head h2 { margin: 0 0 4px; font-size: 20px; }
.fnd-head p { margin: 0; color: var(--muted); font-size: 13px; }
.fnd-method { margin: 8px 0 14px; font-size: 12px; }
.fnd-method-asof { color: var(--muted); }
.fnd-method-btn { margin-left: 10px; border: 1px solid var(--border, #33333f); background: none; color: var(--accent, #6ea8fe); border-radius: 6px; padding: 2px 9px; font: inherit; font-size: 11.5px; cursor: pointer; }
.fnd-method-body { margin-top: 8px; border: 1px solid var(--border, #2a2a35); border-radius: 8px; padding: 10px 12px; background: var(--card, #1b1b22); }
.fnd-method-note { margin: 0 0 8px; color: var(--muted); font-size: 11.5px; line-height: 1.5; }
.fnd-method-tbl { border-collapse: collapse; width: 100%; }
.fnd-method-tbl td { border-top: 1px solid var(--border, #2a2a35); padding: 5px 8px; vertical-align: top; font-size: 11.5px; }
.fnd-method-lbl { font-weight: 600; white-space: nowrap; }
.fnd-method-frm { font-family: ui-monospace, monospace; color: var(--fg); }
.fnd-method-def { color: var(--muted); }
.fnd-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
.fnd-kpis.inpanel { padding: 14px 16px; }
.fnd-kpi { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 13px 15px; box-shadow: var(--shadow); }
.fnd-kpi-v { font-size: 22px; font-weight: 700; }
.fnd-kpi-l { font-size: 13px; margin-top: 2px; }
.fnd-kpi-s { color: var(--muted); font-size: 11.5px; margin-top: 2px; }
.fnd-panel { background: var(--card); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; }
.fnd-panel-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border); font-weight: 700; flex-wrap: wrap; }
.fnd-mut { color: var(--muted); font-size: 12px; font-weight: 400; }
.fnd-note { color: var(--muted); font-size: 11.5px; padding: 8px 16px 0; }
.fnd-wrap .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin: 0 3px 0 8px; vertical-align: middle; }
.fnd-wrap .dot.ok { background: var(--good); } .fnd-wrap .dot.warn { background: var(--warn); } .fnd-wrap .dot.bad { background: var(--bad); }
.fnd-table { display: flex; flex-direction: column; }
.fnd-tr { display: grid; grid-template-columns: 2.2fr .7fr 1.1fr .8fr .8fr .9fr 1.6fr 1fr; align-items: center; gap: 8px; padding: 10px 16px; font-size: 13px; text-align: left; }
.fnd-th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .4px; border-bottom: 1px solid var(--border); }
.fnd-tr.row { border: none; border-bottom: 1px solid var(--border); background: none; color: var(--fg); cursor: pointer; font: inherit; width: 100%; }
.fnd-tr.row:hover { background: var(--hover); }
.fnd-tr.row.open { background: var(--hover); }
.c-co { display: flex; flex-direction: column; min-width: 0; }
.c-name { font-weight: 700; }
.c-sub { color: var(--muted); font-size: 11px; }
.c-vcp { display: flex; align-items: center; gap: 8px; }
.c-vcp em { font-style: normal; color: var(--muted); font-size: 12px; }
.bar { display: block; flex: 1; height: 6px; min-width: 60px; background: var(--hover); border-radius: 4px; overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--accent); }
.pos { color: var(--good); } .neg { color: var(--bad); }
.pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--chip); white-space: nowrap; font-weight: 600; }
.pill.ok { background: var(--good-bg); color: var(--good); } .pill.warn { background: var(--warn-bg); color: var(--warn); } .pill.bad { background: var(--bad-bg); color: var(--bad); }
.fnd-detail { padding: 4px 16px 16px; background: var(--hover); border-bottom: 1px solid var(--border); }
.c-thesis { margin: 8px 0 12px; font-size: 12.5px; color: var(--fg); opacity: .9; }
.c-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.c-h { font-weight: 700; font-size: 12px; margin-bottom: 8px; }
.c-lever { margin-bottom: 10px; }
.c-lever-top { display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 3px; }
.c-lever-top em { font-style: normal; color: var(--muted); }
.c-lever .bar { width: 100%; }
.c-lever-sub { color: var(--muted); font-size: 11px; margin-top: 3px; }
.c-addons { margin-top: 10px; font-size: 12px; color: var(--muted); }
.kpi-tbl { display: flex; flex-direction: column; font-size: 12.5px; }
.kpi-row { display: grid; grid-template-columns: 2fr 1fr 1fr .8fr; gap: 6px; padding: 4px 0; border-bottom: 1px dashed var(--border); }
.kpi-hd { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .3px; }
.kpi-unit { color: var(--muted); font-style: normal; font-size: 11px; }
.c-marks { margin-top: 10px; font-size: 11.5px; color: var(--muted); }
.fnd-conc { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.conc-row { display: grid; grid-template-columns: 1.4fr 3fr 2fr; align-items: center; gap: 12px; font-size: 13px; }
.conc-name { font-weight: 600; }
.conc-bar { position: relative; height: 12px; background: var(--hover); border-radius: 6px; overflow: hidden; }
.conc-fill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 6px; }
.conc-fill.ok { background: var(--good); } .conc-fill.warn { background: var(--warn); } .conc-fill.bad { background: var(--bad); }
.conc-limit { position: absolute; right: 0; top: -2px; bottom: -2px; width: 2px; background: var(--fg); opacity: .35; }
.conc-val { color: var(--muted); font-size: 12px; }
.conc-val em { font-style: normal; opacity: .7; }
.conc-note { margin-top: 4px; font-size: 12.5px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fnd-ilpa { margin: 0; padding: 12px 16px 14px 34px; display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: var(--fg); }
.fnd-ilpa li { opacity: .9; }
.fnd-retry { border: 1px solid var(--border); background: var(--card); color: var(--fg); border-radius: 6px; padding: 4px 12px; font: inherit; font-size: 12.5px; cursor: pointer; margin-left: 6px; }
.fnd-retry:hover { background: var(--hover); }
/* A half-height Teams window on a 1080p screen sits in the 861-1149px band, which
   had no rules at all: eight equal columns squeezed until the value-creation cell
   was unreadable. Drop that column first, as the wider breakpoint below does. */
@media (max-width: 1149px) {
  .fnd-tr { grid-template-columns: 1.7fr .7fr 1fr .8fr .8fr .9fr 1.2fr; }
  .c-vcp { display: none; }
}
@media (max-width: 860px) {
  .fnd-tr { grid-template-columns: 1.6fr .6fr .8fr .8fr .8fr 1.2fr; }
  /* The old rule hid a cell in the data rows but tried to hide the matching heading
     with an nth-child selector on .fnd-th - and .fnd-th IS a row, the table's first
     child, so that selector matched nothing. Headings and columns drifted apart.
     Both cells now carry the same class, so a column always leaves with its heading. */
  .c-vcp, .c-entry { display: none; }
  .c-grid { grid-template-columns: 1fr; }
}
`;

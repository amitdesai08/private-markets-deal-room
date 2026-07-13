import { useEffect, useState } from 'react';

// Fund / portfolio lens (post-IC). Three views from the orchestrator:
//   /api/fund/value     — executive value / ROI dashboard
//   /api/fund/overview  — fund / LP performance + concentration vs LPA limits
//   /api/fund/portfolio — owned-company monitoring (VCP, KPIs, MOIC, status)

type Concentration = { name: string; equity: number; pctOfFund: number; pctOfInvested: number; limitPct: number | null; status: string };
type Overview = {
  fund: { name: string; strategy: string; vintageYear: number; investmentPeriod: string; fundSizeLabel: string };
  capital: { committed: number; invested: number; reserves: number; dryPowder: number; deployedPct: number; portfolioCompanies: number };
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
const OWNER_LABEL: Record<string, string> = {
  analyst: 'Analyst', partner: 'Partner', principal: 'Principal', 'retail-md': 'Retail MD', 'ai-md': 'AI MD',
  'supply-md': 'Supply MD', 'operating-partner': 'Operating Partner', 'fund-cfo': 'Fund CFO', 'legal-gc': 'General Counsel', 'ir-lp': 'Investor Relations',
};

export default function Fund() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [val, setVal] = useState<Value | null>(null);
  const [openId, setOpenId] = useState('');

  useEffect(() => {
    fetch('/api/fund/overview').then((r) => (r.ok ? r.json() : null)).then(setOv).catch(() => {});
    fetch('/api/fund/portfolio').then((r) => (r.ok ? r.json() : null)).then(setPf).catch(() => {});
    fetch('/api/fund/value').then((r) => (r.ok ? r.json() : null)).then(setVal).catch(() => {});
  }, []);

  if (!ov || !pf) return <div className="fnd-wrap"><style>{CSS}</style><p className="fnd-empty">Loading the fund &amp; portfolio lens…</p></div>;

  const p = ov.performance;
  return (
    <div className="fnd-wrap">
      <style>{CSS}</style>

      <div className="fnd-head">
        <h2>{ov.fund.name}</h2>
        <p>{ov.fund.strategy} · vintage {ov.fund.vintageYear} · {ov.fund.investmentPeriod} · {ov.capital.portfolioCompanies} portfolio companies</p>
      </div>

      {/* Fund / LP headline */}
      <div className="fnd-kpis">
        <Kpi v={ov.fund.fundSizeLabel} l="Committed capital" s={`${ov.capital.deployedPct}% invested`} />
        <Kpi v={usd(ov.capital.invested)} l="Invested" s={`${usd(ov.capital.dryPowder)} dry powder`} />
        <Kpi v={`${p.tvpi.toFixed(2)}x`} l="TVPI (gross)" s={`DPI ${p.dpi.toFixed(2)}x · RVPI ${p.rvpi.toFixed(2)}x`} />
        <Kpi v={`${p.grossMoic.toFixed(2)}x`} l="Gross MOIC" s={`Net ${p.netMoic.toFixed(2)}x`} />
        <Kpi v={`${p.grossIrrPct}%`} l="Gross IRR" s={`Net ${p.netIrrPct}%`} />
        <Kpi v={usd(p.totalValue)} l="Total value" s={`${usd(p.unrealized)} unrealized · ${usd(p.realized)} realized`} />
      </div>

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
        <div className="fnd-table">
          <div className="fnd-tr fnd-th">
            <span className="c-co">Company</span>
            <span>Hold</span><span>Entry → now</span><span>EBITDA</span><span>MOIC</span><span>Gross IRR</span><span className="c-vcp">Value-creation plan</span><span>Status</span>
          </div>
          {pf.companies.map((c) => (
            <div key={c.id}>
              <button className={`fnd-tr row${openId === c.id ? ' open' : ''}`} onClick={() => setOpenId(openId === c.id ? '' : c.id)}>
                <span className="c-co">
                  <span className="c-name">{c.company}</span>
                  <span className="c-sub">{c.sector} · {c.subSector}</span>
                </span>
                <span>{Math.round(c.holdMonths)} mo</span>
                <span>{c.entryMultiple.toFixed(1)}x → {c.currentMultiple.toFixed(1)}x</span>
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
                      <div className="c-h">Value-creation levers · 100-day {c.hundredDayPct}%</div>
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
                          return (
                            <div key={k.label} className="kpi-row">
                              <span>{k.label}</span>
                              <span>{k.plan}{k.unit === '%' ? '%' : k.unit === '$M' ? '' : ''}</span>
                              <span>{k.actual}</span>
                              <span className={d >= 0 ? 'pos' : 'neg'}>{d >= 0 ? '+' : ''}{Math.round(d * 10) / 10}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="c-marks">
                        Entry {usd(c.entryEV)} EV / {usd(c.entryEquity)} equity → current {usd(c.currentEV)} EV / {usd(c.currentEquity)} equity{c.realized ? ` · ${usd(c.realized)} realized` : ''}
                      </div>
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

      {/* Executive value / ROI */}
      {val ? (
        <section className="fnd-panel">
          <div className="fnd-panel-h"><span>Executive value — platform impact</span><span className="fnd-mut">Time-to-IC acceleration &amp; fund performance</span></div>
          <div className="fnd-kpis inpanel">
            <Kpi v={String(val.pipeline.dealsProcessed)} l="Deals processed" s={`${val.pipeline.inDiligence} in diligence`} />
            <Kpi v={String(val.pipeline.analystHoursSaved)} l="Analyst-hours saved" s={`${val.pipeline.fteWeeksSaved} FTE-weeks`} />
            <Kpi v={`${val.pipeline.cycleReductionPct}%`} l="Cycle-time compression" s={`${val.pipeline.avgDaysSaved}d faster to IC`} />
            <Kpi v={`${val.pipeline.avgIcReadiness}`} l="Avg IC readiness" s="across active deals" />
            <Kpi v={`${val.portfolio.grossMoic.toFixed(2)}x`} l="Portfolio gross MOIC" s={`${val.portfolio.grossIrrPct}% IRR`} />
            <Kpi v={usd(val.portfolio.capitalDeployed)} l="Capital deployed" s={`${val.portfolio.companies} companies`} />
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
.fnd-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
.fnd-kpis.inpanel { padding: 14px 16px; }
.fnd-kpi { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 13px 15px; box-shadow: var(--shadow); }
.fnd-kpi-v { font-size: 22px; font-weight: 700; }
.fnd-kpi-l { font-size: 13px; margin-top: 2px; }
.fnd-kpi-s { color: var(--muted); font-size: 11.5px; margin-top: 2px; }
.fnd-panel { background: var(--card); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; }
.fnd-panel-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border); font-weight: 700; flex-wrap: wrap; }
.fnd-mut { color: var(--muted); font-size: 12px; font-weight: 400; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin: 0 3px 0 8px; vertical-align: middle; }
.dot.ok { background: #1b7f37; } .dot.warn { background: #b8860b; } .dot.bad { background: #b23b3b; }
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
.pos { color: #1b7f37; } .neg { color: #b23b3b; }
.pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--chip); white-space: nowrap; font-weight: 600; }
.pill.ok { background: #1b7f3722; color: #1b7f37; } .pill.warn { background: #b8860b22; color: #b8860b; } .pill.bad { background: #b23b3b22; color: #b23b3b; }
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
.c-marks { margin-top: 10px; font-size: 11.5px; color: var(--muted); }
.fnd-conc { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.conc-row { display: grid; grid-template-columns: 1.4fr 3fr 2fr; align-items: center; gap: 12px; font-size: 13px; }
.conc-name { font-weight: 600; }
.conc-bar { position: relative; height: 12px; background: var(--hover); border-radius: 6px; overflow: hidden; }
.conc-fill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 6px; }
.conc-fill.ok { background: #1b7f37; } .conc-fill.warn { background: #b8860b; } .conc-fill.bad { background: #b23b3b; }
.conc-limit { position: absolute; right: 0; top: -2px; bottom: -2px; width: 2px; background: var(--fg); opacity: .35; }
.conc-val { color: var(--muted); font-size: 12px; }
.conc-val em { font-style: normal; opacity: .7; }
.conc-note { margin-top: 4px; font-size: 12.5px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fnd-ilpa { margin: 0; padding: 12px 16px 14px 34px; display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: var(--fg); }
.fnd-ilpa li { opacity: .9; }
@media (max-width: 860px) {
  .fnd-tr { grid-template-columns: 1.6fr .6fr 1fr .8fr .8fr 1.2fr; }
  .fnd-tr .c-vcp, .fnd-th:nth-child(7) { display: none; }
  .c-grid { grid-template-columns: 1fr; }
}
`;

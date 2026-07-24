// The "Deal Room Report" surface — a clean, print-friendly report rendered by the app
// itself, so a Teams channel tab can be pinned to it (configured from /config with
// ?view=report). Reuses the SAME backend data as the dashboard (no new endpoints):
// portfolio mode summarizes the whole pipeline; ?deal=<id> narrows to one deal.
import type { Analytics, Pipeline, Deal, MarketIntel, BackendConfig } from './types';

function money(n?: number): string {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n)}`;
}

const TODAY = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

export default function Report({ analytics, pipeline, deals, market, config, dealId }: {
  analytics: Analytics | null; pipeline: Pipeline | null; deals: Deal[]; market: MarketIntel | null;
  config: BackendConfig | null; dealId?: string;
}) {
  const focus = dealId ? deals.find((d) => d.id === dealId) : null;
  const fabric = config?.fabric || market?.info;
  const comps = market?.comparableDeals || [];
  const precedents = market?.icPrecedents || [];
  const title = focus
    ? `${focus.company} — Deal Report`
    : `${pipeline?.fundName || 'Deal Room'} — Portfolio Report`;

  return (
    <div className="report">
      <style>{REPORT_CSS}</style>

      <header className="rpt-head">
        <div>
          <div className="rpt-kicker">The Deal Room</div>
          <h1 className="rpt-title">{title}</h1>
          <div className="rpt-sub">{pipeline?.fundStrategy || 'Private markets deal flow'} · Generated {TODAY}</div>
        </div>
        <button className="rpt-print" onClick={() => window.print()}>⤓ Print / Save as PDF</button>
      </header>

      {focus ? (
        <section className="rpt-section">
          <div className="rpt-kpis">
            <div className="rpt-kpi"><div className="v">{focus.stageName || focus.stage || '—'}</div><div className="l">Stage</div></div>
            <div className="rpt-kpi"><div className="v">{focus.status || '—'}</div><div className="l">Status</div></div>
            <div className="rpt-kpi"><div className="v">{focus.readiness ?? 0}%</div><div className="l">IC readiness</div></div>
            <div className="rpt-kpi"><div className="v">{focus.daysToIC ?? '—'}</div><div className="l">Days to IC</div></div>
            <div className="rpt-kpi"><div className="v">{money(focus.dealSize)}</div><div className="l">Deal size</div></div>
          </div>
          <p className="rpt-note">
            {focus.sector ? `Sector: ${focus.sector}. ` : ''}This one-page report summarizes the live deal
            record. Open the deal in the Deal Room for full diligence detail, findings and documents.
          </p>
        </section>
      ) : (
        <>
          <section className="rpt-section">
            <div className="rpt-kpis">
              <div className="rpt-kpi"><div className="v">{analytics?.deals ?? deals.length}</div><div className="l">Live deals</div></div>
              <div className="rpt-kpi"><div className="v">{analytics?.inDiligence ?? 0}</div><div className="l">In diligence</div></div>
              <div className="rpt-kpi"><div className="v">{analytics?.avgReadiness ?? 0}%</div><div className="l">Avg IC readiness</div></div>
              <div className="rpt-kpi"><div className="v">{analytics?.cycleReductionPct ?? 0}%</div><div className="l">Cycle reduction</div></div>
              <div className="rpt-kpi"><div className="v">{comps.length}·{precedents.length}</div><div className="l">Comps · IC precedents</div></div>
            </div>
          </section>

          {pipeline?.funnel?.length ? (
            <section className="rpt-section">
              <h2 className="rpt-h">Origination funnel</h2>
              <div className="rpt-funnel">
                {pipeline.funnel.map((f) => (
                  <div key={f.key} className="rpt-fstep"><div className="c">{f.count}</div><div className="fl">{f.label}</div></div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rpt-section">
            <h2 className="rpt-h">Pipeline deals <span className="rpt-mut">{deals.length} active</span></h2>
            {deals.length === 0 ? (
              <p className="rpt-note">No deals are live yet. Sourced candidates that clear the screening gate appear here.</p>
            ) : (
              <table className="rpt-table">
                <thead>
                  <tr><th>Company</th><th>Sector</th><th>Stage</th><th>Status</th><th className="num">IC readiness</th><th className="num">Size</th></tr>
                </thead>
                <tbody>
                  {deals.map((d) => (
                    <tr key={d.id}>
                      <td className="co">{d.company}</td>
                      <td>{d.sector || '—'}</td>
                      <td>{d.stageName || d.stage || '—'}</td>
                      <td>{d.status || '—'}</td>
                      <td className="num">{d.readiness ?? 0}%</td>
                      <td className="num">{money(d.dealSize)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      <footer className="rpt-foot">
        Generated from the live Deal Room backend · {fabric?.mode === 'live' ? 'Fabric market intel: live' : 'seeded / materialized data'} · CONFIDENTIAL
      </footer>
    </div>
  );
}

const REPORT_CSS = `
.report { max-width: 900px; margin: 0 auto; padding: 28px 32px 48px; background: #fff; color: #1b1b1f; font: 14px/1.55 "Segoe UI", system-ui, sans-serif; min-height: 100vh; }
.rpt-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 2px solid #6264A7; padding-bottom: 16px; margin-bottom: 20px; }
.rpt-kicker { color: #6264A7; font-weight: 700; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
.rpt-title { margin: 4px 0 2px; font-size: 24px; }
.rpt-sub { color: #616161; font-size: 13px; }
.rpt-print { flex: 0 0 auto; border: 1px solid #6264A7; background: #6264A7; color: #fff; padding: 8px 14px; border-radius: 8px; cursor: pointer; font: inherit; font-weight: 600; }
.rpt-print:hover { background: #4f5199; }
.rpt-section { margin-bottom: 22px; }
.rpt-h { font-size: 16px; margin: 0 0 12px; border-bottom: 1px solid #e5e5ea; padding-bottom: 6px; }
.rpt-mut { color: #8a8a94; font-weight: 400; font-size: 12px; }
.rpt-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.rpt-kpi { border: 1px solid #e5e5ea; border-radius: 10px; padding: 12px 14px; background: #fafafd; }
.rpt-kpi .v { font-size: 20px; font-weight: 700; }
.rpt-kpi .l { color: #616161; font-size: 12px; margin-top: 2px; }
.rpt-funnel { display: flex; gap: 8px; overflow-x: auto; }
.rpt-fstep { flex: 1 0 90px; text-align: center; background: #f2f2f7; border-radius: 10px; padding: 10px 8px; }
.rpt-fstep .c { font-size: 20px; font-weight: 700; }
.rpt-fstep .fl { font-size: 12px; color: #444; }
.rpt-note { color: #444; font-size: 13px; background: #f7f7fb; border-radius: 8px; padding: 10px 12px; }
.rpt-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.rpt-table th, .rpt-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #ececf1; }
.rpt-table th { color: #616161; font-weight: 600; font-size: 12px; }
.rpt-table td.co { font-weight: 600; }
.rpt-table .num { text-align: right; }
.rpt-foot { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e5e5ea; color: #8a8a94; font-size: 11px; }
@media print {
  .rpt-print { display: none; }
  .report { max-width: none; padding: 0; }
}
`;

import { useEffect, useState } from 'react';

const money = (n?: number) => (n == null ? '—' : n >= 1000 ? `$${(n / 1000).toFixed(1)}B` : `$${Math.round(n)}M`);

type Any = Record<string, any>;

export default function DealArtifacts({ dealId }: { dealId: string }) {
  const [returns, setReturns] = useState<Any | null>(null);
  const [vcp, setVcp] = useState<Any | null>(null);
  const [risk, setRisk] = useState<Any | null>(null);
  const [ioi, setIoi] = useState<Any | null>(null);
  const [loi, setLoi] = useState<Any | null>(null);

  useEffect(() => {
    const load = (u: string, set: (x: Any | null) => void) =>
      fetch(u).then((r) => (r.ok ? r.json() : null)).then(set).catch(() => {});
    load(`/api/deals/${dealId}/returns`, setReturns);
    load(`/api/deals/${dealId}/value-creation`, setVcp);
    load(`/api/deals/${dealId}/risk-register`, setRisk);
    load(`/api/deals/${dealId}/ioi`, setIoi);
    load(`/api/deals/${dealId}/loi`, setLoi);
  }, [dealId]);

  return (
    <div className="da-wrap">
      <style>{CSS}</style>

      {returns && (
        <section className="da-card">
          <div className="da-h">💰 LBO / Returns<span className="da-owner">Fund CFO</span></div>
          <div className="da-headline">{returns.headline}</div>
          <div className="da-scen">
            {(returns.scenarios || []).map((s: Any) => (
              <div key={s.name} className={`da-scenrow${s.name === 'Base' ? ' base' : ''}`}>
                <span className="n">{s.name}</span><span>{s.irr}% IRR</span><span>{s.moic}x MOIC</span><span className="m">{money(s.equityOut)} equity out</span>
              </div>
            ))}
          </div>
          {returns.sourcesUses && (
            <div className="da-su">
              <div><b>Sources</b>{(returns.sourcesUses.sources || []).map((x: Any) => <div key={x.label}>{x.label} <span>{money(x.amount)}</span></div>)}</div>
              <div><b>Uses</b>{(returns.sourcesUses.uses || []).map((x: Any) => <div key={x.label}>{x.label} <span>{money(x.amount)}</span></div>)}</div>
            </div>
          )}
        </section>
      )}

      {vcp && (
        <section className="da-card">
          <div className="da-h">🚀 Value creation & 100-day<span className="da-owner">Operating Partner</span></div>
          <div className="da-headline">{vcp.headline}</div>
          {vcp.ebitdaBridge && (
            <div className="da-bridge">EBITDA bridge: {money(vcp.ebitdaBridge.entry)} → {money(vcp.ebitdaBridge.exit)} <b>(+{money(vcp.ebitdaBridge.delta)})</b></div>
          )}
          <div className="da-levers">
            {(vcp.levers || []).map((l: Any) => (
              <div key={l.name} className="da-lever"><span className="l">{l.name}</span><span className="i">{l.impact != null ? money(l.impact) : '—'}</span><span className="t">{l.timeline}</span></div>
            ))}
          </div>
        </section>
      )}

      {risk && (
        <section className="da-card">
          <div className="da-h">⚠️ Risk register<span className={`da-status ${risk.status}`}>{risk.status?.toUpperCase()}</span></div>
          <div className="da-headline">{risk.headline}</div>
          <div className="da-risks">
            {(risk.risks || []).slice(0, 8).map((r: Any) => (
              <div key={r.id} className={`da-risk sev-${r.severity}`}>
                <span className="ws">{r.workstream}</span>
                <span className="rk">{r.risk}</span>
                <span className="mt"><b>{r.severityLabel}</b> · {r.likelihood} likelihood · {r.mitigation}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {ioi && (
        <section className="da-card">
          <div className="da-h">📨 IOI — Indication of Interest<span className="da-owner">Principal</span></div>
          <div className="da-headline">{ioi.headline}</div>
          <div className="da-terms">
            <div><b>Valuation</b> {money(ioi.valuation?.low)}–{money(ioi.valuation?.high)} ({ioi.valuation?.mid ? money(ioi.valuation.mid) + ' mid' : ''})</div>
            {(ioi.structure || []).map((t: Any) => <div key={t.term}><b>{t.term}</b> {t.detail}</div>)}
            <div className="muted">Valid {ioi.validity}</div>
          </div>
        </section>
      )}

      {loi && (
        <section className="da-card">
          <div className="da-h">📝 LOI — Letter of Intent<span className="da-owner">Partner</span></div>
          <div className="da-headline">{loi.headline}</div>
          <div className="da-terms">
            <div><b>Price</b> {money(loi.price?.enterpriseValue)} EV · {loi.price?.multiple}</div>
            <div><b>Exclusivity</b> {loi.exclusivity}</div>
            {(loi.keyTerms || []).map((t: Any) => <div key={t.term}><b>{t.term}</b> {t.detail}</div>)}
          </div>
        </section>
      )}

      {!returns && !vcp && !risk && <p className="muted">Loading decision artifacts…</p>}
    </div>
  );
}

const CSS = `
.da-wrap { display: grid; gap: 12px; }
.da-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 13px 15px; }
.da-h { font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px; }
.da-owner { margin-left: auto; font-size: 11px; font-weight: 600; background: var(--chip); padding: 3px 9px; border-radius: 999px; }
.da-status { margin-left: auto; font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 999px; color: #fff; }
.da-status.green { background: #1b7f37; } .da-status.amber { background: #b45309; } .da-status.red { background: #b91c1c; }
.da-headline { font-size: 12.5px; color: var(--fg); opacity: .9; margin: 6px 0 10px; line-height: 1.5; }
.da-scen { display: grid; gap: 4px; }
.da-scenrow { display: grid; grid-template-columns: 90px 90px 90px 1fr; gap: 8px; font-size: 12px; padding: 5px 8px; border-radius: 7px; background: var(--chip); }
.da-scenrow.base { outline: 2px solid var(--accent); font-weight: 700; }
.da-scenrow .n { font-weight: 700; } .da-scenrow .m { color: var(--muted); text-align: right; }
.da-su { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 10px; font-size: 12px; }
.da-su > div > div { display: flex; justify-content: space-between; border-bottom: 1px dashed var(--border); padding: 3px 0; }
.da-su b { display: block; margin-bottom: 4px; color: var(--muted); font-size: 11px; text-transform: uppercase; }
.da-su span { font-weight: 600; }
.da-bridge { font-size: 12.5px; margin-bottom: 8px; }
.da-levers { display: grid; gap: 4px; }
.da-lever { display: grid; grid-template-columns: 1fr 80px 120px; gap: 8px; font-size: 12px; padding: 4px 8px; border-radius: 7px; background: var(--chip); }
.da-lever .i { font-weight: 700; text-align: right; } .da-lever .t { color: var(--muted); text-align: right; }
.da-risks { display: grid; gap: 6px; }
.da-risk { display: grid; gap: 2px; font-size: 12px; padding: 7px 9px; border-radius: 8px; background: var(--chip); border-left: 3px solid var(--border); }
.da-risk.sev-stopper { border-left-color: #b91c1c; } .da-risk.sev-reprice { border-left-color: #b45309; }
.da-risk.sev-condition { border-left-color: #2563eb; } .da-risk.sev-monitor { border-left-color: #64748b; }
.da-risk .ws { font-size: 10.5px; text-transform: uppercase; color: var(--muted); font-weight: 700; }
.da-risk .rk { font-weight: 600; } .da-risk .mt { color: var(--muted); font-size: 11.5px; }
.da-terms { display: grid; gap: 5px; font-size: 12px; }
.da-terms > div { line-height: 1.45; } .da-terms b { color: var(--muted); }
`;

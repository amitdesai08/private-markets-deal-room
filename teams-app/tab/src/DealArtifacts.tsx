// The "Decision artifacts" cards for one deal, rendered inside DealDetail's
// artifacts tab: LBO/returns, value-creation / 100-day plan, risk register and
// IOI/LOI — each fetched from /api/deals/:id/{returns,value-creation,risk-register,
// ioi,loi}, plus the returns Excel download. All read-only projections of the live
// record (built server-side in app/lib/diligence.js).
import { useEffect, useState } from 'react';
import { af } from './authFetch';

const money = (n?: number) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}B` : `${Math.round(n)}M`);
// THE CASE prints the exit EBITDA to one decimal and this tab rounded the same field to
// whole millions, so two tabs of one deal said $170.8M and $171M. Where a figure is not
// a whole number, show the decimal — it is the same number or it is two numbers.
const moneyExact = (n?: number) => (n == null ? '—'
  : n >= 1000 ? `${(n / 1000).toFixed(1)}B`
    : `${Math.abs(n - Math.round(n)) < 0.05 ? Math.round(n) : n.toFixed(1)}M`);

type Any = Record<string, any>;

export default function DealArtifacts({ dealId }: { dealId: string }) {
  // An IOI and an LOI are pre-signing documents. They were rendered on portfolio
  // companies and on deals nobody had launched, offering exclusivity on a deal that
  // has none.
  const [stage, setStage] = useState<string>('');
  useEffect(() => {
    let off = false;
    af(`/api/deals/${dealId}`).then((r) => r.json()).then((d) => { if (!off) setStage(String(d?.stage || '')); }).catch(() => {});
    return () => { off = true; };
  }, [dealId]);
  const preSigning = /^D/i.test(stage);
  const [returns, setReturns] = useState<Any | null>(null);
  const [vcp, setVcp] = useState<Any | null>(null);
  const [risk, setRisk] = useState<Any | null>(null);
  const [ioi, setIoi] = useState<Any | null>(null);
  const [loi, setLoi] = useState<Any | null>(null);
  // Every loader swallowed its error, so a failed request left all five null and the
  // tab said "Loading…" for ever. "Settled" means all five have come back one way or
  // another — after that, an empty screen is a fact about the deal, not about the
  // network, and it should say which.
  const [settled, setSettled] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setSettled(false);
    const load = (u: string, set: (x: Any | null) => void) =>
      af(u).then((r) => (r.ok ? r.json() : null)).then((v) => { if (live) set(v); }).catch(() => {});
    Promise.all([
      load(`/api/deals/${dealId}/returns`, setReturns),
      load(`/api/deals/${dealId}/value-creation`, setVcp),
      load(`/api/deals/${dealId}/risk-register`, setRisk),
      load(`/api/deals/${dealId}/ioi`, setIoi),
      load(`/api/deals/${dealId}/loi`, setLoi),
    ]).then(() => { if (live) setSettled(true); });
    return () => { live = false; };
  }, [dealId, attempt]);

  return (
    <div className="da-wrap">
      <style>{CSS}</style>

      {returns && (
        <section className="da-card">
          <div className="da-h">💰 LBO / Returns<span className="da-owner">Fund CFO</span></div>
          <div className="da-headline">{returns.headline}</div>
          {/* Computed on every deal and shown on none: a reader was quoting an IRR off a
              model the payload itself calls a screening heuristic. */}
          {(returns.assumptions || [])[0] ? (
            <div className="da-caveat">{(returns.assumptions || [])[0]}</div>
          ) : null}
          <div className="da-scen">
            {(returns.scenarios || []).map((s: Any) => (
              <div key={s.name} className={`da-scenrow${s.name === 'Base' ? ' base' : ''}`}>
                <span className="n">{s.name}</span><span>{s.irr}% IRR</span><span>{s.moic}x MOIC</span><span className="m">{money(s.equityOut)} equity out</span>
              </div>
            ))}
          </div>
          {returns.sourcesUses && (
            <>
            <div className="da-su">
              <div><b>Sources</b>{(returns.sourcesUses.sources || []).map((x: Any) => <div key={x.label}>{x.label} <span>{money(x.amount)}</span></div>)}</div>
              <div><b>Uses</b>{(returns.sourcesUses.uses || []).map((x: Any) => <div key={x.label}>{x.label} <span>{money(x.amount)}</span></div>)}</div>
            </div>
            {returns.sourcesUses.equityBasisNote ? (
              <div className="muted" style={{ fontSize: 11.5, padding: '6px 0 0' }}>{returns.sourcesUses.equityBasisNote}</div>
            ) : null}
            </>
          )}
          {/* "What did you finance this at?" is the first question in the room, and the
              model had the answer while every screen said "not recorded". */}
          {returns.financing?.base ? (
            <div className="da-fin">
              <div className="da-finrow">
                <span>Cost of debt</span><span>{returns.financing.costOfDebtPct}%</span>
              </div>
              <div className="da-finrow">
                <span>Interest over the hold</span><span>{money(returns.financing.base.interestPaid)}</span>
              </div>
              <div className="da-finrow">
                <span>Cash tax</span><span>{money(returns.financing.base.taxPaid)}</span>
              </div>
              <div className="da-finrow">
                <span>Maintenance capex</span><span>{money(returns.financing.base.capexPaid)}</span>
              </div>
              <div className="da-finrow">
                <span>Debt repaid · outstanding at exit</span><span>{money(returns.financing.base.debtRepaid)} · {money(returns.financing.base.debtAtExit)}</span>
              </div>
              {returns.financing.basis ? (
                <div className="muted" style={{ fontSize: 11.5, padding: '6px 0 0' }}>{returns.financing.basis}</div>
              ) : null}
            </div>
          ) : null}
          {returns.growthBasis ? (
            <div className="muted" style={{ fontSize: 11.5, padding: '6px 0 0' }}>{returns.growthBasis}</div>
          ) : null}
        </section>
      )}

      {vcp && (
        <section className="da-card">
          <div className="da-h">🚀 Value creation & 100-day<span className="da-owner">Operating Partner</span></div>
          <div className="da-headline">{vcp.headline}</div>
          {/* The plan multiplies the same EBITDA the case page calls unusable out over five
              years. The returns card carries this caveat; this one did not. */}
          {vcp.indicative && vcp.indicativeNote ? (
            <div className="da-caveat">{vcp.indicativeNote}</div>
          ) : null}
          {vcp.ebitdaBridge && (
            <div className="da-bridge">EBITDA bridge: {moneyExact(vcp.ebitdaBridge.entry)} → {moneyExact(vcp.ebitdaBridge.exit)} <b>(+{moneyExact(vcp.ebitdaBridge.delta)})</b></div>
          )}
          <div className="da-levers">
            {(vcp.levers || []).map((l: Any) => (
              <div key={l.name} className="da-lever"><span className="l">{l.name}</span><span className="i">{l.impact != null ? money(l.impact) : '—'}</span><span className="t">{l.shareOfPlan || l.timeline}</span></div>
            ))}
          </div>
          {/* The levers are a decomposition of the headline, so the card says so. The
              previous version listed levers summing to four times its own target and left
              the reader to do the addition and lose confidence in the page. */}
          {vcp.leversReconcile && vcp.ebitdaBridge?.delta ? (
            <div className="da-bridge">The levers above allocate the full {money(vcp.ebitdaBridge.delta)} target.</div>
          ) : null}
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
                <span className="mt"><b>{r.severityLabel}</b> · {r.mitigation}</span>
              </div>
            ))}
          {(risk.risks || []).length > 8 ? (
            <div className="da-caveat">Showing the 8 most serious of {(risk.risks || []).length} rows on the register. The rest are watch items.</div>
          ) : null}
          </div>
        </section>
      )}

      {ioi && preSigning && (
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

      {loi && preSigning && (
        <section className="da-card">
          <div className="da-h">📝 LOI — Letter of Intent<span className="da-owner">Partner</span></div>
          <div className="da-headline">{loi.headline}</div>
          <div className="da-terms">
            <div><b>Price</b> {money(loi.price?.enterpriseValue)} EV · {loi.price?.multiple}</div>
            {loi.price?.mechanism ? <div><b>Price mechanism</b> {loi.price.mechanism}</div> : null}
            {(loi.structure || []).map((s: Any) => <div key={s.term}><b>{s.term}</b> {s.detail}</div>)}
            <div><b>Exclusivity</b> {loi.exclusivity}</div>
            {(loi.keyTerms || []).map((t: Any) => <div key={t.term}><b>{t.term}</b> {t.detail}</div>)}
            {loi.binding ? <div><b>Binding</b> {loi.binding}</div> : null}
          </div>
        </section>
      )}

      {!returns && !vcp && !risk && !(ioi && preSigning) && !(loi && preSigning) ? (
        settled ? (
          <p className="muted">
            Nothing here yet. The returns case, value-creation plan and risk register appear once the deal
            reaches diligence — build them from Generate a document.{' '}
            <button className="askbtn" onClick={() => setAttempt((n) => n + 1)}>Check again</button>
          </p>
        ) : <p className="muted">Loading…</p>
      ) : null}
    </div>
  );
}

const CSS = `
.da-wrap { display: grid; gap: 12px; }
.da-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 13px 15px; }
.da-h { font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px; }
.da-owner { margin-left: auto; font-size: 11px; font-weight: 600; background: var(--chip); padding: 3px 9px; border-radius: 999px; }
.da-status { margin-left: auto; font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 999px; border: 1px solid; }
.da-status.green { background: var(--good-bg); color: var(--good); border-color: var(--good-br); } .da-status.amber { background: var(--warn-bg); color: var(--warn); border-color: var(--warn-br); } .da-status.red { background: var(--bad-bg); color: var(--bad); border-color: var(--bad-br); }
.da-headline { font-size: 12.5px; color: var(--fg); opacity: .9; margin: 6px 0 10px; line-height: 1.5; }
.da-caveat { font-size: 11.5px; color: var(--warn); line-height: 1.5; margin: -4px 0 10px; padding: 7px 10px; border: 1px solid var(--border); border-radius: 7px; }
.da-scen { display: grid; gap: 4px; }
.da-scenrow { display: grid; grid-template-columns: 90px 90px 90px 1fr; gap: 8px; font-size: 12px; padding: 5px 8px; border-radius: 7px; background: var(--chip); }
.da-scenrow.base { outline: 2px solid var(--accent); font-weight: 700; }
.da-scenrow .n { font-weight: 700; } .da-scenrow .m { color: var(--muted); text-align: right; }
.da-su { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 10px; font-size: 12px; }
.da-fin { border-top: 1px dashed var(--border); margin-top: 8px; padding-top: 8px; }
.da-finrow { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; padding: 2px 0; }
.da-finrow span:last-child { font-weight: 600; }
.da-su > div > div { display: flex; justify-content: space-between; border-bottom: 1px dashed var(--border); padding: 3px 0; }
.da-su b { display: block; margin-bottom: 4px; color: var(--muted); font-size: 11px; text-transform: uppercase; }
.da-su span { font-weight: 600; }
.da-bridge { font-size: 12.5px; margin-bottom: 8px; }
.da-levers { display: grid; gap: 4px; }
.da-lever { display: grid; grid-template-columns: 1fr 80px 120px; gap: 8px; font-size: 12px; padding: 4px 8px; border-radius: 7px; background: var(--chip); }
.da-lever .i { font-weight: 700; text-align: right; } .da-lever .t { color: var(--muted); text-align: right; }
.da-risks { display: grid; gap: 6px; }
.da-risk { display: grid; gap: 2px; font-size: 12px; padding: 7px 9px; border-radius: 8px; background: var(--chip); border-left: 3px solid var(--border); }
.da-risk.sev-stopper { border-left-color: var(--bad); } .da-risk.sev-reprice { border-left-color: var(--warn); }
.da-risk.sev-condition { border-left-color: var(--accent); } .da-risk.sev-monitor { border-left-color: var(--muted); }
.da-risk .ws { font-size: 10.5px; text-transform: uppercase; color: var(--muted); font-weight: 700; }
.da-risk .rk { font-weight: 600; } .da-risk .mt { color: var(--muted); font-size: 11.5px; }
.da-terms { display: grid; gap: 5px; font-size: 12px; }
.da-terms > div { line-height: 1.45; } .da-terms b { color: var(--muted); }
`;

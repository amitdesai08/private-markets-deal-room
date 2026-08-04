// The "Deal Room Report" surface — a clean, print-friendly report rendered by the app
// itself, so a Teams channel tab can be pinned to it (configured from /config with
// ?view=report). Reuses the SAME backend data as the dashboard (no new endpoints):
// portfolio mode summarizes the whole pipeline; ?deal=<id> narrows to one deal.
import { useEffect, useState } from 'react';
import { af } from './authFetch';
import { STATUS_TEXT, isPostIC } from './deskUi';
import type { Pipeline, Deal, MarketIntel, BackendConfig } from './types';

function money(n?: number): string {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n)}`;
}

// Five date formats appeared in one session. This one printed "August 3, 2026" in the
// month-first American order on a document written in British English. One format.
const TODAY = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function Report({ pipeline, deals, market, config, dealId, canCertify = true }: {
  pipeline: Pipeline | null; deals: Deal[]; market: MarketIntel | null;
  config: BackendConfig | null; dealId?: string;
  // The certify button was always enabled and only revealed "restricted to a Partner
  // or Administrator" AFTER the press came back 403 — the same defect we removed from
  // the deal page: a door offered to someone who is locked out of it.
  canCertify?: boolean;
}) {
  const focus = dealId ? deals.find((d) => d.id === dealId) : null;
  const fabric = config?.fabric || market?.info;

  // Report certification lifecycle (portfolio/LP report only). Certifying freezes an
  // immutable snapshot; a live certified snapshot flips the badge from Draft to LP-ready.
  const [certs, setCerts] = useState<any[]>([]);
  const [certBusy, setCertBusy] = useState('');
  const [certNote, setCertNote] = useState('');
  const loadCerts = () => { if (dealId) return; af('/api/fund/report/certifications').then((r) => (r.ok ? r.json() : [])).then((x) => setCerts(Array.isArray(x) ? x : [])).catch(() => {}); };
  useEffect(() => { loadCerts(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dealId]);
  const currentCert = certs.find((c) => c.state === 'certified') || null;
  async function doCertify() {
    setCertBusy('certify'); setCertNote('');
    try {
      const r = await af('/api/fund/report/certify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const d = await r.json().catch(() => ({}));
      if (r.status === 403) setCertNote('Certifying LP reports is restricted to a Partner or Administrator.');
      else if (r.status === 409) setCertNote(`Cannot certify — ${d.detail || 'the report is not ready.'}`);
      else if (!r.ok) setCertNote('Could not certify the report.');
      else { setCertNote('Report certified — an immutable snapshot was frozen for LP distribution.'); loadCerts(); }
    } catch (e: any) { setCertNote(`Could not certify (${String(e?.message || e)}).`); }
    finally { setCertBusy(''); }
  }
  async function doArchive(id: string) {
    setCertBusy('archive:' + id); setCertNote('');
    try { const r = await af(`/api/fund/report/certifications/${id}/archive`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); if (r.status === 403) setCertNote('Archiving is restricted to a Partner or Administrator.'); else if (r.ok) loadCerts(); } catch { /* ignore */ } finally { setCertBusy(''); }
  }
  // Every headline number on this page is now derived from the deals THIS reader can
  // open. It used to mix the two: pipeline value was access-scoped while live deals,
  // deals in diligence and average readiness came from an unfiltered fund-wide call.
  // An analyst with four deals therefore read "19 live deals ... $1.8B" in one strip,
  // on the document the product invites you to certify and send to an LP.
  const scopedDeals = deals.length;
  // A deal restricted to status only is visible but not openable. "Deals you can open"
  // counted it anyway, so an analyst read "1 In diligence" and then could not get into
  // the one deal it referred to.
  const scopedRestricted = deals.filter((d) => (d as any).locked || (d as any).accessLevel === 'status').length;
  const scopedInDD = deals.filter((d) => /diligence|approval/i.test(`${(d as any).stage || ''} ${(d as any).stageName || ''}`)).length;
  const scopedPreIC = deals.filter((d) => !isPostIC((d as any).status));
  const scopedReadiness = scopedPreIC.length
    ? Math.round(scopedPreIC.reduce((s, d) => s + ((d as any).readiness || 0), 0) / scopedPreIC.length)
    : 0;
  const comps = market?.comparableDeals || [];
  const precedents = market?.icPrecedents || [];
  // This document reports the PIPELINE -- live deals, origination, IC readiness. It
  // does not contain NAV, TVPI, DPI, net IRR or a single owned company; those live on
  // Fund & Portfolio under "LP report summary". Calling it a Portfolio Report on the
  // artefact with "Certify for LP use" attached told an LP the GP does not know the
  // difference between its pipeline and its portfolio.
  const title = focus
    ? `${focus.company} — Deal Report`
    : `${pipeline?.fundName || 'The Deal Room'} — Pipeline Report`;

  // LP-grade lineage: every headline metric traces to a source system + as-of date +
  // method.
  const srcLabel = fabric?.source || (fabric?.mode === 'live' ? 'Market data (live)' : 'Deal Room record');
  const asOf = (fabric as any)?.freshness?.label || TODAY;
  // "LP-ready" used to be granted by a live market-data feed, bypassing the approver,
  // the frozen snapshot and the audit row sitting directly above it. A report could
  // reach an LP's inbox stamped LP-ready that nobody had signed. Certification is now
  // the only thing that sets this badge; how fresh the market data is says so on its
  // own line, where it cannot be mistaken for an approval.
  const mode = currentCert
    ? { label: 'Certified for LP use', cls: 'ok' }
    : { label: 'Draft — not certified', cls: 'warn' };
  const dataMode = fabric?.mode === 'live'
    ? { label: 'Market data: live', cls: 'ok' }
    : { label: 'Market data: seeded', cls: 'warn' };
  // "Pipeline value" sat above the words "pipeline, not portfolio holdings" and then
  // counted three companies the fund already owns -- $1.7B, a fifth of the total,
  // double-counted against the portfolio NAV on the next tab. This screen carries a
  // "Certify for LP use" button, so an LP reads it as future deployment capacity.
  // Pre-completion deals only, and the tile says which are excluded.
  const OWNED = new Set(['owned', 'exiting', 'exited']);
  const preCompletion = deals.filter((d) => !OWNED.has(String((d as any).status || '')));
  const pipelineValue = preCompletion.reduce((s, d) => s + (d.dealSize || 0), 0) * 1e6;
  const excludedHoldings = deals.length - preCompletion.length;

  const lineage: { metric: string; value: string; source: string; asOf: string; method: string }[] = focus
    ? [
        { metric: 'Stage', value: focus.stageName || focus.stage || '—', source: 'Deal record', asOf: TODAY, method: 'Current workflow stage of record' },
        { metric: 'IC readiness', value: `${focus.readiness ?? 0}%`, source: 'IC readiness board', asOf: TODAY, method: 'Required papers, blocking workstreams and open risks' },
        { metric: 'Days to IC', value: String(focus.daysToIC ?? '—'), source: 'Deal record', asOf: TODAY, method: 'Target IC date minus today' },
        { metric: 'Deal size', value: money(focus.dealSize), source: 'Deal record', asOf: TODAY, method: 'Enterprise value on the deal record' },
      ]
    : [
        { metric: 'Deals on the book', value: String(scopedDeals), source: 'Deal record', asOf: TODAY, method: `Deals in your view${scopedRestricted ? ` (${scopedRestricted} restricted to status only)` : ''}` },
        { metric: 'In diligence', value: String(scopedInDD), source: 'Deal record', asOf: TODAY, method: 'Deals in Diligence & Approval stages, within your access' },
        { metric: 'Avg IC readiness (pre-IC deals)', value: `${scopedReadiness}%`, source: 'IC readiness board', asOf: TODAY, method: 'Mean readiness across deals not yet through committee, within your access' },
        { metric: 'Pipeline value', value: money(pipelineValue), source: 'Deal record', asOf: TODAY, method: `Sum of enterprise values pre-completion, within your access${excludedHoldings ? ` (excludes ${excludedHoldings} owned or exiting)` : ''}` },
        { metric: 'Comparables', value: String(comps.length), source: srcLabel, asOf, method: 'Market comparable transactions' },
        { metric: 'IC precedents', value: String(precedents.length), source: srcLabel, asOf, method: 'Prior committee decisions in the same sectors' },
      ];

  return (
    <div className="report">
      <style>{REPORT_CSS}</style>

      <header className="rpt-head">
        <div>
          <div className="rpt-kicker">The Deal Room</div>
          <h1 className="rpt-title">{title}</h1>
          <div className="rpt-sub">{pipeline?.fundStrategy || 'Private markets deal flow'} · Generated {TODAY} · <span className={`rpt-mode ${mode.cls}`}>{mode.label}</span> · <span className={`rpt-mode ${dataMode.cls}`}>{dataMode.label}</span></div>
        </div>
        <button className="rpt-print" onClick={() => window.print()}>⤓ Print / Save as PDF</button>
      </header>

      {!focus ? (
        <section className="rpt-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Report certification</div>
              <div className="rpt-sub">{currentCert ? `Certified ${new Date(currentCert.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${currentCert.by}` : 'Draft — not yet certified for LP distribution.'}</div>
            </div>
            {canCertify
              ? <button className="rpt-print" disabled={!!certBusy} onClick={doCertify}>{certBusy === 'certify' ? 'Certifying…' : '✓ Certify for LP use'}</button>
              : <span className="rpt-sub">Certifying an LP report is restricted to a Partner or Administrator.</span>}
          </div>
          {certNote ? <div className="rpt-sub" style={{ marginTop: 6 }}>{certNote}</div> : null}
          {certs.length ? (
            <table className="rpt-lineage" style={{ marginTop: 10 }}>
              <thead><tr><th>Snapshot</th><th>State</th><th>Approver</th><th>Certified</th><th></th></tr></thead>
              <tbody>{certs.slice(0, 8).map((c: any) => (
                <tr key={c.snapshotId}>
                  <td>{c.snapshotId}</td>
                  <td><span className={`rpt-mode ${c.state === 'certified' ? 'ok' : 'warn'}`}>{c.state}</span></td>
                  <td>{c.by}</td>
                  <td>{new Date(c.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td>{c.state === 'certified' && canCertify ? <button className="rpt-print" style={{ padding: '2px 8px', fontSize: 11 }} disabled={!!certBusy} onClick={() => doArchive(c.snapshotId)}>Archive</button> : (c.archivedAt ? `archived ${new Date(c.archivedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : '')}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <div className="rpt-sub" style={{ marginTop: 8 }}>No certifications yet — certifying freezes an immutable snapshot of this report.</div>}
        </section>
      ) : null}

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
            {focus.sector ? `Sector: ${focus.sector}. ` : ''}This one-page report summarises the live deal
            record. Open the deal in the Deal Room for full diligence detail, findings and documents.
          </p>
        </section>
      ) : (
        <>
          <section className="rpt-section">
            <div className="rpt-kpis">
              {/* "19 Live deals" was not true on its own terms -- four of the nineteen are
                  screened and not yet launched, and three are owned or exiting. A partner
                  read this tile, then the deal list saying "All 15", then the briefing
                  saying 19, and had to reconcile three counts of the same thing herself.
                  Say what is being counted, on the tile, in the same breath. */}
              <div className="rpt-kpi"><div className="v">{scopedDeals}</div><div className="l">Deals on the book</div><div className="s">every deal in your view, screening to exit{scopedRestricted ? ` · ${scopedRestricted} restricted to status only` : ''}</div></div>
              <div className="rpt-kpi"><div className="v">{scopedInDD}</div><div className="l">In diligence</div></div>
              <div className="rpt-kpi"><div className="v">{scopedReadiness}%</div><div className="l">Avg IC readiness (pre-IC deals)</div></div>
              <div className="rpt-kpi"><div className="v">{money(pipelineValue)}</div><div className="l">Pipeline value</div><div className="s">{preCompletion.length} pre-completion{excludedHoldings ? ` · excludes ${excludedHoldings} owned or exiting` : ''}</div></div>
              <div className="rpt-kpi"><div className="v">{comps.length}</div><div className="l">Comparables</div></div>
              <div className="rpt-kpi"><div className="v">{precedents.length}</div><div className="l">IC precedents</div></div>
            </div>
          </section>

          {pipeline?.funnel?.length ? (
            <section className="rpt-section">
              <h2 className="rpt-h">Origination funnel <span className="rpt-mut">within your access</span></h2>
              <div className="rpt-funnel">
                {pipeline.funnel.map((f) => (
                  <div key={f.key} className="rpt-fstep"><div className="c">{f.count == null ? '—' : f.count}</div><div className="fl">{f.label}</div></div>
                ))}
              </div>
              {/* The sourcing screen carried this caveat and the report did not, so the one
                  page an LP is invited to certify was the one page that showed "Screened —"
                  with no explanation, beside a table whose Status column says Screened. */}
              {(pipeline as any).funnelNote ? <p className="rpt-note">{(pipeline as any).funnelNote}</p> : null}
            </section>
          ) : null}

          <section className="rpt-section">
            {/* Headed "Deals in flight", which is the name of a page that shows a smaller
                set — this table also lists deals still in screening. Two different counts
                under one name is how a reader stops trusting either. Name what it is. */}
            <h2 className="rpt-h">Every deal you can see <span className="rpt-mut">{deals.length} records · screening, pipeline and transactions not yet onboarded to portfolio reporting</span></h2>
            {deals.length === 0 ? (
              <p className="rpt-note">No deals are live yet. Sourced candidates that pass screening appear here.</p>
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
                      <td>{STATUS_TEXT[String(d.status || '')] || d.status || '—'}</td>
                      {/* A deal this reader is not on is masked on the deal list and was
                          printed in full here -- company, sector, stage, readiness and EV --
                          on the one page in the product with a Certify for LP use button. */}
                      <td className="num">{(d as any).locked ? 'Restricted' : isPostIC(d.status) ? 'Approved' : `${d.readiness ?? 0}%`}</td>
                      {/* dealSize is stored in millions. The two other call sites in this file
                          already scale it; this one did not, so an $380M deal printed as "$380"
                          in a table headed Size, four lines under a KPI tile reading $8.1B. */}
                      <td className="num">{(d as any).locked || d.dealSize == null ? '—' : money((d.dealSize || 0) * 1e6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      <section className="rpt-section">
        <h2 className="rpt-h">Source &amp; methodology <span className="rpt-mut">lineage for every headline metric</span></h2>
        <table className="rpt-table">
          <thead>
            <tr><th>Metric</th><th>Value</th><th>Source</th><th>As-of</th><th>Methodology</th></tr>
          </thead>
          <tbody>
            {lineage.map((l) => (
              <tr key={l.metric}>
                <td className="co">{l.metric}</td>
                <td>{l.value}</td>
                <td>{l.source}</td>
                <td>{l.asOf}</td>
                <td>{l.method}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="rpt-note">Every figure above traces to a source system and as-of date. {currentCert ? `Certified for LP distribution on ${new Date(currentCert.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} by ${currentCert.by}.` : 'This package has not been certified — certify it above before sending it to an LP.'} {fabric?.mode === 'live' ? 'External market sources are live and within SLA.' : 'External market sources are seeded, not live.'}</p>
      </section>

      <footer className="rpt-foot">
        Generated from the live Deal Room · {fabric?.mode === 'live' ? 'market intel: live' : 'market intel: sample data'} · CONFIDENTIAL
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
.rpt-mode { display: inline-block; padding: 1px 8px; border-radius: 999px; font-weight: 700; font-size: 11px; }
.rpt-mode.ok { color: #0a6; background: rgba(0,170,102,.14); }
.rpt-mode.warn { color: #b26a00; background: rgba(221,136,0,.16); }
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

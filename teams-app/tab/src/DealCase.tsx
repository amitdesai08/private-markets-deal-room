// THE CASE — the page a committee member reads once, cold, before voting.
//
// An IC member opened a deal an hour before the committee sat, went looking for the
// recommendation, and found the memo section stored as an empty string with value
// creation beside it, also empty. Their words: "I am asked to approve $240M against a
// thesis paragraph." Everything a vote needs was in the product and none of it was on
// one screen: the ask on the returns page, the three things that could kill it on the
// register, the state on the readiness board.
//
// So the server composes one from the record and this renders it. Two rules hold the
// whole page up:
//   1. It never pretends to be the analyst's memo. The strapline says it is composed
//      and that nobody has approved it, at the top, before the numbers.
//   2. Every figure carries its basis, including the awkward ones — where no EBITDA has
//      been diligenced it says the multiple rests on a screening default. A committee
//      voting on a multiple is entitled to know the denominator was assumed.
import { useEffect, useState } from 'react';
import { af } from './authFetch';

type Any = Record<string, any>;

const SEV_CLASS: Record<string, string> = {
  stopper: 'dc-sev stopper',
  reprice: 'dc-sev reprice',
  condition: 'dc-sev condition',
};

export default function DealCase({ dealId, onGoTab }: { dealId: string; onGoTab?: (t: string) => void }) {
  const [c, setC] = useState<Any | null>(null);
  const [settled, setSettled] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setSettled(false);
    setFailed(false);
    af(`/api/deals/${dealId}/case`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((v) => { if (live) { setC(v); setSettled(true); } })
      // An empty screen after a failed request and an empty screen because there is
      // nothing to say look identical, and only one of them is the product's fault.
      .catch(() => { if (live) { setFailed(true); setSettled(true); } });
    return () => { live = false; };
  }, [dealId]);

  if (!settled) return <div className="dd-panel muted">Loading the case…</div>;
  if (failed || !c) return <div className="dd-panel muted">The case could not be loaded. The deal's returns, register and readiness pages are unaffected.</div>;

  return (
    <div className="dc-wrap">
      <style>{CSS}</style>

      <div className="dc-note">
        {c.composedNote}
      </div>

      {c.recommendation && (
        <section className="dc-card dc-call">
          <div className="dc-callhead">{c.recommendation.call}</div>
          <div className="dc-because">{c.recommendation.because}</div>
          {c.readiness?.headline ? <div className="dc-ready">{c.readiness.headline}</div> : null}
        </section>
      )}

      {/* The analyst's own words, beside the composed reading rather than replaced by
          it. Where the two disagree the page says which and why, because on one deal an
          approved memo claimed nothing was unresolved while the register listed three
          open conditions, and the product held that conflict and buried it. */}
      {c.writtenRecommendation && (
        <section className="dc-card">
          <div className="dc-h">What the deal team wrote</div>
          <div className="dc-pt">{c.writtenRecommendation.text}</div>
          <div className="dc-basis">{c.writtenRecommendation.length} characters, {String(c.writtenRecommendation.status || '').replace(/_/g, ' ')}.</div>
          {c.writtenRecommendation.conflict ? <div className="dc-conflict">{c.writtenRecommendation.conflict}</div> : null}
        </section>
      )}

      {c.ask && (
        <section className="dc-card">
          <div className="dc-h">{c.decided ? 'What was authorised' : 'What you are being asked to authorise'}</div>
          <div className="dc-ask">{c.ask.headline}</div>
          {c.ask.equityNote ? <div className="dc-basis">{c.ask.equityNote}</div> : null}
        </section>
      )}

      {!!(c.forIt || []).length && (
        <section className="dc-card">
          <div className="dc-h">The case for it</div>
          {c.forIt.map((p: Any, i: number) => (
            <div key={i} className="dc-point">
              <div className="dc-pt">{p.point}</div>
              <div className="dc-basis">{p.basis}</div>
            </div>
          ))}
        </section>
      )}

      {/* The downside is on the page whether or not it flatters the case. A committee
          shown a downside only when it holds is not being shown a downside. */}
      {c.downside && (
        <section className="dc-card">
          <div className="dc-h">The downside</div>
          <div className={`dc-pt${c.downside.clearsHurdle ? '' : ' dc-fail'}`}>{c.downside.text}</div>
          <div className="dc-basis">{c.downside.basis}</div>
        </section>
      )}

      <section className="dc-card">
        {/* Three, not fifteen. A committee handed every monitor alongside the stopper
            has been given a list rather than a case, and reads neither. */}
        <div className="dc-h">What could kill it</div>
        {(c.againstIt || []).length ? c.againstIt.map((r: Any, i: number) => (
          <div key={i} className="dc-point">
            <div className="dc-pt">
              <span className={SEV_CLASS[r.severity] || 'dc-sev'}>{r.severityLabel}</span>
              {r.risk}
            </div>
            <div className="dc-basis">
              {r.workstream}{r.owner ? ` · ${r.owner}` : ''}{r.likelihood ? ` · ${r.likelihood} likelihood` : ''}
              {r.mitigation ? <> — {r.mitigation}</> : null}
            </div>
            {/* Whether anybody actually looked. Dropping this field let a standard row
                reading "cyber posture is adequate" pass for a finding. */}
            {r.basisNote ? <div className="dc-basis dc-templated">{r.basisNote}</div> : null}
          </div>
        )) : <div className="muted">Nothing on the register above a monitor.</div>}
      </section>

      {!!(c.figures || []).length && (
        <section className="dc-card">
          <div className="dc-h">The figures, and where each comes from</div>
          <div className="dc-figs">
            {c.figures.map((f: Any, i: number) => (
              <div key={i} className="dc-fig">
                <div className="dc-figv"><b>{f.value}</b> {f.label}</div>
                <div className="dc-basis">{f.basis}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!!(c.conditions || []).length && (
        <section className="dc-card">
          <div className="dc-h">Conditions to satisfy before signing</div>
          {c.conditions.map((x: Any, i: number) => (
            <div key={i} className="dc-point">
              <div className="dc-pt">{x.condition}</div>
              <div className="dc-basis">{x.workstream}{x.owner ? ` · ${x.owner}` : ''}</div>
            </div>
          ))}
        </section>
      )}

      {!!(c.notOnRecord || []).length && (
        <section className="dc-card dc-gaps">
          {/* A reader who cannot see the gap assumes there isn't one, and the papers
              most often missing are the ones a vote turns on. */}
          <div className="dc-h">What is not on the record</div>
          <ul>{c.notOnRecord.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>
        </section>
      )}

      {!!(c.checkAgainst || []).length && onGoTab && (
        <div className="dc-check">
          Check it against{' '}
          {c.checkAgainst.map((x: Any, i: number) => (
            <span key={x.path}>
              {i ? ' · ' : ''}
              <button className="dc-link" onClick={() => onGoTab(TAB_FOR[x.path] || x.path)}>{x.label}</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// The server names the destination in the product's own words; the tab keys are the
// code's. Mapping here keeps the composition free of the front end's internal names.
const TAB_FOR: Record<string, string> = {
  returns: 'artifacts',
  'risk-register': 'artifacts',
  'ic-readiness': 'ic',
  comparables: 'research',
  documents: 'docdesk',
};

const CSS = `
.dc-wrap { display: flex; flex-direction: column; gap: 12px; }
.dc-note { font-size: 12px; color: var(--muted, #6b7280); border-left: 3px solid var(--line, #e5e7eb); padding: 4px 0 4px 10px; }
.dc-card { border: 1px solid var(--line, #e5e7eb); border-radius: 10px; padding: 14px 16px; background: var(--card, #fff); }
.dc-h { font-weight: 700; font-size: 13px; margin-bottom: 10px; }
.dc-call { border-width: 2px; }
.dc-callhead { font-weight: 800; font-size: 17px; letter-spacing: 0.2px; }
.dc-because { font-size: 13.5px; margin-top: 4px; }
.dc-ready { font-size: 12px; color: var(--muted, #6b7280); margin-top: 8px; }
.dc-ask { font-size: 14px; font-weight: 600; line-height: 1.45; }
.dc-point { padding: 8px 0; border-top: 1px solid var(--line, #f1f2f4); }
.dc-point:first-of-type { border-top: 0; padding-top: 0; }
.dc-pt { font-size: 13.5px; line-height: 1.45; }
.dc-basis { font-size: 12px; color: var(--muted, #6b7280); margin-top: 3px; line-height: 1.45; }
.dc-templated { font-style: italic; }
.dc-fail { color: #9a3412; font-weight: 600; }
.dc-conflict { margin-top: 8px; font-size: 12.5px; line-height: 1.5; padding: 8px 10px; border-radius: 6px; background: #fff7ed; color: #9a3412; }
.dc-sev { display: inline-block; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; padding: 1px 6px; border-radius: 4px; margin-right: 7px; background: #eef0f3; color: #374151; vertical-align: 1px; }
.dc-sev.stopper { background: #fee2e2; color: #991b1b; }
.dc-sev.reprice { background: #ffedd5; color: #9a3412; }
.dc-sev.condition { background: #e0e7ff; color: #3730a3; }
.dc-figs { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
.dc-fig { min-width: 0; }
.dc-figv { font-size: 13.5px; }
.dc-gaps ul { margin: 0; padding-left: 18px; }
.dc-gaps li { font-size: 12.5px; line-height: 1.5; margin-bottom: 4px; }
.dc-check { font-size: 12px; color: var(--muted, #6b7280); }
.dc-link { background: none; border: 0; padding: 0; font: inherit; color: var(--accent, #4f46e5); cursor: pointer; text-decoration: underline; }
`;

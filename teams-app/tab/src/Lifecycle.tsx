// The "Lifecycle" tab: renders the full institutional PE deal lifecycle (3 phases,
// 15 stages, 6 decision gates) from GET /api/lifecycle, with each stage's owner
// persona and the artifacts it produces. Purely presentational — the model lives in
// app/data/flow.js (LIFECYCLE / LIFECYCLE_PHASES / LIFECYCLE_GATES).
import { useEffect, useState } from 'react';

type Stage = {
  num: number; phase: string; id: string; kind: 'stage' | 'gate'; name: string;
  owner: string; personas: string[]; summary: string; produces: string[];
};
type Phase = { id: string; num: number; name: string; tagline: string; accent: string; stages: Stage[] };
type LifecycleData = { phases: Phase[]; gates: string[] };

const OWNER_LABEL: Record<string, string> = {
  analyst: 'Analyst', partner: 'Partner', principal: 'Principal',
  'retail-md': 'Retail MD', 'ai-md': 'AI MD', 'supply-md': 'Supply MD',
  'operating-partner': 'Operating Partner', 'fund-cfo': 'Fund CFO',
  'legal-gc': 'General Counsel', 'ir-lp': 'Investor Relations',
};
const ownerLabel = (id: string) => OWNER_LABEL[id] || id;

export default function Lifecycle() {
  const [data, setData] = useState<LifecycleData | null>(null);

  useEffect(() => {
    fetch('/api/lifecycle').then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
  }, []);

  if (!data) return <div className="lc-wrap"><style>{CSS}</style><p className="lc-empty">Loading the deal lifecycle…</p></div>;

  return (
    <div className="lc-wrap">
      <style>{CSS}</style>
      <div className="lc-head">
        <h2>PE deal lifecycle</h2>
        <p>The full institutional process — {data.phases.reduce((n, p) => n + p.stages.length, 0)} stages across {data.phases.length} phases, with {data.gates.length} decision gates (⛔) where capital &amp; resources are committed.</p>
      </div>
      {data.phases.map((ph) => (
        <section key={ph.id} className="lc-phase">
          <header className="lc-phase-h" style={{ borderColor: ph.accent }}>
            <span className="lc-phase-n" style={{ background: ph.accent }}>{ph.num}</span>
            <div><div className="lc-phase-t">{ph.name}</div><div className="lc-phase-s">{ph.tagline}</div></div>
          </header>
          <div className="lc-stages">
            {ph.stages.map((s) => (
              <article key={s.id} className={`lc-stage${s.kind === 'gate' ? ' gate' : ''}`}>
                <div className="lc-stage-top">
                  <span className="lc-num">{s.num}</span>
                  <span className="lc-name">{s.name}</span>
                  {s.kind === 'gate' ? <span className="lc-gate" title="Decision gate">⛔ gate</span> : null}
                </div>
                <p className="lc-sum">{s.summary}</p>
                <div className="lc-meta">
                  <span className="lc-owner" title="Accountable owner">👤 {ownerLabel(s.owner)}</span>
                  {s.produces.slice(0, 3).map((p) => <span key={p} className="lc-chip">{p}</span>)}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const CSS = `
.lc-wrap { padding: 18px 20px 40px; max-width: 1100px; }
.lc-head h2 { margin: 0 0 4px; font-size: 20px; }
.lc-head p { margin: 0 0 18px; color: var(--muted); font-size: 13px; }
.lc-empty { color: var(--muted); }
.lc-phase { margin-bottom: 26px; }
.lc-phase-h { display: flex; align-items: center; gap: 12px; border-left: 4px solid; padding: 4px 0 4px 12px; margin-bottom: 12px; }
.lc-phase-n { width: 26px; height: 26px; border-radius: 7px; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 14px; }
.lc-phase-t { font-weight: 700; font-size: 15px; }
.lc-phase-s { color: var(--muted); font-size: 12px; }
.lc-stages { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.lc-stage { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 13px 14px; }
.lc-stage.gate { border-color: #c2410c66; box-shadow: inset 3px 0 0 #c2410c; }
.lc-stage-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.lc-num { width: 22px; height: 22px; border-radius: 999px; background: var(--chip); display: grid; place-items: center; font-size: 12px; font-weight: 700; flex: 0 0 auto; }
.lc-name { font-weight: 700; font-size: 14px; }
.lc-gate { margin-left: auto; font-size: 11px; font-weight: 700; color: #c2410c; white-space: nowrap; }
.lc-sum { margin: 0 0 10px; font-size: 12.5px; color: var(--fg); line-height: 1.5; opacity: .9; }
.lc-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.lc-owner { font-size: 11px; font-weight: 600; background: var(--chip); padding: 3px 8px; border-radius: 999px; }
.lc-chip { font-size: 11px; color: var(--muted); border: 1px solid var(--border); padding: 3px 8px; border-radius: 999px; }
`;

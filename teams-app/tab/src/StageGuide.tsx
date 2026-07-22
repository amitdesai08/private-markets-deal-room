import { useEffect, useState } from 'react';

type Step = { key: string; stage: string; title: string; what: string; agent: string; owner: string; produces: string[]; isGate?: boolean };

// Collapsible "How this stage works" — the descriptive process steps for one stage,
// embedded per-stage so each stage leads with real deal data (this replaces the
// standalone Lifecycle tab). Collapsed by default.
export default function StageGuide({ stage }: { stage: string }) {
  const [steps, setSteps] = useState<Step[]>([]);
  useEffect(() => {
    fetch('/api/flow').then((r) => (r.ok ? r.json() : null)).then((f) => {
      if (f?.steps) setSteps(f.steps.filter((s: Step) => s.stage === stage));
    }).catch(() => {});
  }, [stage]);
  if (!steps.length) return null;
  return (
    <details className="sg">
      <style>{CSS}</style>
      <summary>How this stage works<span className="sg-count">{steps.length} steps</span></summary>
      <ol className="sg-list">
        {steps.map((s) => (
          <li key={s.key} className={`sg-item${s.isGate ? ' gate' : ''}`}>
            <div className="sg-t">{s.title}{s.isGate ? <span className="sg-gate">gate</span> : null}</div>
            <div className="sg-w">{s.what}</div>
            <div className="sg-m">👤 {s.owner} · 🤖 {s.agent}</div>
          </li>
        ))}
      </ol>
    </details>
  );
}

const CSS = `
.sg { margin-top: 14px; border: 1px solid var(--border, #2a2a35); border-radius: 10px; background: var(--card, #1b1b22); }
.sg > summary { cursor: pointer; list-style: none; padding: 10px 14px; font-size: 12.5px; font-weight: 600; color: var(--muted); display: flex; align-items: center; gap: 8px; }
.sg > summary::-webkit-details-marker { display: none; }
.sg > summary::before { content: '▸'; font-size: 11px; }
.sg[open] > summary::before { content: '▾'; }
.sg-count { font-size: 11px; font-weight: 400; background: rgba(140,140,150,.16); border-radius: 999px; padding: 0 7px; }
.sg-list { margin: 0; padding: 0 16px 12px 34px; display: flex; flex-direction: column; gap: 10px; }
.sg-item { font-size: 12px; }
.sg-item.gate .sg-t { color: #34d399; }
.sg-t { font-weight: 600; font-size: 12.5px; color: var(--fg); display: flex; align-items: center; gap: 8px; }
.sg-gate { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #34d399; border: 1px solid rgba(52,211,153,.4); border-radius: 4px; padding: 0 5px; }
.sg-w { color: var(--muted); line-height: 1.45; margin: 2px 0; }
.sg-m { color: var(--muted); font-size: 11.5px; opacity: .85; }
`;

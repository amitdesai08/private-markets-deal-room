import { useEffect, useState } from 'react';
import type { Deal } from './types';

// Native Stage 3 — Execution & Closing. Picks up after the IC gate: it shows the
// four execution steps (financing → signing → closing → handover) from the shared
// flow model, plus a focused roster of any deals currently in execution (opening the
// full Deal Workspace via DealDetail). Complements the read-only Lifecycle tab with an
// actionable, phase-focused view.

type Step = {
  key: string; stage: string; title: string; what: string; agent: string;
  owner: string; produces: string[]; isGate?: boolean;
};

const money = (n?: number) => (n == null ? '—' : n >= 1000 ? `$${(n / 1000).toFixed(1)}B` : `$${n}M`);

export default function Stage3({ deals, onOpen, onAsk }: { deals: Deal[]; onOpen: (id: string) => void; onAsk: (id: string) => void }) {
  const [steps, setSteps] = useState<Step[]>([]);
  useEffect(() => {
    fetch('/api/flow').then((r) => (r.ok ? r.json() : null)).then((f) => {
      if (f?.steps) setSteps(f.steps.filter((s: Step) => s.stage === 'execution'));
    }).catch(() => {});
  }, []);

  const inExecution = (deals || []).filter((d) => {
    const st = String((d as any).stage || '').toUpperCase();
    const name = String((d as any).stageName || '');
    const status = String((d as any).status || '').toLowerCase();
    return st.startsWith('E') || /execution|closing|signing|financing|complet/i.test(name) || ['approved', 'signed', 'closing', 'closed'].includes(status);
  });

  return (
    <div className="stage3">
      <style>{CSS}</style>
      <section className="panel">
        <div className="panel-h">Execution &amp; Closing<span className="muted">IC approval → close → handover</span></div>
        <div className="s3-steps">
          {steps.map((s, i) => (
            <article key={s.key} className={`s3-step${s.isGate ? ' gate' : ''}`}>
              <div className="s3-top">
                <span className="s3-num">{i + 1}</span>
                <span className="s3-title">{s.title}</span>
                {s.isGate ? <span className="s3-gate" title="Decision / execution gate">⛳ gate</span> : null}
              </div>
              <p className="s3-what">{s.what}</p>
              <div className="s3-meta">
                <span className="s3-owner" title="Owner">👤 {s.owner}</span>
                <span className="s3-agent" title="Agent">🤖 {s.agent}</span>
              </div>
              <div className="s3-produces">{(s.produces || []).slice(0, 3).map((p) => <span key={p} className="s3-chip">{p}</span>)}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">Deals in execution<span className="muted">{inExecution.length} deal{inExecution.length === 1 ? '' : 's'} post-IC</span></div>
        {!inExecution.length ? (
          <div className="empty-panel">No deals in execution yet. Approve a deal at the Investment Committee gate (Stage 2) to move it into financing, signing &amp; closing here.</div>
        ) : (
          <div className="deals">
            {inExecution.map((d) => {
              return (
                <div className="dealcard" key={d.id} onClick={() => onOpen(d.id)} style={{ cursor: 'pointer' }}>
                  <div className="dc-top">
                    <span className="dc-co">{(d as any).company}</span>
                    <span className="dc-size">{money((d as any).dealSize)}</span>
                  </div>
                  <div className="dc-meta">{[(d as any).sector, (d as any).stageName || (d as any).stage].filter(Boolean).join(' · ')}</div>
                  <div className="dc-foot">
                    <span className="muted">{(d as any).stageName || 'In execution'}</span>
                    <button className="askbtn" onClick={(e) => { e.stopPropagation(); onAsk(d.id); }}>Ask ▸</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const CSS = `
.stage3 .s3-steps { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.s3-step { border: 1px solid var(--border, #2a2a35); border-radius: 10px; padding: 12px 14px; background: var(--card, #1b1b22); }
.s3-step.gate { border-color: rgba(5,150,105,.5); }
.s3-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.s3-num { width: 22px; height: 22px; border-radius: 50%; background: #059669; color: #fff; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }
.s3-title { font-weight: 600; font-size: 13.5px; }
.s3-gate { margin-left: auto; font-size: 11px; color: #34d399; }
.s3-what { margin: 0 0 8px; font-size: 12px; color: var(--muted); line-height: 1.45; }
.s3-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11.5px; color: var(--muted); margin-bottom: 8px; }
.s3-produces { display: flex; flex-wrap: wrap; gap: 5px; }
.s3-chip { font-size: 11px; color: var(--fg); border: 1px solid var(--border, #33333f); border-radius: 999px; padding: 1px 8px; }
`;

import { useEffect, useState } from 'react';
import type { Deal } from './types';

// Native Stage 4 — Value Creation & Exit. The ownership phase: it shows the three
// ownership steps (value creation → monitoring → exit) from the shared flow model,
// plus a roster of portfolio companies the fund now owns / is exiting (opening the
// full workspace via DealDetail). Complements the fund-level Fund & Portfolio tab.

type Step = {
  key: string; stage: string; title: string; what: string; agent: string;
  owner: string; produces: string[]; isGate?: boolean;
};

const money = (n?: number) => (n == null ? '—' : n >= 1000 ? `$${(n / 1000).toFixed(1)}B` : `$${n}M`);

export default function Stage4({ deals, onOpen, onAsk }: { deals: Deal[]; onOpen: (id: string) => void; onAsk: (id: string) => void }) {
  const [steps, setSteps] = useState<Step[]>([]);
  useEffect(() => {
    fetch('/api/flow').then((r) => (r.ok ? r.json() : null)).then((f) => {
      if (f?.steps) setSteps(f.steps.filter((s: Step) => s.stage === 'ownership'));
    }).catch(() => {});
  }, []);

  const owned = (deals || []).filter((d) => {
    const st = String((d as any).stage || '').toUpperCase();
    const name = String((d as any).stageName || '');
    const status = String((d as any).status || '').toLowerCase();
    return st.startsWith('V') || /value creation|monitoring|ownership|exit/i.test(name) || ['owned', 'monitoring', 'exiting', 'exited'].includes(status);
  });

  return (
    <div className="stage4">
      <style>{CSS}</style>
      <section className="panel">
        <div className="panel-h">Value Creation &amp; Exit<span className="muted">own · grow · realise</span></div>
        <div className="s4-steps">
          {steps.map((s, i) => (
            <article key={s.key} className={`s4-step${s.isGate ? ' gate' : ''}`}>
              <div className="s4-top">
                <span className="s4-num">{i + 1}</span>
                <span className="s4-title">{s.title}</span>
                {s.isGate ? <span className="s4-gate" title="Exit decision gate">⛳ gate</span> : null}
              </div>
              <p className="s4-what">{s.what}</p>
              <div className="s4-meta">
                <span title="Owner">👤 {s.owner}</span>
                <span title="Agent">🤖 {s.agent}</span>
              </div>
              <div className="s4-produces">{(s.produces || []).slice(0, 3).map((p) => <span key={p} className="s4-chip">{p}</span>)}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">Portfolio &amp; exits<span className="muted">{owned.length} compan{owned.length === 1 ? 'y' : 'ies'} owned / exiting</span></div>
        {!owned.length ? (
          <div className="empty-panel">No owned companies yet. Close a deal in Stage 3 to move it into value creation, monitoring &amp; exit here.</div>
        ) : (
          <div className="deals">
            {owned.map((d) => (
              <div className="dealcard" key={d.id} onClick={() => onOpen(d.id)} style={{ cursor: 'pointer' }}>
                <div className="dc-top">
                  <span className="dc-co">{(d as any).company}</span>
                  <span className="dc-size">{money((d as any).dealSize)}</span>
                </div>
                <div className="dc-meta">{[(d as any).sector, (d as any).stageName || (d as any).stage].filter(Boolean).join(' · ')}</div>
                <div className="dc-foot">
                  <span className="muted">{(d as any).stageName || 'In portfolio'}</span>
                  <button className="askbtn" onClick={(e) => { e.stopPropagation(); onAsk(d.id); }}>Ask ▸</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const CSS = `
.stage4 .s4-steps { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.s4-step { border: 1px solid var(--border, #2a2a35); border-radius: 10px; padding: 12px 14px; background: var(--card, #1b1b22); }
.s4-step.gate { border-color: rgba(124,58,237,.5); }
.s4-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.s4-num { width: 22px; height: 22px; border-radius: 50%; background: #7c3aed; color: #fff; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }
.s4-title { font-weight: 600; font-size: 13.5px; }
.s4-gate { margin-left: auto; font-size: 11px; color: #a78bfa; }
.s4-what { margin: 0 0 8px; font-size: 12px; color: var(--muted); line-height: 1.45; }
.s4-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11.5px; color: var(--muted); margin-bottom: 8px; }
.s4-produces { display: flex; flex-wrap: wrap; gap: 5px; }
.s4-chip { font-size: 11px; color: var(--fg); border: 1px solid var(--border, #33333f); border-radius: 999px; padding: 1px 8px; }
`;

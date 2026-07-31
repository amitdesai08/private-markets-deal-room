import type { Deal } from './types';
import StageGuide from './StageGuide';

// Native Stage 3 — Execution & Closing. Deal-centric, like Stages 1 & 2: a focused
// roster of the actual deals that cleared IC and are now in financing / signing /
// closing, each opening the full Deal Workspace. The process description is tucked
// into the collapsible "How this stage works" at the bottom.

type AnyDeal = Deal & {
  subSector?: string; hq?: string; currency?: string; stageName?: string; status?: string;
  thesis?: string; hoursSaved?: number;
  keyFigures?: { label: string; value: string }[];
  workstreams?: { lane: string; status?: string; progress?: number }[];
};

const dealMoney = (d: AnyDeal) => {
  const n = d.dealSize; if (n == null) return '—';
  const sym = d.currency === 'EUR' ? '€' : d.currency === 'GBP' ? '£' : '$';
  return `${sym}${n >= 1000 ? `${(n / 1000).toFixed(1)}B` : `${n}M`}`;
};
const STATUS_LABEL: Record<string, string> = { signed: 'SPA signed', closing: 'Closing', approved: 'IC approved', closed: 'Closed' };

export default function Stage3({ deals, onOpen, onAsk }: { deals: Deal[]; onOpen: (id: string) => void; onAsk: (id: string) => void }) {
  const inExecution = ((deals || []) as AnyDeal[]).filter((d) => {
    const st = String(d.stage || '').toUpperCase();
    const name = String(d.stageName || '');
    // Group by the STEP-derived stage only — `status` can drift from the actual step.
    return st.startsWith('E') || (d as any).stageId === 'execution' || /execution|closing|signing|financing/i.test(name);
  });

  return (
    <div className="stage3">
      <style>{CSS}</style>
      <section className="panel">
        <div className="panel-h">Execution &amp; Closing<span className="muted">{inExecution.length} deal{inExecution.length === 1 ? '' : 's'} in execution · financing → signing → close</span></div>
        {!inExecution.length ? (
          <div className="empty-panel">No deals in execution yet. Approve a deal at the Investment Committee gate (Stage 2) to move it into financing, signing &amp; closing here.</div>
        ) : (
          <div className="deals">
            {inExecution.map((d) => {
              const figs = (d.keyFigures || []).slice(0, 3);
              const lanes = d.workstreams || [];
              const done = lanes.filter((w) => w.status === 'complete').length;
              return (
                <div className="dealcard rich" key={d.id} onClick={() => onOpen(d.id)} role="button" tabIndex={0}>
                  <div className="dc-top">
                    <span className="dc-co">{d.company}</span>
                    <span className="dc-size">{dealMoney(d)}</span>
                  </div>
                  <div className="dc-meta">{[d.sector, d.subSector, d.hq].filter(Boolean).join(' · ')}</div>
                  <div className="dc-tags">
                    <span className="dc-pill exec">{d.stageName || d.stage}</span>
                    {d.status ? <span className="dc-st">{STATUS_LABEL[d.status] || d.status}</span> : null}
                  </div>
                  {figs.length ? <div className="dc-figs">{figs.map((f) => <span key={f.label} className="dc-fig"><b>{f.value}</b> {f.label}</span>)}</div> : null}
                  {d.thesis ? <p className="dc-thesis">{d.thesis.length > 180 ? `${d.thesis.slice(0, 180)}…` : d.thesis}</p> : null}
                  <div className="dc-foot">
                    {/* Lanes are stripped for readers who hold the deal at metadata level, so
                        an empty array means "withheld", not "none exist". Rendering "0/0"
                        would assert the deal has no diligence lanes at all. */}
                    <span className="muted">{lanes.length ? `${done}/${lanes.length} diligence lanes complete` : 'Lane detail not shown'}</span>
                    <button className="askbtn" onClick={(e) => { e.stopPropagation(); onAsk(d.id); }}>Ask ▸</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <StageGuide stage="execution" />
    </div>
  );
}

const CSS = `
.dealcard.rich { display: flex; flex-direction: column; gap: 7px; }
.dc-tags { display: flex; align-items: center; gap: 8px; }
.dc-pill { font-size: 11px; font-weight: 600; border-radius: 999px; padding: 2px 9px; }
.dc-pill.exec { color: var(--good); background: var(--good-bg); }
.dc-pill.own { color: var(--ai); background: var(--ai-bg); }
.dc-st { font-size: 11.5px; color: var(--muted); }
.dc-figs { display: flex; flex-wrap: wrap; gap: 14px; }
.dc-fig { font-size: 11.5px; color: var(--muted); }
.dc-fig b { color: var(--fg); font-size: 13px; margin-right: 3px; }
.dc-thesis { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.45; }
`;

import type { Deal } from './types';
import StageGuide from './StageGuide';

// Native Stage 4 — Value Creation & Exit. Deal-centric: a roster of the portfolio
// companies the fund now owns or is exiting, each opening the full workspace. The
// process description lives in the collapsible "How this stage works" at the bottom.

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
const STATUS_LABEL: Record<string, string> = { owned: 'Owned · value creation', monitoring: 'Monitoring', exiting: 'In exit', exited: 'Exited' };

export default function Stage4({ deals, onOpen, onAsk }: { deals: Deal[]; onOpen: (id: string) => void; onAsk: (id: string) => void }) {
  const owned = ((deals || []) as AnyDeal[]).filter((d) => {
    const st = String(d.stage || '').toUpperCase();
    const name = String(d.stageName || '');
    const status = String(d.status || '').toLowerCase();
    return st.startsWith('V') || /value creation|monitoring|ownership|exit/i.test(name) || ['owned', 'monitoring', 'exiting', 'exited'].includes(status);
  });

  return (
    <div className="stage4">
      <style>{CSS}</style>
      <section className="panel">
        <div className="panel-h">Value Creation &amp; Exit<span className="muted">{owned.length} compan{owned.length === 1 ? 'y' : 'ies'} owned / exiting · own → grow → realise</span></div>
        {!owned.length ? (
          <div className="empty-panel">No owned companies yet. Close a deal in Stage 3 to move it into value creation, monitoring &amp; exit here.</div>
        ) : (
          <div className="deals">
            {owned.map((d) => {
              const figs = (d.keyFigures || []).slice(0, 3);
              const lanes = d.workstreams || [];
              const avg = lanes.length ? Math.round(lanes.reduce((s, w) => s + (w.progress || 0), 0) / lanes.length) : 0;
              return (
                <div className="dealcard rich" key={d.id} onClick={() => onOpen(d.id)} role="button" tabIndex={0}>
                  <div className="dc-top">
                    <span className="dc-co">{d.company}</span>
                    <span className="dc-size">{dealMoney(d)}</span>
                  </div>
                  <div className="dc-meta">{[d.sector, d.subSector, d.hq].filter(Boolean).join(' · ')}</div>
                  <div className="dc-tags">
                    <span className="dc-pill own">{d.stageName || d.stage}</span>
                    {d.status ? <span className="dc-st">{STATUS_LABEL[d.status] || d.status}</span> : null}
                  </div>
                  {figs.length ? <div className="dc-figs">{figs.map((f) => <span key={f.label} className="dc-fig"><b>{f.value}</b> {f.label}</span>)}</div> : null}
                  {d.thesis ? <p className="dc-thesis">{d.thesis.length > 180 ? `${d.thesis.slice(0, 180)}…` : d.thesis}</p> : null}
                  <div className="dc-foot">
                    <span className="muted">Value-creation plan {avg}% executed</span>
                    <button className="askbtn" onClick={(e) => { e.stopPropagation(); onAsk(d.id); }}>Ask ▸</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <StageGuide stage="ownership" />
    </div>
  );
}

const CSS = `
.stage4 .dealcard.rich { display: flex; flex-direction: column; gap: 7px; }
.stage4 .dc-tags { display: flex; align-items: center; gap: 8px; }
.stage4 .dc-pill { font-size: 11px; font-weight: 600; border-radius: 999px; padding: 2px 9px; }
.stage4 .dc-pill.own { color: #a78bfa; background: rgba(124,58,237,.14); }
.stage4 .dc-st { font-size: 11.5px; color: var(--muted); }
.stage4 .dc-figs { display: flex; flex-wrap: wrap; gap: 14px; }
.stage4 .dc-fig { font-size: 11.5px; color: var(--muted); }
.stage4 .dc-fig b { color: var(--fg); font-size: 13px; margin-right: 3px; }
.stage4 .dc-thesis { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.45; }
`;

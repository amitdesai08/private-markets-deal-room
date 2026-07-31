import { useMemo, useState } from 'react';
import type { Deal } from './types';
import StageGuide from './StageGuide';

// ONE list of deals, filtered — replacing Stage 2 / Stage 3 / Stage 4, which were three
// tabs over the same collection differing only in a `stage.startsWith()` call. The stage
// is a property of a deal, not a place in the product: a partner asking "where is Nordic
// Grocery" had to know which tab it lived in before they could look for it.
//
// Every row renders the ENGINE's verdict and the engine's own gating sentence. It does not
// render a progress bar computed from a hand-typed lane percentage, which is what the three
// stage tabs did and why the same deal read differently depending on where you stood.

const money = (n?: number) => (n == null ? '—' : n >= 1000 ? `$${(n / 1000).toFixed(1)}B` : `$${n}M`);

type Filter = 'all' | 'diligence' | 'execution' | 'value' | 'attention';

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['attention', 'Needs attention'],
  ['diligence', 'Diligence'],
  ['execution', 'Execution'],
  ['value', 'Value & Exit'],
];

function stageBucket(d: any): Filter {
  const st = String(d.stage || '').toUpperCase();
  if (st.startsWith('E')) return 'execution';
  if (st.startsWith('V')) return 'value';
  if (st.startsWith('D')) return 'diligence';
  return 'all';
}

// The chip is the verdict, and the phase decides what the word means. "IC-ready" on a
// deal that signed six weeks ago would be nonsense, so a post-committee READY reads
// "In execution" — same state, honest label.
function chipFor(d: any): { tone: string; label: string } {
  const v = d.icVerdict;
  if (d.locked || d.accessLevel === 'status') return { tone: '', label: 'Status only' };
  if (!v) return { tone: '', label: '—' };
  const post = v.phase === 'post-committee';
  if (v.state === 'READY') return post ? { tone: 'good', label: 'In execution' } : { tone: 'good', label: 'IC-ready' };
  if (v.state === 'CONDITIONAL') return { tone: 'warn', label: 'Conditional' };
  if (v.phase === 'origination') return { tone: '', label: 'In origination' };
  return { tone: 'bad', label: 'Not IC-ready' };
}

function stepLabel(d: any): string {
  const stage = d.stageName || d.stageId || '';
  // Null step position is deliberate upstream: a screened deal has no position among the
  // diligence steps, and printing "step 0 of 5" for it was a small, confident lie.
  if (d.stageStepNumber == null || d.stageStepTotal == null) return stage;
  return `${stage} · step ${d.stageStepNumber} of ${d.stageStepTotal}`;
}

export default function Deals({ deals, onOpen, onAsk }: { deals: Deal[]; onOpen: (id: string) => void; onAsk: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const inFlight = useMemo(
    () => (deals || []).filter((d) => {
      const st = String((d as any).stage || '').toUpperCase();
      return st.startsWith('D') || st.startsWith('E') || st.startsWith('V');
    }),
    [deals],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inFlight.filter((d: any) => {
      if (needle && !`${d.company} ${d.sector || ''}`.toLowerCase().includes(needle)) return false;
      if (filter === 'all') return true;
      if (filter === 'attention') return d.icVerdict && (d.icVerdict.state === 'NOT-READY' || d.icVerdict.state === 'CONDITIONAL');
      return stageBucket(d) === filter;
    });
  }, [inFlight, filter, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: inFlight.length };
    for (const [k] of FILTERS) {
      if (k === 'all') continue;
      c[k] = inFlight.filter((d: any) => (k === 'attention'
        ? d.icVerdict && (d.icVerdict.state === 'NOT-READY' || d.icVerdict.state === 'CONDITIONAL')
        : stageBucket(d) === k)).length;
    }
    return c;
  }, [inFlight]);

  return (
    <div className="dealsview">
      <section className="panel">
        <div className="panel-h">
          Deals
          <span className="muted">{shown.length} of {inFlight.length}</span>
        </div>

        <div className="dv-controls">
          <div className="dv-filters">
            {FILTERS.map(([k, label]) => (
              <button key={k} className={`dv-filter${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>
                {label}<span className="dv-count">{counts[k] ?? 0}</span>
              </button>
            ))}
          </div>
          <input
            className="dv-search"
            placeholder="Find a deal…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Find a deal"
          />
        </div>

        {!shown.length ? (
          <div className="empty-panel">
            {inFlight.length ? <>No deal matches that. <button className="linkbtn" onClick={() => { setQ(''); setFilter('all'); }}>Clear the filter</button></> : 'No deals in flight yet. Pursue a candidate in Sourcing to launch one.'}
          </div>
        ) : (
          <div className="dv-rows">
            {shown.map((d: any) => {
              const chip = chipFor(d);
              const v = d.icVerdict;
              return (
                <div className="dv-row" key={d.id} onClick={() => onOpen(d.id)} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onOpen(d.id); }}>
                  <span className={`dv-chip ${chip.tone}`}>{chip.label}</span>
                  <span className="dv-name">{d.company}{d.locked ? ' 🔒' : ''}</span>
                  <span className="dv-stage">{stepLabel(d)}</span>
                  <span className="dv-why">
                    {d.locked
                      ? 'You are not on this deal team'
                      : v?.gating?.length
                        ? v.gating.join(' · ')
                        : v?.headline || '—'}
                  </span>
                  <span className="dv-size">{d.locked ? '' : money(d.dealSize)}</span>
                  <button className="askbtn" onClick={(e) => { e.stopPropagation(); onAsk(d.id); }}>Ask ▸</button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* The stage tools that used to justify a tab of their own, under the list they
          apply to rather than beside it. */}
      <StageGuide stage={filter === 'execution' ? 'execution' : filter === 'value' ? 'value' : 'diligence'} />
    </div>
  );
}

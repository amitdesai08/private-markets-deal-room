import { useMemo, useState } from 'react';
import type { Deal } from './types';
import CompareDeals, { CompareButton, useCompare } from './CompareDeals';
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
const OWNED_STATUS = new Set(['owned', 'exiting', 'exited']);

// One definition, used by both the filter and the chip count. They were written twice
// and had already drifted: the count included companies the fund already owns while the
// list excluded them, so the chip promised a number the page would not show. It also
// counted deals the reader cannot open — there is nothing you can do about a deal you
// are not on, so it does not belong in a list of things asking for your attention.
function needsAttention(d: any): boolean {
  if (d.locked || d.accessLevel === 'status') return false;
  if (OWNED_STATUS.has(String(d.status || '').toLowerCase())) return false;
  return !!d.icVerdict && (d.icVerdict.state === 'NOT-READY' || d.icVerdict.state === 'CONDITIONAL');
}

function chipFor(d: any): { tone: string; label: string } {
  const v = d.icVerdict;
  if (d.locked || d.accessLevel === 'status') return { tone: '', label: 'Status only' };
  // A company the fund already owns is not "In execution" and is not "Conditional"
  // because one diligence workstream has no write-up. The list is called Deals in
  // flight; the three post-completion records in it should say what they are, and the
  // daily briefing already gets this right ("a records gap, not outstanding work").
  const st = String(d.status || '').toLowerCase();
  if (st === 'exiting' || st === 'exited') return { tone: '', label: 'Exiting' };
  if (st === 'owned') return { tone: '', label: 'Owned' };
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
  //
  // The position WITHIN a phase is a third scale nobody asked for. The card said "step 3
  // of 5", the deal header two clicks later said "Step 7 of 16", and a VP triaging six
  // deals cannot quote either. One scale, the whole flow, everywhere.
  if (d.stepNumber != null && d.totalSteps != null) return `${stage} · step ${d.stepNumber} of ${d.totalSteps}`;
  if (d.stageStepNumber == null || d.stageStepTotal == null) return stage;
  return `${stage} · step ${d.stageStepNumber} of ${d.stageStepTotal}`;
}

export default function Deals({ deals, dealsLoading, onOpen, onAsk }: { deals: Deal[]; dealsLoading?: boolean; onOpen: (id: string) => void; onAsk: (id: string) => void }) {
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
    const out = inFlight.filter((d: any) => {
      if (needle && !`${d.company} ${d.sector || ''}`.toLowerCase().includes(needle)) return false;
      if (filter === 'all') return true;
      if (filter === 'attention') return needsAttention(d);
      return stageBucket(d) === filter;
    });
    // The list arrived in whatever order the record happened to be in, which asks a
    // partner with nineteen deals to hold nineteen IC dates in their head to find the
    // one that needs them this week. Soonest committee first. Deals already through
    // committee sort to the bottom -- they are not urgent, and sorting on how long ago
    // their IC was put a portfolio company approved three years back at the very top.
    const rank = (d: any) => {
      if (typeof d.daysToIC !== 'number') return 1e6;
      return d.daysToIC >= 0 ? d.daysToIC : 1e5 - d.daysToIC;
    };
    return out.sort((a: any, b: any) => {
      const r = rank(a) - rank(b);
      if (r) return r;
      return (b.dealSize || 0) - (a.dealSize || 0);
    });
  }, [inFlight, filter, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: inFlight.length };
    for (const [k] of FILTERS) {
      if (k === 'all') continue;
      c[k] = inFlight.filter((d: any) => (k === 'attention' ? needsAttention(d) : stageBucket(d) === k)).length;
    }
    return c;
  }, [inFlight]);

  const { compare, setCompare, toggle } = useCompare();

  return (
    <div className="dealsview">
      <section className="panel">
        <div className="panel-h">
          Deals
          {/* Home says 19, this list says 15 and the report says 19, and nothing on any
              of the three screens accounted for the four. They are screened deals that
              have not been launched into diligence, so they belong on Sourcing &
              screening -- but a reader counting deals needs to be told that here. */}
          <span className="muted">
            {shown.length} of {inFlight.length}
            {(deals || []).length > inFlight.length
              ? ` · ${(deals || []).length - inFlight.length} more still in screening — see Sourcing & screening`
              : ''}
          </span>
        </div>

        <div className="dv-controls">
          <div className="dv-filters">
            {/* A chip reading "Value & Exit 0" invites a click that empties the page and
                tells you nothing you did not already know from the zero. Keep it visible —
                the zero is itself a fact about the book — but stop it accepting the click. */}
            {FILTERS.map(([k, label]) => (
              <button
                key={k}
                className={`dv-filter${filter === k ? ' on' : ''}`}
                disabled={k !== 'all' && (counts[k] ?? 0) === 0}
                title={k !== 'all' && (counts[k] ?? 0) === 0 ? `No deals in ${label.toLowerCase()}` : undefined}
                onClick={() => setFilter(k)}
              >
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

        {/* Said out loud, because the button on each row is small and sits at the end.
            A partner spent ten minutes hunting every tab, the overflow menu and Settings
            for a way to put two deals side by side, and concluded the product could not
            do it. A capability nobody can find is a capability you did not build. */}
        <div className="muted" style={{ padding: '0 14px 10px', fontSize: 12.5 }}>
          {compare.length ? `${compare.length} picked to compare${compare.length < 2 ? ' — pick one more' : ''}` : 'Press + Compare on any two to four deals to put them side by side.'}
        </div>

        {!shown.length ? (
          <div className="empty-panel">
            {/* On a cold start this list is empty for the better part of twenty seconds
                and used to say, flatly, that the firm had no deals in flight. Somebody
                reading that on their first login reasonably concludes the sign-in failed. */}
            {dealsLoading && !(deals || []).length ? 'Loading your deals — about fifteen seconds the first time you open the window.'
              : inFlight.length ? <>No deal matches that. <button className="linkbtn" onClick={() => { setQ(''); setFilter('all'); }}>Clear the filter</button></>
              : 'No deals in flight yet. Pursue a candidate in Sourcing to launch one.'}
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
                  {/* Not the headline: on a diligence deal `headline` is this same list with
                      the state prefixed, and the chip has already said the state.

                      The elision is EXPLICIT. A CSS line-clamp hides text with no indication
                      that anything was hidden, which is how "2 required items outstanding:
                      Findings / red-flag report, KYC…" became a tooltip nobody opened. "+5
                      more" tells you the row is not the whole answer and the deal is. */}
                  <span className="dv-why">
                    {d.locked ? 'You are not on this deal team' : (() => {
                      const g: string[] = v?.gating || [];
                      if (!g.length) return v?.headline || '—';
                      const head = g.slice(0, 2).join(' · ');
                      return g.length > 2 ? <>{head} <span className="dv-more">+{g.length - 2} more</span></> : head;
                    })()}
                  </span>
                  {/* The row is now sorted by this, so it has to be readable on the row.
                      "IC in 9d" is the single fact that decides whether a partner opens
                      this deal today or next week. On a deal already through committee
                      it is not a fact anybody needs -- "IC was 1080d ago" on a portfolio
                      company is noise dressed as urgency -- so it says so instead. */}
                  <span className="dv-size">{d.locked ? '' : money(d.dealSize)}{!d.locked && typeof d.daysToIC === 'number' ? <span className="muted"> · {d.daysToIC > 0 ? `IC in ${d.daysToIC}d` : d.daysToIC === 0 ? 'IC today' : 'past IC'}</span> : null}</span>
                  {/* A restricted deal has nothing to compare -- size, readiness and status
                      are exactly what is being withheld -- so it does not offer the button. */}
                  {d.locked ? null : <CompareButton id={d.id} compare={compare} toggle={toggle} />}
                  <button className="askbtn" onClick={(e) => { e.stopPropagation(); onAsk(d.id); }}>Ask ▸</button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <CompareDeals deals={deals} compare={compare} onClear={() => setCompare([])} onOpen={onOpen} />

      {/* The stage tools that used to justify a tab of their own, under the list they
          apply to rather than beside it. */}
      <StageGuide stage={filter === 'execution' ? 'execution' : filter === 'value' ? 'value' : 'diligence'} />
    </div>
  );
}

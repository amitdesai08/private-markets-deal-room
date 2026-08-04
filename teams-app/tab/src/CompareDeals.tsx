import { useState } from 'react';
import { STATUS_TEXT, isPostIC } from './deskUi';
import type { Deal } from './types';

// Side-by-side comparison used to live only on the Home page, on a "+ Compare" button
// that sits on the seventh panel down. A partner asked to compare two deals went
// looking for it on Deals in flight -- which is where anyone would look, because that
// is the list of deals -- searched every tab, the overflow menu and Settings, gave up,
// and concluded the product could not do it. It can, and rather well. The capability
// now sits on both lists, off one shared definition so the two cannot drift.

const money = (n?: number) => (n == null ? '\u2014' : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : `$${Math.round(n / 1e6)}M`);

const priorityOf = (d: Deal) => {
  const r = d.readiness ?? 0;
  const days = typeof d.daysToIC === 'number' ? d.daysToIC : 999;
  if (isPostIC(d.status)) return { tag: 'Past committee', why: 'Approved at IC \u2014 advance execution and closing' };
  if (days <= 21 && r < 80) return { tag: 'Approaching IC', why: `IC in ${days}d but only ${r}% ready \u2014 close the diligence gaps first` };
  if (r < 40) return { tag: 'Early', why: `${r}% IC-ready \u2014 needs diligence to progress` };
  if (r >= 80) return { tag: 'IC-ready', why: `${r}% ready \u2014 nothing outstanding` };
  return { tag: 'On track', why: 'No IC date close and nothing flagged' };
};

export const CMP_ROWS: { label: string; get: (d: Deal) => string }[] = [
  { label: 'Stage', get: (d) => d.stageName || d.stage || '\u2014' },
  // Past the committee an IC-readiness percentage is a forecast of the past, and the
  // comparison table was the last screen still printing "58%" beside a company the
  // fund already owns.
  { label: 'IC readiness', get: (d) => (isPostIC(d.status) ? 'Approved at IC' : `${d.readiness ?? 0}%`) },
  { label: 'Days to IC', get: (d) => (isPostIC(d.status) ? '\u2014' : typeof d.daysToIC === 'number' ? (d.daysToIC >= 0 ? `${d.daysToIC}d` : 'past') : '\u2014') },
  { label: 'Deal size', get: (d) => money(d.dealSize ? d.dealSize * 1e6 : undefined) },
  // Everything above this line is process. A partner comparing four deals to decide
  // which one goes to committee said it plainly: "This tells me which is furthest
  // along. It does not tell me which is best." A comparison of investments with no
  // price, no leverage and no return in it is a project-management report. The figures
  // now travel on the deal summary, so the four columns cost nothing extra to fill.
  { label: 'LTM EBITDA', get: (d) => {
    const f = (d as any).figures; return f?.ebitda ? money(f.ebitda * 1e6) : '\u2014';
  } },
  { label: 'Entry multiple', get: (d) => {
    const f = (d as any).figures; return f?.entryMultiple ? `${f.entryMultiple}x EV/EBITDA` : '\u2014';
  } },
  { label: 'Leverage', get: (d) => {
    const f = (d as any).figures; return f?.leverage || '\u2014';
  } },
  { label: 'Base IRR / MOIC', get: (d) => {
    const f = (d as any).figures;
    return f && f.irr != null && f.moic != null ? `${f.irr}% / ${f.moic}x` : '\u2014';
  } },
  // Lumen is headquartered in Dublin and its diligence documents are written in euros,
  // while its header printed dollars. Nobody was told which one the table is in.
  { label: 'Reported in', get: (d) => (d as any).figures?.currencyCode || d.currency || '\u2014' },
  { label: 'Sector', get: (d) => d.sector || '\u2014' },
  // The raw key. A partner read "Status: in_diligence" in a comparison she was about
  // to paste into an email; underscores and lower case are how a database talks. The
  // named map covers the statuses we ship, but anything the record grows later must
  // not arrive on screen in its raw form, so humanise whatever is left over.
  { label: 'Status', get: (d) => {
    const raw = String(d.status || '');
    if (!raw) return '\u2014';
    const named = STATUS_TEXT[raw];
    if (named) return named;
    const words = raw.replace(/[_-]+/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  } },
  { label: 'Priority', get: (d) => priorityOf(d).tag },
  { label: 'Recommended action', get: (d) => priorityOf(d).why },
];

// Selection state, shared shape so both lists behave identically. Four is the point at
// which the columns stop being readable on a laptop.
export function useCompare() {
  const [compare, setCompare] = useState<string[]>([]);
  const toggle = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 4 ? c : [...c, id]));
  return { compare, setCompare, toggle };
}

export function CompareButton({ id, compare, toggle }: { id: string; compare: string[]; toggle: (id: string) => void }) {
  const on = compare.includes(id);
  const full = !on && compare.length >= 4;
  return (
    <button
      className={`comparebtn${on ? ' on' : ''}${full ? ' isoff' : ''}`}
      // aria-disabled, not disabled: picking the fourth deal would otherwise disable the
      // button a keyboard user is standing on and drop their focus to the top of the page.
      aria-disabled={full}
      title={on ? 'Remove from the comparison' : full ? 'You can compare up to four deals at once.' : 'Compare this deal with another \u2014 pick 2 to 4'}
      onClick={(e) => { e.stopPropagation(); if (!full) toggle(id); }}
    >{on ? '\u2713 Comparing' : '+ Compare'}</button>
  );
}

export default function CompareDeals({ deals, compare, onClear, onOpen }: {
  deals: Deal[]; compare: string[]; onClear: () => void; onOpen: (id: string) => void;
}) {
  const picked = compare.map((id) => deals.find((d) => d.id === id)).filter(Boolean) as Deal[];
  // Copying to the clipboard is invisible, so the button reports on itself for two
  // seconds. Without it the only way to know it worked was to go and paste.
  const [copied, setCopied] = useState(false);

  if (picked.length < 2) {
    if (!compare.length) return null;
    return (
      <section className="panel">
        <div className="panel-h"><span>Compare deals</span><span className="muted">1 picked — pick one more</span></div>
        <div className="empty-panel">Choose a second deal to put them side by side on the same decision fields.</div>
      </section>
    );
  }

  const copy = () => {
    const header = ['Field', ...picked.map((d) => d.company)].join('\t');
    const rows = CMP_ROWS.map((r) => [r.label, ...picked.map((d) => r.get(d))].join('\t'));
    navigator.clipboard?.writeText([header, ...rows].join('\n'))
      .then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  };

  const th: any = { textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border, #23232c)' };
  const td: any = { padding: '6px 10px', borderBottom: '1px solid var(--border, #1c1c24)' };

  return (
    <section className="panel">
      <div className="panel-h">
        <span>Compare deals</span>
        <span className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="askbtn" onClick={copy}>{copied ? '\u2713 Copied' : '\u29c9 Copy as text'}</button>
          <button className="askbtn" onClick={onClear}>Clear</button>
        </span>
      </div>
      <div style={{ overflowX: 'auto', padding: '4px 14px 14px' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ ...th, color: 'var(--muted)', fontWeight: 600 }}>Field</th>
              {picked.map((d) => (
                <th key={d.id} style={{ ...th, fontWeight: 700, cursor: 'pointer' }} onClick={() => onOpen(d.id)}>{d.company} {'\u2197'}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CMP_ROWS.map((r) => (
              <tr key={r.label}>
                {/* The readiness row showed a bare "100%" against a bare "65%" with
                    nothing to say what was being measured, and a partner will not read
                    two numbers out to a committee she cannot explain. */}
                <td style={{ ...td, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }} title={r.label === 'IC readiness' ? 'Weighted across required papers, workstream progress and open risks — not a count of the six required papers on the IC readiness board.' : undefined}>{r.label}</td>
                {picked.map((d) => (<td key={d.id} style={td}>{r.get(d)}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="muted" style={{ padding: '8px 10px', fontSize: 12 }}>IC readiness is weighted across required papers, workstream progress and open risks &mdash; it is not a count of the six required papers on a deal's IC readiness board. Entry multiple, leverage, IRR and MOIC are the base case from each deal's Returns, plan &amp; risk page; open a company name above for the scenarios behind them.</div>
      </div>
    </section>
  );
}

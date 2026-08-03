// Small shared pieces for the deal-desk surfaces (cockpit, workflow, threads,
// documents). They exist so the honesty rules of the design are enforced in ONE
// place rather than re-implemented per tab:
//
//   * an AI-generated narrative always renders its citations, and the citation
//     always resolves to a named source.

export type Para = { text: string; cites: number[] };

// These were "review tags" from the design mockup - `live today` / `extend` / `new`
// beside about fifteen card headings, so a partner read "What needs my attention
// extend" and "Portfolio briefing new". They were there to stop a DEMO implying that
// everything on screen already ships; in the product they are a statement about our
// roadmap printed next to the reader's headline, and the reader has no idea what
// "extend" means. The component stays (every call site still passes its `kind`, and
// the distinction is worth keeping in the source) but it renders nothing.
export function Tag({ kind: _kind }: { kind: 'live' | 'ext' | 'new' }) {
  return null;
}

// A cited narrative. Citations are real buttons: they are a drill-down control,
// so they have to be reachable by keyboard and announced as interactive.
export function Narrative({
  paragraphs, sources, onCite,
}: { paragraphs: Para[]; sources: string[]; onCite?: (n: number) => void }) {
  return (
    <div className="narr">
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.text}
          {p.cites.map((n) => (
            <cite key={n}>
              <button type="button" title={sources[n - 1] || 'source'}
                aria-label={`Source ${n}: ${sources[n - 1] || 'unknown'}`}
                onClick={() => onCite?.(n)}>{n}</button>
            </cite>
          ))}
        </p>
      ))}
    </div>
  );
}

export function SourceList({ sources }: { sources: string[] }) {
  if (!sources.length) return null;
  return (
    <div className="sub" style={{ marginTop: 8 }}>
      {sources.map((s, i) => (
        <div key={i}><cite>{i + 1}</cite> {s}</div>
      ))}
    </div>
  );
}

// Relative time that degrades to an absolute date rather than lying about
// precision we don't have.
export function ago(isoDate?: string | null): string {
  if (!isoDate) return '';
  const t = new Date(isoDate).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days <= 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function clock(isoDate?: string | null): string {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

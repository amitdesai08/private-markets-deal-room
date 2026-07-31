// Small shared pieces for the deal-desk surfaces (cockpit, workflow, threads,
// documents). They exist so the honesty rules of the design are enforced in ONE
// place rather than re-implemented per tab:
//
//   * an AI-generated narrative always renders its citations, and the citation
//     always resolves to a named source;
//   * a surface always declares whether it is shipping today, an extension of
//     something shipping, or net-new.

export type Para = { text: string; cites: number[] };

// What a card is, honestly. The mockup calls these "review tags" — they stop a
// demo from implying that everything on screen already exists in production.
export function Tag({ kind }: { kind: 'live' | 'ext' | 'new' }) {
  const label = kind === 'live' ? 'live today' : kind === 'ext' ? 'extend' : 'new';
  return <span className={`tag ${kind}`}>{label}</span>;
}

// A cited narrative. Clicking a citation reveals the source list rather than
// navigating away, so the reader never loses their place in the paragraph.
export function Narrative({
  paragraphs, sources, onCite,
}: { paragraphs: Para[]; sources: string[]; onCite?: (n: number) => void }) {
  return (
    <div className="narr">
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.text}
          {p.cites.map((n) => (
            <cite key={n} title={sources[n - 1] || 'source'} onClick={() => onCite?.(n)}>{n}</cite>
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

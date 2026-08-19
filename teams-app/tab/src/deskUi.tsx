// Small shared pieces for the deal-desk surfaces (cockpit, workflow, threads,
// documents). They exist so the honesty rules of the design are enforced in ONE
// place rather than re-implemented per tab:
//
//   * an AI-generated narrative always renders its citations, and the citation
//     always resolves to a named source.

export type Para = { text: string; cites: number[] };

// The deal `status` is a database enum. It was printed raw on the Home cards and in
// the LP report, so the same row read "Diligence & Approval" in one column and
// "in_diligence" in the next. It lives here rather than in either file because both
// need it and they must not drift apart -- one of them can be certified and sent to
// limited partners.
export const STATUS_TEXT: Record<string, string> = {
  sourced: 'Sourced', screened: 'Screened', shortlisted: 'Shortlisted',
  in_diligence: 'In diligence', ic_ready: 'IC ready', approved: 'Approved',
  signing: 'Signing', signed: 'Signed', closed: 'Closed', owned: 'Owned',
  exiting: 'Exiting', exited: 'Exited', passed: 'Passed', on_hold: 'On hold',
};

// Statuses that sit past the investment committee.
//
// "IC readiness" forecasts whether a deal can be taken to committee. Once it has been,
// the number is a forecast of the past: the product was printing "Owned - IC readiness
// 58%" and "Exiting - IC readiness 50%" on companies the fund already holds, and then
// averaging those into a headline that appears on the LP-facing report. Past the
// committee, report the outcome; average over the deals the average is about.
export const POST_IC = new Set(['approved', 'signing', 'signed', 'closed', 'owned', 'exiting', 'exited']);
export const isPostIC = (status: unknown) => POST_IC.has(String(status || ''));
export const readinessText = (d: { status?: unknown; readiness?: number | null }) =>
  isPostIC(d.status) ? 'Approved at IC' : `IC readiness ${d.readiness ?? 0}%`;

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

// A small, honest attribution for content that came from a real integration rather
// than the platform's own record — shown only where that is actually true, and only
// in demo mode (call sites gate on `demoMode`; this component does not, since it has
// no way to know the caller's context). The label names the SYSTEM the content came
// from, not "AI" — WorkIQ and M365 material is retrieved, not generated.
const POWERED_BY_LABEL: Record<string, string> = {
  workiq: 'Powered by WorkIQ',
  m365: 'Powered by Teams & SharePoint',
  web: 'Powered by live web search',
  fabric: 'Powered by Microsoft Fabric',
};
export function PoweredBy({ source }: { source: keyof typeof POWERED_BY_LABEL | string }) {
  return <span className="poweredby">{POWERED_BY_LABEL[source] || `Powered by ${source}`}</span>;
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

// Where a cited source actually lives, when it lives anywhere. Some sources are pages in
// this product and can be opened; others are records ("Teams message from David Osei") and
// cannot. Returning null for the second kind is the point — a link that goes nowhere is
// worse than plain text.
export function sourceTarget(source: string): string | null {
  const s = String(source || '').toLowerCase();
  if (/ic readiness|readiness board/.test(s)) return 'ic';
  if (/risk register|returns|value creation|plan & risk/.test(s)) return 'artifacts';
  if (/workstream|diligence lane|lane/.test(s)) return 'workspace';
  if (/teams message|channel|thread/.test(s)) return 'threads';
  if (/audit trail/.test(s)) return 'activity';
  if (/document|data room|memo|paper/.test(s)) return 'docdesk';
  if (/deal record|current step|target ic date|stage on the deal/.test(s)) return 'cockpit';
  return null;
}

export function SourceList({ sources, onOpen, showAccessModel = true }: { sources: string[]; onOpen?: (tab: string) => void; showAccessModel?: boolean }) {
  // "Access model — administrator" is a note about how visibility works. It belongs in a
  // demonstration of the product and not in a working citation list, where it is the one
  // line that cites nothing.
  const shown = sources.filter((s) => showAccessModel || !/^access model\b/i.test(String(s || '')));
  if (!shown.length) return null;
  return (
    <div className="sub" style={{ marginTop: 8 }}>
      {shown.map((s, i) => {
        const tab = onOpen ? sourceTarget(s) : null;
        return (
          <div key={i}>
            <cite>{i + 1}</cite>{' '}
            {tab ? <button className="srcbtn" onClick={() => onOpen?.(tab)}>{s}</button> : s}
          </div>
        );
      })}
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
  // Past a week, an absolute date. The locale default rendered US month-first ("Jul
  // 22") with no year, in a product where everything else says "22 Jul 2026" -- and a
  // document's modified date is exactly the field somebody checks when they suspect
  // they are reading a stale version.
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function clock(isoDate?: string | null): string {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

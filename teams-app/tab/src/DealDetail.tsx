import { useEffect, useState } from 'react';

// Native deal workspace (Station) — brings the webapp's deal detail into the Teams
// tab: key figures, IC-readiness board, diligence lanes and figure provenance, all
// from the shared backend (/api/deals/:id + /api/deals/:id/ic-readiness).

type KeyFigure = { label: string; value: string; source?: string; confidence?: string };
type Workstream = { lane: string; owner?: string; status?: string; progress?: number; findings?: unknown[] };
type DealFull = {
  id: string; company: string; sector?: string; subSector?: string; hq?: string;
  stage?: string; stageName?: string; status?: string; dealSize?: number; currency?: string;
  readiness?: number; daysToIC?: number; thesis?: string; keyFigures?: KeyFigure[]; workstreams?: Workstream[];
};
type Verdict = { state?: string; headline?: string; gating?: string[]; openConditions?: number };
type Artifact = { key: string; label: string; complete: boolean; detail?: string };
type ICReadiness = {
  verdict?: Verdict;
  requiredArtifacts?: { items?: Artifact[] };
  blockingWorkstreams?: unknown[];
  unresolvedRisks?: unknown[];
  icAsk?: Record<string, unknown>;
  counts?: Record<string, number>;
};

const LANE_LABEL: Record<string, string> = {
  commercial: 'Commercial', financial: 'Financial', legal: 'Legal', tax: 'Tax',
  techai: 'Tech / AI', operations: 'Operations', esg: 'ESG',
};
const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started', in_progress: 'In progress', complete: 'Complete', blocked: 'Blocked',
};
const VERDICT_CLASS: Record<string, string> = { 'READY': 'ok', 'CONDITIONAL': 'warn', 'NOT-READY': 'bad' };

// Figure provenance — spell out what a value is grounded in (addresses the
// "unclear what the SEC reported value refers to" feedback).
function sourceHint(src?: string): string {
  if (!src) return '';
  const s = src.toLowerCase();
  if (s.includes('10-k') || s.includes('10-q') || s.includes('8-k') || s.includes('sec') || s.includes('edgar') || s.includes('form d'))
    return 'As reported by the company in this SEC filing (as-filed figure, not modeled).';
  if (s.includes('screen')) return 'From the screening model (pre-diligence estimate).';
  if (s.includes('cim')) return 'From the confidential information memorandum.';
  return `Source: ${src}.`;
}

export default function DealDetail({ dealId, onClose, onAsk }: { dealId: string; onClose: () => void; onAsk: (id: string) => void }) {
  const [deal, setDeal] = useState<DealFull | null>(null);
  const [ic, setIc] = useState<ICReadiness | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true); setDeal(null); setIc(null);
    Promise.all([
      fetch(`/api/deals/${dealId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/deals/${dealId}/ic-readiness`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([d, i]) => { setDeal(d); setIc(i); setLoading(false); });
  }, [dealId]);

  const money = (n?: number) => (n == null ? '—' : n >= 1000 ? `$${(n / 1000).toFixed(1)}B` : `$${n}M`);
  const verdict = ic?.verdict;
  const artifacts = ic?.requiredArtifacts?.items || [];

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <button className="iconbtn" onClick={onClose} aria-label="Close">✕</button>
          <div className="drawer-title">{deal?.company || 'Loading…'}</div>
          <button className="askbtn" onClick={() => onAsk(dealId)}>💬 Ask agents</button>
        </div>

        {loading ? (
          <div className="drawer-body"><div className="muted">Loading deal workspace…</div></div>
        ) : !deal ? (
          <div className="drawer-body"><div className="muted">Deal not found.</div></div>
        ) : (
          <div className="drawer-body">
            <div className="dd-sub">{[deal.sector, deal.subSector, deal.hq].filter(Boolean).join(' · ')}</div>
            <div className="dd-meta">
              <span className="chip">{deal.stageName || deal.stage}</span>
              {deal.status ? <span className="chip">{deal.status}</span> : null}
              <span className="chip">{money(deal.dealSize)}</span>
              <span className="chip">IC readiness {deal.readiness ?? 0}%</span>
              {typeof deal.daysToIC === 'number' ? <span className="chip">IC in {deal.daysToIC}d</span> : null}
            </div>
            {deal.thesis ? <p className="dd-thesis">{deal.thesis}</p> : null}

            {/* IC readiness */}
            {verdict ? (
              <section className="dd-panel">
                <div className="dd-panel-h">IC readiness</div>
                <div className={`verdict ${VERDICT_CLASS[verdict.state || ''] || ''}`}>
                  <span className="verdict-state">{verdict.state}</span>
                  <span className="verdict-head">{verdict.headline}</span>
                </div>
                {artifacts.length ? (
                  <div className="dd-artifacts">
                    {artifacts.map((a) => (
                      <div key={a.key} className={`artifact ${a.complete ? 'done' : 'todo'}`}>
                        <span className="a-ic">{a.complete ? '✓' : '○'}</span>
                        <span className="a-label">{a.label}</span>
                        {a.detail ? <span className="a-detail">{a.detail}</span> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* Key figures with provenance */}
            {deal.keyFigures?.length ? (
              <section className="dd-panel">
                <div className="dd-panel-h">Key figures</div>
                <div className="dd-figs">
                  {deal.keyFigures.map((f, i) => (
                    <div className="dd-fig" key={i} title={sourceHint(f.source)}>
                      <div className="fig-v">{f.value}</div>
                      <div className="fig-l">{f.label}</div>
                      {f.source ? <div className="fig-src">source: {f.source}{f.confidence ? ` · ${f.confidence} confidence` : ''}</div> : null}
                    </div>
                  ))}
                </div>
                <div className="dd-note">Hover a figure to see its provenance. Figures marked with an SEC form are the values the company reported in that filing (as-filed, not modeled).</div>
              </section>
            ) : null}

            {/* Diligence lanes */}
            {deal.workstreams?.length ? (
              <section className="dd-panel">
                <div className="dd-panel-h">Diligence lanes</div>
                <div className="dd-lanes">
                  {deal.workstreams.map((w, i) => (
                    <div className="dd-lane" key={i}>
                      <div className="lane-top">
                        <span className="lane-name">{LANE_LABEL[w.lane] || w.lane}</span>
                        <span className="lane-status">{STATUS_LABEL[w.status || ''] || w.status || '—'}</span>
                      </div>
                      <div className="lane-bar"><span style={{ width: `${Math.max(0, Math.min(100, w.progress ?? 0))}%` }} /></div>
                      <div className="lane-owner">{w.owner || 'unassigned'}{w.findings?.length ? ` · ${w.findings.length} finding(s)` : ''}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </aside>
    </div>
  );
}

import type { DealSummary } from '../types';
import { CohortDesk } from './CohortDesk';

interface Props {
  deals: DealSummary[];
  launchingId: string | null;
  onChanged: () => void;
  onLaunch: (id: string) => void;
}

// O4 · Screening Gate — the MD's decision desk. The gate cohort (candidates that
// survived triage) is Pursued / Passed / Parked. PURSUE creates a screened deal,
// shown below in the "Screened — awaiting launch" bucket with the Launch action.
export function ScreeningGate({ deals, launchingId, onChanged, onLaunch }: Props) {
  const screened = deals.filter((d) => d.status === 'screened');

  return (
    <div>
      <CohortDesk
        stage="O4"
        title="Screening Gate · decision desk"
        subtitle="The MD reviews the triaged shortlist and records PURSUE, Pass or Park. PURSUE passes the gate and creates a screened deal below, awaiting a diligence launch."
        advanceLabel="⚡ PURSUE →"
        advanceClass="gate"
        agent="Gateway Orchestration"
        onChanged={onChanged}
      />

      <div className="panel screened-panel" style={{ marginTop: 16 }}>
        <div className="ph">
          <span className="ic">🚀</span>
          <h3>Screened — awaiting launch</h3>
          <span className="sub" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11.5, textTransform: 'none', letterSpacing: 0 }}>
            {screened.length} pursued · not yet launched
          </span>
        </div>
        <div className="pb">
          {screened.length === 0 && <div className="finding empty">No screened deals yet — record PURSUE above.</div>}
          <div className="scr-list">
            {screened.map((d) => (
              <div className="scr-row" key={d.id}>
                <span className="rr-badge scr">SCR</span>
                <div className="scr-main">
                  <div className="scr-co">{d.company}</div>
                  <div className="scr-meta">{d.currency} {d.dealSize}M · {d.sector} · {d.hq}</div>
                </div>
                <div className="scr-ic">
                  <div className={`scr-icv ${d.daysToIC <= 7 ? 'warn' : ''}`}>{d.daysToIC}</div>
                  <div className="scr-icl">days to IC</div>
                </div>
                <button className="btn primary" onClick={() => onLaunch(d.id)} disabled={launchingId === d.id}>
                  {launchingId === d.id ? 'Launching…' : '🚀 Launch Diligence & Approval'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

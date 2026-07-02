import type { DealSummary } from '../types';

interface Props {
  deals: DealSummary[];
  onGoToDeal: (id: string, stepKey: string) => void;
}

const STEP_TITLE: Record<string, string> = {
  D1: 'Launch Orchestration',
  D2: 'Diligence',
  D3: 'Synthesis',
  D4: 'Approval & Execution',
  D5: 'Archive'
};

// Step 5 · Deals Launched — the roster of deals whose workspace has been
// provisioned (D1–D5). Screened-awaiting-launch now lives on the O4 gate desk.
export function DealsReady({ deals, onGoToDeal }: Props) {
  const launched = deals
    .filter((d) => d.status === 'launched')
    .sort((a, b) => a.stageStepNumber - b.stageStepNumber);

  return (
    <div className="ready-page">
      <div className="ready-head">
        <div>
          <h2>Deals launched</h2>
          <p>Deals whose diligence workspace has been provisioned, tracked through the Stage-2 flow to the Investment Committee.</p>
        </div>
        <div className="ready-dist">
          {['D1', 'D2', 'D3', 'D4', 'D5'].map((k) => (
            <div className="rd-chip" key={k}>
              <span className="rd-c">{launched.filter((d) => d.stage === k).length}</span>
              <span className="rd-l">{STEP_TITLE[k].split(' ')[0]}</span>
            </div>
          ))}
        </div>
      </div>

      {launched.length === 0 && <div className="finding empty">No deals launched yet — pursue and launch a deal from the Screening Gate.</div>}
      <div className="ready-list">
        {launched.map((d) => (
          <DealRow key={d.id} d={d} onGo={() => onGoToDeal(d.id, d.stage)} />
        ))}
      </div>
    </div>
  );
}

function DealRow({ d, onGo }: { d: DealSummary; onGo: () => void }) {
  const archived = d.stage === 'D5';
  const icLabel = archived ? 'Closed' : d.daysToIC <= 0 ? 'IC due' : `${d.daysToIC}d to IC`;
  return (
    <div className={`ready-row ${archived ? 'archived' : ''}`}>
      <div className="rr-id">
        <div className="rr-co">{d.company}</div>
        <div className="rr-meta">{d.currency} {d.dealSize}M · {d.sector} · {d.hq}</div>
      </div>

      <div className="rr-step">
        <span className={`rr-badge d${d.stageStepNumber}`}>D{d.stageStepNumber}</span>
        <div className="rr-step-txt">
          <div className="rr-step-name">{STEP_TITLE[d.stage]}</div>
          <div className="rr-step-sub">Step {d.stageStepNumber} of {d.stageStepTotal}</div>
        </div>
      </div>

      <div className="rr-metrics">
        <Bar label="Diligence" pct={d.diligenceProgress} />
        <Bar label="IC memo" pct={d.memoProgress} />
        <div className="rr-metric">
          <div className="rr-mv">{d.readiness}</div>
          <div className="rr-ml">IC ready</div>
        </div>
        <div className="rr-metric">
          <div className={`rr-mv ${!archived && d.daysToIC <= 7 ? 'warn' : ''}`}>{archived ? '✓' : d.daysToIC <= 0 ? '•' : d.daysToIC}</div>
          <div className="rr-ml">{icLabel}</div>
        </div>
      </div>

      <button className="btn primary rr-go" onClick={onGo}>Go to current step →</button>
    </div>
  );
}

function Bar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="rr-bar">
      <div className="rr-bar-top"><span>{label}</span><b>{pct}%</b></div>
      <div className="rr-bar-track"><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

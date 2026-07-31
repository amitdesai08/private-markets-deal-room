// Stage-based agent lineup — makes the product legible in one glance: which
// purpose-built agent runs at each deal stage, an example ask for each, and an
// explicit, role-scoped access strip so a first-time viewer understands BOTH what
// the assistant can do AND what THIS role is allowed to see (RBAC made visible).
//
// Mirrors the server capability catalog (app/lib/capabilities.js) so the lineup and
// the "what can you do?" chat answer stay in lockstep. Presentational only.

type Cap = { agent: string; purpose: string; stage: string; needs: 'read' | 'stage2'; asks: string[]; skills: string[] };

const CATALOG: Cap[] = [
  { agent: 'Sourcing', purpose: 'Find, map & qualify new targets from signals, news & filings', stage: 'Origination', needs: 'read', asks: ['What should we source next in industrials?'], skills: ['deal-sourcing', 'market-map', 'competitive-analysis'] },
  { agent: 'Screening', purpose: 'Screen a target against the fund mandate, comps & unit economics', stage: 'Screening', needs: 'read', asks: ['Screen this company against our mandate.'], skills: ['deal-screening', 'comps-analysis', 'unit-economics', 'ai-readiness'] },
  { agent: 'Diligence', purpose: 'Plan & run diligence, surface red-flag risks by workstream', stage: 'Diligence · Stage 2', needs: 'stage2', asks: ['Build the diligence plan for this deal.'], skills: ['dd-checklist', 'dd-meeting-prep', 'competitive-analysis'] },
  { agent: 'Modeling', purpose: 'Build the returns case — LBO, DCF, 3-statement & comps', stage: 'Diligence / Execution', needs: 'read', asks: ['Build the base / bull / bear LBO returns.'], skills: ['lbo-model', 'dcf-model', '3-statement-model', 'returns-analysis'] },
  { agent: 'IC Memo', purpose: 'Draft the IC memo + deck, audit every figure to a source', stage: 'Approval · Stage 3', needs: 'stage2', asks: ['Draft the IC memo for this deal.'], skills: ['ic-memo', 'deck-refresh', 'citation-audit'] },
  { agent: 'Value Creation & Portfolio', purpose: 'Own the value-creation plan & monitor the portfolio vs the underwriting', stage: 'Ownership · Stage 4', needs: 'read', asks: ['Draft the 100-day value-creation plan.'], skills: ['value-creation-plan', 'portfolio-monitoring', 'returns-analysis'] },
];

export default function AgentGuide({ roleLabel, canViewStage2, canWrite, onAsk }: {
  roleLabel?: string; canViewStage2: boolean; canWrite: boolean; onAsk?: () => void;
}) {
  const limits: string[] = [];
  if (!canViewStage2) limits.push('Stage-2 diligence detail (findings, terms, financing, valuations) is deal-team only — you see status, not the confidential detail.');
  if (!canWrite) limits.push('Read-only — the assistant analyses & recommends; the deal team records the formal actions.');
  limits.push('Confidential deals you are not on the team for stay hidden — the assistant never surfaces a deal or figure your role cannot access.');

  return (
    <div className="ag-wrap">
      <style>{CSS}</style>
      <details className="ag" open>
        <summary>
          <span className="ag-h">Agents by stage</span>
          <span className="ag-sub">what the assistant runs across the deal lifecycle{roleLabel ? <> · scoped for <strong>{roleLabel}</strong></> : null}</span>
        </summary>

        <div className="ag-grid">
          {CATALOG.map((c) => {
            const gated = c.needs === 'stage2' && !canViewStage2;
            return (
              <button key={c.agent} className="ag-card" onClick={onAsk} title={onAsk ? 'Open the assistant to ask' : undefined} type="button">
                <div className="ag-stage">{c.stage}{gated ? <span className="ag-badge">status-only</span> : null}</div>
                <div className="ag-agent">{c.agent}</div>
                <div className="ag-purpose">{c.purpose}</div>
                <div className="ag-ask">e.g. “{c.asks[0]}”</div>
                <div className="ag-skills">{c.skills.map((s) => <span key={s} className="ag-skill">{s}</span>)}</div>
              </button>
            );
          })}
        </div>

        <div className="ag-access">
          <span className="ag-access-h">Your access</span>
          <ul>{limits.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>

        <div className="ag-custom">
          Each agent is a <strong>customizable pack</strong> — its instructions, tools and skills (shown above) live in editable <code>Agent.md</code> / <code>Skill.md</code> files, so a firm can tailor how the assistant sources, screens, models and writes without touching code.
        </div>
      </details>
    </div>
  );
}

const CSS = `
.ag-wrap { margin: 0 0 14px; }
.ag { border: 1px solid var(--border, #2a2a35); border-radius: 12px; background: var(--card, #1b1b22); }
.ag > summary { cursor: pointer; list-style: none; padding: 12px 16px; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.ag > summary::-webkit-details-marker { display: none; }
.ag > summary::before { content: '▸'; font-size: 11px; color: var(--muted); align-self: center; }
.ag[open] > summary::before { content: '▾'; }
.ag-h { font-weight: 700; font-size: 14px; color: var(--fg); }
.ag-sub { font-size: 12px; color: var(--muted); }
.ag-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; padding: 4px 16px 14px; }
.ag-card { text-align: left; border: 1px solid var(--border, #2a2a35); border-radius: 10px; background: var(--bg, #131318); padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; font: inherit; color: inherit; }
.ag-card:hover { border-color: var(--accent, #6ea8fe); }
.ag-stage { font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); display: flex; align-items: center; gap: 6px; }
.ag-badge { text-transform: none; letter-spacing: 0; font-size: 10px; color: var(--warn); border: 1px solid var(--warn-br); border-radius: 4px; padding: 0 5px; }
.ag-agent { font-weight: 700; font-size: 13px; color: var(--fg); }
.ag-purpose { font-size: 12px; color: var(--muted); line-height: 1.4; }
.ag-ask { font-size: 12px; color: var(--accent, #6ea8fe); margin-top: 2px; }
.ag-skills { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.ag-skill { font-size: 10px; color: var(--muted); background: rgba(140,140,150,.14); border-radius: 4px; padding: 1px 6px; }
.ag-access { border-top: 1px solid var(--border, #2a2a35); padding: 10px 16px 12px; }
.ag-access-h { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 700; }
.ag-access ul { margin: 6px 0 0; padding-left: 16px; display: flex; flex-direction: column; gap: 4px; }
.ag-access li { font-size: 12px; color: var(--muted); line-height: 1.45; }
.ag-custom { border-top: 1px solid var(--border, #2a2a35); padding: 10px 16px 12px; font-size: 12px; color: var(--muted); line-height: 1.5; }
.ag-custom code { font-size: 11px; background: rgba(140,140,150,.16); border-radius: 4px; padding: 0 5px; }
`;

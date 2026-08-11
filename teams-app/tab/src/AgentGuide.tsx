// Stage-based agent lineup — makes the product legible in one glance: which
// purpose-built agent runs at each deal stage, an example ask for each, and an
// explicit, role-scoped access strip so a first-time viewer understands BOTH what
// the assistant can do AND what THIS role is allowed to see (RBAC made visible).
//
// Mirrors the server capability catalog (app/lib/capabilities.js) so the lineup and
// the "what can you do?" chat answer stay in lockstep. Presentational only.

type Cap = { agent: string; purpose: string; stage: string; needs: 'read' | 'stage2'; asks: string[]; skills: string[] };

// The chips under each card were the directory names of the skill packs -
// "dd-checklist", "3-statement-model", "citation-audit" - printed unaltered on the
// panel a first-time partner is told to start with. They are useful (they say what
// the thing will actually produce), so they stay; they just say it in English now.
const SKILL_LABEL: Record<string, string> = {
  'deal-sourcing': 'Target sourcing',
  'market-map': 'Market map',
  'competitive-analysis': 'Competitive analysis',
  'deal-screening': 'Mandate screen',
  'comps-analysis': 'Trading comparables',
  'unit-economics': 'Unit economics',
  'ai-readiness': 'AI readiness',
  'dd-checklist': 'DD checklist',
  'dd-meeting-prep': 'DD meeting prep',
  'lbo-model': 'LBO model',
  'dcf-model': 'DCF model',
  '3-statement-model': 'Three-statement model',
  'returns-analysis': 'Returns analysis',
  'ic-memo': 'IC memo',
  'deck-refresh': 'IC deck refresh',
  'citation-audit': 'Source audit',
  'value-creation-plan': 'Value-creation plan',
  'portfolio-monitoring': 'Portfolio monitoring',
};

const CATALOG: Cap[] = [
  { agent: 'Sourcing', purpose: 'Find, map & qualify new targets from signals, news & filings', stage: 'Origination', needs: 'read', asks: ['What should we source next in industrials?'], skills: ['deal-sourcing', 'market-map', 'competitive-analysis'] },
  { agent: 'Screening', purpose: 'Screen a target against the fund mandate, comps & unit economics', stage: 'Screening', needs: 'read', asks: ['Screen this company against our mandate.'], skills: ['deal-screening', 'comps-analysis', 'unit-economics', 'ai-readiness'] },
  { agent: 'Diligence', purpose: 'Plan & run diligence, surface red-flag risks by workstream', stage: 'Diligence', needs: 'stage2', asks: ['Build the diligence plan for this deal.'], skills: ['dd-checklist', 'dd-meeting-prep', 'competitive-analysis'] },
  { agent: 'Modelling', purpose: 'Build the returns case — LBO, DCF, 3-statement & comps', stage: 'Diligence & execution', needs: 'read', asks: ['Build the base / bull / bear LBO returns.'], skills: ['lbo-model', 'dcf-model', '3-statement-model', 'returns-analysis'] },
  { agent: 'IC Memo', purpose: 'Draft the IC memo + deck, audit every figure to a source', stage: 'IC approval', needs: 'stage2', asks: ['Draft the IC memo for this deal.'], skills: ['ic-memo', 'deck-refresh', 'citation-audit'] },
  { agent: 'Value Creation & Portfolio', purpose: 'Own the value-creation plan & monitor the portfolio vs the underwriting', stage: 'Ownership', needs: 'read', asks: ['Draft the 100-day value-creation plan.'], skills: ['value-creation-plan', 'portfolio-monitoring', 'returns-analysis'] },
];

export default function AgentGuide({ roleLabel, canViewStage2, canWrite, onAsk }: {
  roleLabel?: string; canViewStage2: boolean; canWrite: boolean; onAsk?: () => void;
}) {
  const limits: string[] = [];
  if (!canViewStage2) limits.push('Confidential diligence detail — findings, terms, financing, valuations — is deal-team only. You see where each deal stands, not the confidential detail.');
  if (!canWrite) limits.push('Read-only — the assistant analyses & recommends; the deal team records the formal actions.');
  limits.push('Confidential deals you are not on the team for stay hidden — the assistant never surfaces a deal or figure your role cannot access.');

  return (
    <div className="ag-wrap">
      <style>{CSS}</style>
      {/* Closed by default. This is a catalogue of what the software can do, and it
          was the first 350px of the home page — so a partner with 45 seconds met a
          list of capabilities before a single fact about a single deal, and scrolled
          past it every day without ever reading it. Collapsed it is one row, it still
          says plainly what it is, and it is one click for the person who needs it. */}
      <details className="ag">
        <summary>
          <span className="ag-h">Everything you can ask this product to do</span>
          {/* This one row is the entire capability list. A partner exploring on her own
              found it last, called it "the manual, folded shut", and said she would have
              used a third of what she was paying for without it. It stays collapsed --
              it was 350px of catalogue above the first fact about a deal -- but it now
              says what it is rather than describing its own filing order. */}
          <span className="ag-sub">models, memos, checklists, 100-day plans{roleLabel ? <> · shown for <strong>{roleLabel}</strong></> : null}</span>
          {/* She scrolled past this row twice without registering that it opened. It
              read as a section heading, because that is what a bold line with a grey
              line under it looks like. It stays collapsed -- 350px of catalogue above
              the first fact about a deal was the fault it was collapsed to fix -- but
              it now carries something that plainly says press me. */}
          <span className="ag-open">Show me ▾</span>
        </summary>

        <div className="ag-grid">
          {CATALOG.map((c) => {
            const gated = c.needs === 'stage2' && !canViewStage2;
            return (
              <button key={c.agent} className="ag-card" onClick={onAsk} title={onAsk ? 'Open the assistant to ask' : undefined} type="button">
                <div className="ag-stage">{c.stage}{gated ? <span className="ag-badge">status only</span> : null}</div>
                <div className="ag-agent">{c.agent}</div>
                <div className="ag-purpose">{c.purpose}</div>
                <div className="ag-ask">e.g. “{c.asks[0]}”</div>
                <div className="ag-skills">{c.skills.map((s) => <span key={s} className="ag-skill">{SKILL_LABEL[s] || s}</span>)}</div>
              </button>
            );
          })}
        </div>

        <div className="ag-access">
          <span className="ag-access-h">Your access</span>
          <ul>{limits.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>

        {/* This line used to name the files our instructions live in - a note to a
            platform engineer, sitting in the panel that tells a first-time partner
            where to start. What they need to know is that it can be changed to fit
            how their firm works; who edits which file is a conversation for later. */}
        <div className="ag-custom">
          How the assistant sources, screens, models and writes at each stage can be tailored to your firm’s own process — no code change needed.
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
.ag-open { margin-left: auto; font-size: 11.5px; font-weight: 700; color: var(--accent); border: 1px solid var(--accent); border-radius: 999px; padding: 3px 10px; white-space: nowrap; }
.ag details[open] .ag-open, details.ag[open] .ag-open { color: var(--muted); border-color: var(--border); }
details.ag[open] .ag-open::after { content: ''; }
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

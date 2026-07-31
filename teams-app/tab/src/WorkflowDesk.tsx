import { useEffect, useMemo, useState } from 'react';
import { af } from './authFetch';
import { Narrative, SourceList, Tag, type Para } from './deskUi';

// Workflow & blockers — the authoritative 16-step spine, plus a labelled analysis
// of WHY the step in flight is stuck and what would unstick it.
//
// The honesty rule from the rest of the platform holds here literally: the step
// list is the deal record and nothing on this screen changes it. The blocker
// analysis and the detected commitments are overlays; they become real only when
// a named person presses a button, which routes through the governed
// assistant-actions path and lands in the audit trail.

type Blocker = {
  headline: string; impact: string; owner?: string; laneLabel?: string; basis?: string;
  evidence: { text: string; source: string }[];
};
type Step = {
  key: string; code: string; title: string; stage: string; agent?: string | null;
  produces: string[]; why?: string | null; state: 'done' | 'current' | 'pending';
  owner?: string; mine?: boolean; flagged?: boolean; laneLabel?: string | null;
  lanes?: { lane: string; label: string; progress: number; status: string; owner: string; blocking: boolean }[];
  blocker?: Blocker;
};
type Commitment = {
  id: string; source: string; author: string; at?: string | null; headline: string; quote: string;
  owner?: string | null; due?: string | null; dueText?: string | null;
  lane?: string | null; laneLabel?: string | null;
  stepTitle?: string | null; confidence: string; basis: string;
};
type Desk = {
  company: string; canWrite?: boolean; roleLabel?: string | null;
  narrative: { generatedAt: string; paragraphs: Para[]; sources: string[] };
  commitments: Commitment[];
  steps: Step[];
  counts: { all: number; pending: number; inProgress: number; atRisk: number; completed: number; mine: number };
};

type Filter = 'all' | 'pending' | 'inProgress' | 'atRisk' | 'completed' | 'mine';

const shortDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : 'no date';

export default function WorkflowDesk({
  dealId, onAsk,
}: { dealId: string; onAsk?: (q: string) => void }) {
  const [data, setData] = useState<Desk | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    const r = await af(`/api/deals/${dealId}/workflow-desk`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    setData(r);
    setLoading(false);
  }

  useEffect(() => { setFilter('all'); setDismissed(new Set()); setNote(''); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dealId]);

  // Turn a detected commitment into a real, owned issue on the deal. This is the
  // only place a commitment becomes authoritative, and it takes a person to do it.
  async function createTask(c: Commitment) {
    setBusy(c.id); setNote('');
    try {
      const r = await af(`/api/deals/${dealId}/issues`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: c.headline.slice(0, 160),
          lane: c.lane || undefined,
          severity: 'monitor',
          owner: c.owner || c.author,
          resolutionPath: `Commitment made in ${c.source}: “${c.quote.slice(0, 200)}”`,
          sources: [c.basis],
          dueDate: c.due || undefined,
        }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setNote(d?.detail || 'Could not create that task.'); return; }
      setNote(`Task created for ${c.owner || c.author} — recorded on the deal issue log.`);
      setDismissed((s) => new Set([...s, c.id]));
      await load();
    } catch (e: any) {
      setNote(`Could not create that task (${String(e?.message || e)}).`);
    } finally { setBusy(''); }
  }

  const steps = useMemo(() => {
    if (!data) return [];
    switch (filter) {
      case 'pending': return data.steps.filter((s) => s.state === 'pending');
      case 'inProgress': return data.steps.filter((s) => s.state === 'current');
      case 'atRisk': return data.steps.filter((s) => s.flagged);
      case 'completed': return data.steps.filter((s) => s.state === 'done');
      case 'mine': return data.steps.filter((s) => s.mine);
      default: return data.steps;
    }
  }, [data, filter]);

  if (loading) return <div className="card"><div className="bd muted">Reading the workflow…</div></div>;
  if (!data) return <div className="card"><div className="bd muted">The workflow desk is unavailable for this deal.</div></div>;

  const canWrite = !!data.canWrite;
  const commitments = data.commitments.filter((c) => !dismissed.has(c.id));
  const FILTERS: [Filter, string, number][] = [
    ['all', 'All', data.counts.all], ['pending', 'Pending', data.counts.pending],
    ['inProgress', 'In progress', data.counts.inProgress], ['atRisk', 'At risk', data.counts.atRisk],
    ['completed', 'Completed', data.counts.completed], ['mine', 'My steps', data.counts.mine],
  ];

  return (
    <div>
      {note ? <div className="callout ai" style={{ marginBottom: 12 }}>{note}</div> : null}

      {/* ---------------- Workflow progression ---------------- */}
      <div className="card aicard">
        <div className="hd">
          <span className="aibadge">✦ AI</span>
          <h3>Workflow progression</h3>
          <Tag kind="new" />
          <span className="spacer" />
          <span className="chip">{data.counts.completed} of {data.counts.all} steps</span>
          <button className="btn link compact" onClick={load}>↻ Refresh</button>
          <button className="btn link compact" onClick={() => setEvidence((v) => !v)}>🔍 Evidence</button>
        </div>
        <div className="bd">
          <Narrative paragraphs={data.narrative.paragraphs} sources={data.narrative.sources} onCite={() => setEvidence(true)} />
          {evidence ? <SourceList sources={data.narrative.sources} /> : null}
        </div>
      </div>

      {/* ---------------- Untracked commitments ---------------- */}
      {commitments.length ? (
        <div className="card" style={{ borderColor: 'var(--warn-br)' }}>
          <div className="hd" style={{ background: 'var(--warn-bg)' }}>
            <span className="aibadge">✦ AI</span>
            <h3>{commitments.length} untracked commitment{commitments.length === 1 ? '' : 's'} found in Work IQ</h3>
            <Tag kind="new" />
            <span className="spacer" />
            {canWrite ? <button className="btn link compact" onClick={() => setDismissed(new Set(data.commitments.map((c) => c.id)))}>Dismiss all</button> : null}
          </div>
          <div className="bd">
            {commitments.map((c) => (
              <div className="commit" key={c.id}>
                <div className="att-t">
                  <span className="chip">{c.source}</span>
                  <span className="name">{c.headline}</span>
                </div>
                <div className="quote">“{c.quote}”</div>
                <div className="prefill">
                  Owner: <b>{c.owner || c.author}</b> · Due: <b>{c.due ? shortDate(c.due) : c.dueText || 'not stated'}</b>
                  {c.laneLabel ? <> · Lane: <b>{c.laneLabel}</b></> : null}
                  {c.stepTitle ? <> · Step: <b>{c.stepTitle}</b></> : null}
                  <div className="sub">Basis: {c.basis} · confidence {c.confidence}</div>
                </div>
                {canWrite ? (
                  <div className="acts">
                    <button className="btn primary" disabled={busy === c.id} onClick={() => createTask(c)}>
                      {busy === c.id ? 'Creating…' : '✓ Create task'}
                    </button>
                    <button className="btn" onClick={() => onAsk?.(`Draft a follow-up to ${c.author} about: ${c.headline}`)}>Edit first</button>
                    <button className="btn link" onClick={() => setDismissed((s) => new Set([...s, c.id]))}>Dismiss</button>
                  </div>
                ) : null}
              </div>
            ))}
            <div className="sub">Nothing here is on the plan yet. A commitment becomes a task only when a named person creates it.</div>
          </div>
        </div>
      ) : null}

      {/* ---------------- Workflow steps ---------------- */}
      <div className="card">
        <div className="hd">
          <h3>Workflow steps</h3>
          <Tag kind="ext" />
          <span className="spacer" />
          <span className="sub">Authoritative status comes from the deal record · AI overlays are labelled separately and never change status</span>
        </div>
        <div className="pills">
          {FILTERS.map(([k, label, n]) => (
            <button key={k} className={`pillbtn${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>
              {label} ({n})
            </button>
          ))}
        </div>
        {steps.length === 0 ? (
          <div className="bd muted">No steps match this filter.</div>
        ) : steps.map((s) => (
          <div className={`step${s.flagged ? ' flagged' : ''}`} key={s.key}>
            <div className="step-r">
              <span className={`dot ${s.state === 'done' ? 'done' : s.flagged ? 'blocked' : s.state === 'current' ? 'now' : ''}`} />
              <span className="k">{s.key} · {s.title}</span>
              <span className={`chip ${s.state === 'done' ? 'good' : s.flagged ? 'bad' : s.state === 'current' ? '' : ''}`}>
                {s.state === 'done' ? 'Completed' : s.flagged ? 'At risk' : s.state === 'current' ? 'In progress' : 'Pending'}
              </span>
              {s.mine ? <span className="chip ai">Mine</span> : null}
              <span className="spacer" />
              <span className="m">{s.stage}</span>
            </div>
            <div className="att-l">
              {s.owner ? <span>👤 {s.owner}</span> : null}
              {s.agent ? <span>🤖 {s.agent}</span> : null}
              {s.produces.length ? <span>🔗 Produces: {s.produces.join(', ')}</span> : null}
            </div>

            {s.lanes?.length ? (
              <div className="att-l" style={{ gap: 10 }}>
                {s.lanes.map((l) => (
                  <span key={l.lane} className={`chip ${l.blocking ? 'warn' : ''}`}>{l.label} {l.progress}%</span>
                ))}
              </div>
            ) : null}

            {s.blocker ? (
              <div className="blocker">
                <h4><span className="aibadge">✦ AI</span> &nbsp;blocker analysis — {s.blocker.headline}</h4>
                {s.blocker.evidence.map((e, i) => (
                  <div key={i} style={{ fontSize: 12.5, marginBottom: 4 }}>
                    {e.text} <cite title={e.source}>{i + 1}</cite>
                  </div>
                ))}
                <div className="impact">⚡ {s.blocker.impact}</div>
                <div className="sub" style={{ marginTop: 6 }}>
                  {s.blocker.owner ? `Owner: ${s.blocker.owner} · ` : ''}{s.blocker.basis}
                </div>
                <div className="sub" style={{ marginTop: 4 }}>
                  Sources: {[...new Set(s.blocker.evidence.map((e) => e.source))].join(', ')}
                </div>
                {canWrite ? (
                  <div className="acts">
                    <button className="btn primary" onClick={() => onAsk?.(`Draft a follow-up in Teams to ${s.blocker?.owner} about ${s.blocker?.headline} on ${data.company}.`)}>✍ Draft follow-up in Teams</button>
                    <button className="btn" onClick={() => onAsk?.(`Escalate ${s.key} ${s.title} on ${data.company} to the Lead Partner — draft the escalation.`)}>↑ Escalate to Lead Partner</button>
                    <button className="btn" onClick={() => onAsk?.(`Record an issue for ${s.blocker?.headline} on ${data.company}.`)}>+ Record as issue</button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
        <div className="note">
          The step list is the deal record. Nothing on this screen writes to it — the blocker analysis is an overlay, and every action opens a proposal a named person confirms.
        </div>
      </div>
    </div>
  );
}

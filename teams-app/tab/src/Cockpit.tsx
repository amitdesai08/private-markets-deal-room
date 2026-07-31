import { useEffect, useState } from 'react';
import { af } from './authFetch';
import { Narrative, SourceList, Tag, ago, clock, type Para } from './deskUi';

// Deal Cockpit — the "everything front and centre" surface.
//
// Three stacked answers to the three questions someone actually opens a deal with:
//   1. What changed?            -> Deal briefing (narrative, cited, dismissible)
//   2. What needs me?           -> Attention queue (ranked, role-weighted, actionable)
//   3. Where are we?            -> Milestones with a labelled AI risk overlay
//
// Everything is served by GET /api/deals/:id/cockpit, which composes it from the
// deal record, the IC readiness board, the issue log and the flow spine. Actions
// route back through the existing approve-then-apply assistant-actions endpoint,
// so the agent proposes and a named person commits.

type Action = { label: string; kind: string; args?: any };
type AttentionItem = {
  rank: number; kind: string; kindLabel: string; title: string; why: string;
  owner?: string; due?: string | null; dueLabel?: string | null; impact?: string;
  basis?: string; actions?: Action[];
};
type Milestone = {
  key: string; title: string; stage: string; owner?: string; state: 'done' | 'current' | 'pending';
  aiRisk?: { headline: string; detail: string; impact?: string; basis?: string };
  waitingOn?: string;
};
type CockpitData = {
  company: string; stageName?: string | null; currentStep?: string | null;
  confidential?: boolean; icInDays?: number | null; canWrite?: boolean; roleLabel?: string | null;
  briefing: { generatedAt: string; paragraphs: Para[]; sources: string[]; suggestions: string[] };
  attention: AttentionItem[];
  milestones: Milestone[];
  counts: { attention: number; openIssues: number; blockingWorkstreams: number };
};
type Signal = {
  connected: boolean;
  threads: {
    id: string; group: string; title: string; anchor: string; anchorKind: string; source: string;
    webUrl?: string | null; messages: { from: string; at?: string | null; text: string }[];
  }[];
  commitments: { author: string; headline: string; dueText?: string | null }[];
};

const KIND_TONE: Record<string, string> = {
  risk: 'bad', issue: 'bad', ai: 'ai', compliance: 'warn', schedule: 'warn',
};

export default function Cockpit({
  dealId, onGoTab, onAsk,
}: { dealId: string; onGoTab?: (tab: string) => void; onAsk?: (q: string) => void }) {
  const [data, setData] = useState<CockpitData | null>(null);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [briefOpen, setBriefOpen] = useState(true);
  const [evidence, setEvidence] = useState(false);
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  const [ask, setAsk] = useState('');

  // "Since" is per-user, per-deal and local — the briefing is about what changed
  // for YOU, so it must not be a shared server-side watermark.
  const seenKey = `dr-cockpit-seen:${dealId}`;

  async function load() {
    setLoading(true);
    const since = localStorage.getItem(seenKey) || '';
    const r = await af(`/api/deals/${dealId}/cockpit${since ? `?since=${encodeURIComponent(since)}` : ''}`)
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    setData(r);
    setLoading(false);
  }

  useEffect(() => {
    setDismissed(new Set()); setVote(null); setBriefOpen(true); setNote(''); setEvidence(false);
    load();
    // The live-signal rail is a separate, slower call — the briefing must not wait
    // on a Graph round-trip to render.
    af(`/api/deals/${dealId}/threads`).then((r) => (r.ok ? r.json() : null)).then(setSignal).catch(() => setSignal(null));
    // Mark this visit only after the briefing has been served, so the next visit
    // reports the delta against this moment.
    return () => { try { localStorage.setItem(seenKey, new Date().toISOString()); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  // Approve an assistant-proposed action. Governed server-side: read-only roles
  // are rejected, and every apply writes an attributed audit entry.
  async function apply(item: AttentionItem, act: Action) {
    if (act.kind === 'goto') { onGoTab?.(act.args?.tab || 'overview'); return; }
    setBusy(`${item.rank}:${act.kind}`); setNote('');
    try {
      const r = await af(`/api/deals/${dealId}/assistant-actions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: act.kind, args: act.args || {} }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setNote(d?.detail || d?.error || 'Could not apply that action.'); return; }
      setNote(`Applied · ${act.label} — recorded as ${d.by || 'you'} in the audit trail.`);
      await load();
    } catch (e: any) {
      setNote(`Could not apply that action (${String(e?.message || e)}).`);
    } finally { setBusy(''); }
  }

  if (loading) return <div className="card"><div className="bd muted">Building your briefing…</div></div>;
  if (!data) return <div className="card"><div className="bd muted">The cockpit is unavailable for this deal.</div></div>;

  const attention = data.attention.filter((a) => !dismissed.has(a.rank));
  const canWrite = !!data.canWrite;
  const warRoom = signal?.threads.find((t) => t.group === 'Deal team');
  const latest = warRoom?.messages[warRoom.messages.length - 1];
  const done = data.milestones.filter((m) => m.state === 'done').length;

  return (
    <div>
      {note ? <div className="callout ai" style={{ marginBottom: 12 }}>{note}</div> : null}

      <div className="grid g2">
        <div style={{ minWidth: 0 }}>

          {/* ---------------- Deal briefing ---------------- */}
          <div className="card aicard">
            <div className="hd">
              <span className="aibadge">✦ AI</span>
              <h3>Deal briefing</h3>
              <Tag kind="new" />
              <span className="spacer" />
              <button className="btn link compact" onClick={load}>↻ Refresh</button>
              <button className="btn link compact" onClick={() => setEvidence((v) => !v)}>🔍 Evidence</button>
              <button className="btn link compact" onClick={() => setBriefOpen((v) => !v)}>{briefOpen ? 'Hide' : 'Show'}</button>
            </div>
            {briefOpen ? (
              <>
                <div className="bd">
                  <div className="sub" style={{ marginBottom: 8 }}>
                    Generated {clock(data.briefing.generatedAt)}
                    {data.briefing.sources.length ? ` · Sources: ${data.briefing.sources.join(', ')}` : ''}
                  </div>
                  <Narrative paragraphs={data.briefing.paragraphs} sources={data.briefing.sources} onCite={() => setEvidence(true)} />
                  {evidence ? <SourceList sources={data.briefing.sources} /> : null}
                  {data.briefing.suggestions.length ? (
                    <div className="suggest">
                      <span className="sub" style={{ fontWeight: 600 }}>Ask next</span>
                      {data.briefing.suggestions.map((s, i) => (
                        <button key={i} className="sgchip" onClick={() => onAsk?.(s)}>{s}</button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="vote">
                  Was this briefing useful?
                  <button className={vote === 'up' ? 'on' : ''} aria-label="Useful" onClick={() => setVote('up')}>👍</button>
                  <button className={vote === 'down' ? 'on' : ''} aria-label="Not useful" onClick={() => setVote('down')}>👎</button>
                  <span className="spacer" />
                  <span>{vote ? 'Noted — this tunes what surfaces next visit.' : 'Feedback tunes what surfaces next visit'}</span>
                </div>
              </>
            ) : null}
          </div>

          {/* ---------------- Attention queue ---------------- */}
          <div className="card">
            <div className="hd">
              <h3>What needs my attention</h3>
              <Tag kind="ext" />
              <span className="spacer" />
              <span className="chip">{attention.length} item{attention.length === 1 ? '' : 's'}</span>
            </div>
            <div className="legend">
              <span>
                Ranked by urgency{data.roleLabel ? <> · weighted for <b>{data.roleLabel}</b></> : null}
                {canWrite ? ' · AI-detected items are labelled' : <> · <b>read-only seat</b> — actions hidden</>}
              </span>
            </div>

            {attention.length === 0 ? (
              <div className="bd"><div className="muted">Nothing is competing for your attention on this deal right now.</div></div>
            ) : attention.map((a) => (
              <div className="att" key={a.rank}>
                <div className="att-t">
                  <span className="rank">#{a.rank}</span>
                  <span className={`chip ${KIND_TONE[a.kind] || ''}`}>{a.kindLabel}</span>
                  <span className="name">{a.title}</span>
                </div>
                <div className="att-l">⏰ {a.why}</div>
                <div className="att-l">
                  {a.owner ? <span>👤 {a.owner}</span> : null}
                  {a.dueLabel ? <span>📅 {a.dueLabel}</span> : null}
                </div>
                {a.impact ? <div className="impact">⚡ {a.impact}</div> : null}
                {a.basis ? <div className="sub" style={{ marginTop: 6 }}>Basis: {a.basis}</div> : null}
                {canWrite ? (
                  <div className="acts">
                    {(a.actions || []).map((act, i) => (
                      <button key={i} className={`btn${i === 0 ? ' primary' : ''}`}
                        disabled={busy === `${a.rank}:${act.kind}`}
                        onClick={() => apply(a, act)}>
                        {busy === `${a.rank}:${act.kind}` ? 'Applying…' : act.label}
                      </button>
                    ))}
                    <button className="btn link" onClick={() => setDismissed((s) => new Set([...s, a.rank]))}>Dismiss</button>
                  </div>
                ) : null}
              </div>
            ))}
            {canWrite ? (
              <div className="note">Every action here routes through the existing approve-then-apply path — the agent proposes, a named person commits, and the audit trail records who and when.</div>
            ) : null}
          </div>

          {/* ---------------- Ask ---------------- */}
          <div className="card">
            <div className="hd"><h3>Ask the deal agent</h3><Tag kind="live" /></div>
            <div className="bd">
              <div className="askchips">
                {['What changed this week?', 'What is still missing for IC?', 'Who owns the critical path?', 'Summarise the open risks', 'Draft the IC memo skeleton'].map((q) => (
                  <button key={q} className="sgchip" onClick={() => onAsk?.(q)}>{q}</button>
                ))}
              </div>
              <form className="askbox" onSubmit={(e) => { e.preventDefault(); if (ask.trim()) { onAsk?.(ask.trim()); setAsk(''); } }}>
                <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={`Ask anything about ${data.company}…`} aria-label="Ask the deal agent" />
                <button className="btn primary" type="submit" disabled={!ask.trim()}>Ask</button>
              </form>
            </div>
          </div>
        </div>

        {/* ---------------- Right rail ---------------- */}
        <div style={{ minWidth: 0 }}>
          <div className="card">
            <div className="hd">
              <h3>Milestones &amp; dependencies</h3>
              <Tag kind="ext" />
              <span className="spacer" />
              <span className="chip">{done} of {data.milestones.length} steps</span>
            </div>
            <div className="legend">
              <span><i style={{ background: 'var(--accent)' }} />Authoritative — deal record</span>
              <span><i style={{ background: 'var(--ai)' }} />✦ AI risk overlay — never auto-updates status</span>
            </div>
            <div>
              {data.milestones.map((m) => (
                <div className="ms" key={m.key}>
                  <span className={`dot ${m.state === 'done' ? 'done' : m.aiRisk ? 'risk' : m.state === 'current' ? 'now' : ''}`} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="k">
                      {m.key} · {m.title}
                      {m.aiRisk ? <span className="aibadge" style={{ marginLeft: 6 }}>✦ AI</span> : null}
                    </div>
                    {m.owner ? <div className="m">{m.owner}</div> : null}
                    {m.waitingOn ? <div className="m">Waiting on: {m.waitingOn}</div> : null}
                    {m.aiRisk ? (
                      <details>
                        <summary>Show AI risk detail</summary>
                        <div className="riskdetail">
                          <b>{m.aiRisk.headline}</b>
                          <div style={{ marginTop: 4 }}>{m.aiRisk.detail}</div>
                          {m.aiRisk.impact ? <div className="impact">⚡ {m.aiRisk.impact}</div> : null}
                          {m.aiRisk.basis ? <div className="sub" style={{ marginTop: 6 }}>Basis: {m.aiRisk.basis}</div> : null}
                        </div>
                      </details>
                    ) : null}
                  </div>
                  {/* Status is the deal record's. The AI risk is shown beside it,
                      labelled, so an overlay is never mistaken for a state change. */}
                  <span className={`chip ${m.state === 'done' ? 'good' : ''}`}>
                    {m.state === 'done' ? 'Completed' : m.state === 'current' ? 'In progress' : 'Pending'}
                  </span>
                  {m.aiRisk ? <span className="chip ai">✦ AI · at risk</span> : null}
                </div>
              ))}
            </div>
          </div>

          {/* Work IQ live signal — what is happening around the deal in Teams,
              brought INTO the deal instead of left behind in the channel. */}
          <div className="card">
            <div className="hd">
              <h3>Work IQ · live signal</h3>
              <Tag kind={signal?.connected ? 'live' : 'new'} />
              <span className="spacer" />
              {warRoom?.webUrl ? <a className="dashlink" href={warRoom.webUrl} target="_blank" rel="noreferrer">Open channel ↗</a> : null}
            </div>
            {warRoom && latest ? (
              <>
                <div className="dl">
                  <div className="sub">TEAMS · {warRoom.anchor}</div>
                  <div style={{ fontSize: 13 }}>{latest.text.slice(0, 160)}</div>
                  <div className="sub">{latest.from} · {ago(latest.at)}</div>
                </div>
                {signal?.commitments.length ? (
                  <div className="dl">
                    <div className="sub">UNTRACKED COMMITMENT</div>
                    <div style={{ fontSize: 13 }}>{signal.commitments[0].headline.slice(0, 160)}</div>
                    <div className="sub">{signal.commitments[0].author} · no task exists for this</div>
                  </div>
                ) : null}
                <div className="note">{warRoom.source}. Reading the channel uses the same consented Work IQ permission the agent tools use.</div>
              </>
            ) : (
              <div className="bd muted">No Teams channel is linked to this deal yet.</div>
            )}
          </div>

          <div className="card">
            <div className="hd"><h3>Your access</h3><Tag kind="live" /></div>
            <div className="bd sub">
              {data.roleLabel || 'Deal team'} · {canWrite ? 'can act (writes attributed to you)' : 'read-only — actions withheld'}
              {data.confidential ? ' · 🔒 confidential deal, deal team only' : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { af } from './authFetch';

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
  briefing: { generatedAt: string; paragraphs: string[]; sources: string[]; suggestions: string[] };
  attention: AttentionItem[];
  milestones: Milestone[];
  counts: { attention: number; openIssues: number; blockingWorkstreams: number };
};

const KIND_TONE: Record<string, string> = {
  risk: 'bad', issue: 'bad', ai: 'ai', compliance: 'warn', schedule: 'warn',
};

export default function Cockpit({
  dealId, onGoTab, onAsk,
}: { dealId: string; onGoTab?: (tab: string) => void; onAsk?: (q: string) => void }) {
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [briefOpen, setBriefOpen] = useState(true);
  const [vote, setVote] = useState<'up' | 'down' | null>(null);

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
    setDismissed(new Set()); setVote(null); setBriefOpen(true); setNote('');
    load();
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

  if (loading) return <div className="dd-panel" style={{ padding: 18 }}><div className="muted">Building your briefing…</div></div>;
  if (!data) return <div className="dd-panel" style={{ padding: 18 }}><div className="muted">The cockpit is unavailable for this deal.</div></div>;

  const attention = data.attention.filter((a) => !dismissed.has(a.rank));
  const canWrite = !!data.canWrite;

  return (
    <div className="ck">
      <style>{CK_CSS}</style>

      {note ? <div className="ck-note">{note}</div> : null}

      <div className="ck-grid">
        <div className="ck-col">

          {/* ---------------- Deal briefing ---------------- */}
          <div className="ck-card ai">
            <div className="ck-hd">
              <span className="ck-ai">✦ AI</span>
              <h3>Deal briefing</h3>
              <span className="ck-spacer" />
              <button className="ck-link" onClick={load}>↻ Refresh</button>
              <button className="ck-link" onClick={() => setBriefOpen((v) => !v)}>{briefOpen ? 'Hide' : 'Show'}</button>
            </div>
            {briefOpen ? (
              <div className="ck-bd">
                <div className="ck-sub">
                  Generated {new Date(data.briefing.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {data.briefing.sources.length ? ` · Sources: ${data.briefing.sources.join(', ')}` : ''}
                </div>
                <div className="ck-narr">
                  {data.briefing.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                </div>
                {data.briefing.suggestions.length ? (
                  <div className="ck-suggest">
                    <span className="ck-sub" style={{ fontWeight: 600 }}>Ask next</span>
                    {data.briefing.suggestions.map((s, i) => (
                      <button key={i} className="ck-chipbtn" onClick={() => onAsk?.(s)}>{s}</button>
                    ))}
                  </div>
                ) : null}
                <div className="ck-vote">
                  Was this useful?
                  <button className={vote === 'up' ? 'on' : ''} onClick={() => setVote('up')}>👍</button>
                  <button className={vote === 'down' ? 'on' : ''} onClick={() => setVote('down')}>👎</button>
                  <span className="ck-spacer" />
                  <span className="ck-sub">{vote ? 'Noted — this tunes what surfaces next visit.' : 'Feedback tunes what surfaces next visit'}</span>
                </div>
              </div>
            ) : null}
          </div>

          {/* ---------------- Attention queue ---------------- */}
          <div className="ck-card">
            <div className="ck-hd">
              <h3>What needs my attention</h3>
              <span className="ck-spacer" />
              <span className="ck-chip">{attention.length} item{attention.length === 1 ? '' : 's'}</span>
            </div>
            <div className="ck-legend">
              Ranked by urgency{data.roleLabel ? <> · weighted for <b>{data.roleLabel}</b></> : null}
              {canWrite ? null : <> · <b>read-only seat</b> — actions hidden</>}
            </div>

            {attention.length === 0 ? (
              <div className="ck-bd"><div className="muted">Nothing is competing for your attention on this deal right now.</div></div>
            ) : attention.map((a) => (
              <div className={`ck-att ${KIND_TONE[a.kind] || ''}`} key={a.rank}>
                <div className="ck-att-t">
                  <span className="ck-rank">#{a.rank}</span>
                  <span className={`ck-chip ${KIND_TONE[a.kind] || ''}`}>{a.kindLabel}</span>
                  <span className="ck-att-name">{a.title}</span>
                </div>
                <div className="ck-att-l">⏰ {a.why}</div>
                <div className="ck-att-l">
                  {a.owner ? <>👤 {a.owner}</> : null}
                  {a.dueLabel ? <> &nbsp; 📅 {a.dueLabel}</> : null}
                </div>
                {a.impact ? <div className="ck-impact">⚡ {a.impact}</div> : null}
                {a.basis ? <div className="ck-sub" style={{ marginTop: 6 }}>Basis: {a.basis}</div> : null}
                {canWrite ? (
                  <div className="ck-acts">
                    {(a.actions || []).map((act, i) => (
                      <button key={i} className={`ck-btn${i === 0 ? ' primary' : ''}`}
                        disabled={busy === `${a.rank}:${act.kind}`}
                        onClick={() => apply(a, act)}>
                        {busy === `${a.rank}:${act.kind}` ? 'Applying…' : act.label}
                      </button>
                    ))}
                    <button className="ck-link" onClick={() => setDismissed((s) => new Set([...s, a.rank]))}>Dismiss</button>
                  </div>
                ) : null}
              </div>
            ))}
            {canWrite ? (
              <div className="ck-foot">Every action here routes through the existing approve-then-apply path — the agent proposes, a named person commits, and the audit trail records who and when.</div>
            ) : null}
          </div>
        </div>

        {/* ---------------- Right rail ---------------- */}
        <div className="ck-col">
          <div className="ck-card">
            <div className="ck-hd">
              <h3>Milestones &amp; dependencies</h3>
              <span className="ck-spacer" />
              <span className="ck-chip">{data.milestones.filter((m) => m.state === 'done').length} of {data.milestones.length}</span>
            </div>
            <div className="ck-legend">
              <span className="ck-key"><i style={{ background: 'var(--accent)' }} />Authoritative — deal record</span>
              <span className="ck-key"><i style={{ background: '#7c3aed' }} />✦ AI overlay — never changes status</span>
            </div>
            <div className="ck-ms-wrap">
              {data.milestones.map((m) => (
                <div className="ck-ms" key={m.key}>
                  <span className={`ck-dot ${m.state}${m.aiRisk ? ' risk' : ''}`} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="ck-ms-k">
                      {m.key} · {m.title}
                      {m.aiRisk ? <span className="ck-ai sm">✦ AI</span> : null}
                    </div>
                    {m.owner ? <div className="ck-sub">{m.owner}</div> : null}
                    {m.waitingOn ? <div className="ck-sub">Waiting on: {m.waitingOn}</div> : null}
                    {m.aiRisk ? (
                      <details className="ck-risk">
                        <summary>Show AI risk detail</summary>
                        <div className="ck-riskbody">
                          <b>{m.aiRisk.headline}</b>
                          <div style={{ marginTop: 4 }}>{m.aiRisk.detail}</div>
                          {m.aiRisk.impact ? <div className="ck-impact" style={{ marginTop: 6 }}>⚡ {m.aiRisk.impact}</div> : null}
                          {m.aiRisk.basis ? <div className="ck-sub" style={{ marginTop: 6 }}>Basis: {m.aiRisk.basis}</div> : null}
                        </div>
                      </details>
                    ) : null}
                  </div>
                  <span className={`ck-chip ${m.state === 'done' ? 'good' : m.aiRisk ? 'warn' : ''}`}>
                    {m.state === 'done' ? 'Completed' : m.state === 'current' ? (m.aiRisk ? 'At risk' : 'In progress') : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="ck-card">
            <div className="ck-hd"><h3>Your access</h3></div>
            <div className="ck-bd ck-sub">
              {data.roleLabel || 'Deal team'} · {canWrite ? 'can act (writes attributed to you)' : 'read-only — actions withheld'}
              {data.confidential ? ' · 🔒 confidential deal, deal team only' : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const CK_CSS = `
.ck { --ck-ai:#7c3aed; }
.ck-grid { display:grid; grid-template-columns: minmax(0,1.55fr) minmax(0,1fr); gap:14px; align-items:start; }
@media (max-width: 1000px) { .ck-grid { grid-template-columns: minmax(0,1fr); } }
.ck-col { display:flex; flex-direction:column; gap:14px; min-width:0; }
.ck-card { border:1px solid var(--border); border-radius:12px; background:var(--card); overflow:hidden; }
.ck-card.ai { border-color:color-mix(in srgb, var(--ck-ai) 45%, var(--border)); }
.ck-hd { display:flex; align-items:center; gap:8px; padding:10px 14px; border-bottom:1px solid var(--border); }
.ck-hd h3 { margin:0; font-size:13.5px; font-weight:700; }
.ck-spacer { flex:1; }
.ck-bd { padding:12px 14px; }
.ck-sub { color:var(--muted); font-size:12px; }
.ck-ai { font-size:11px; font-weight:700; color:#fff; background:var(--ck-ai); padding:2px 8px; border-radius:999px; }
.ck-ai.sm { margin-left:6px; padding:1px 6px; font-size:10px; }
.ck-chip { background:var(--chip); padding:3px 9px; border-radius:999px; font-size:11.5px; font-weight:600; white-space:nowrap; }
.ck-chip.bad { background:rgba(178,59,59,.16); color:#f09a9a; }
.ck-chip.warn { background:rgba(184,134,11,.18); color:#e0b354; }
.ck-chip.good { background:rgba(27,127,55,.16); color:#7fc98f; }
.ck-chip.ai { background:color-mix(in srgb, var(--ck-ai) 22%, transparent); color:#b79bf5; }
.ck-narr p { margin:0 0 9px; font-size:13px; line-height:1.55; }
.ck-narr p:last-child { margin-bottom:0; }
.ck-suggest { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-top:12px; }
.ck-chipbtn { border:1px solid var(--border); background:var(--chip); color:inherit; border-radius:999px; padding:4px 10px; font:inherit; font-size:12px; cursor:pointer; }
.ck-chipbtn:hover { background:var(--hover); }
.ck-vote { display:flex; align-items:center; gap:8px; margin-top:12px; padding-top:10px; border-top:1px solid var(--border); font-size:12px; color:var(--muted); }
.ck-vote button { border:1px solid var(--border); background:var(--card); color:inherit; border-radius:7px; padding:3px 9px; cursor:pointer; font:inherit; }
.ck-vote button.on { border-color:var(--accent); background:var(--chip); }
.ck-legend { display:flex; flex-wrap:wrap; gap:12px; padding:9px 14px; color:var(--muted); font-size:12px; border-bottom:1px solid var(--border); }
.ck-key { display:inline-flex; align-items:center; gap:6px; }
.ck-key i { width:9px; height:9px; border-radius:3px; display:inline-block; }
.ck-att { padding:12px 14px; border-bottom:1px solid var(--border); border-left:3px solid transparent; }
.ck-att.bad { border-left-color:#b23b3b; }
.ck-att.warn { border-left-color:#b8860b; }
.ck-att.ai { border-left-color:var(--ck-ai); }
.ck-att-t { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ck-rank { font-weight:800; color:var(--muted); font-size:12px; }
.ck-att-name { font-weight:700; font-size:13px; }
.ck-att-l { color:var(--muted); font-size:12.5px; margin-top:5px; }
.ck-impact { margin-top:7px; font-size:12.5px; padding:6px 9px; border-radius:8px; background:var(--chip); }
.ck-acts { display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; align-items:center; }
.ck-btn { border:1px solid var(--border); background:var(--card); color:var(--fg); border-radius:8px; padding:6px 11px; cursor:pointer; font:inherit; font-size:12.5px; font-weight:600; }
.ck-btn.primary { background:var(--accent); border-color:var(--accent); color:var(--accent-fg,#fff); }
.ck-btn:disabled { opacity:.55; cursor:default; }
.ck-link { border:none; background:none; color:var(--accent); cursor:pointer; font:inherit; font-size:12.5px; font-weight:600; padding:4px 6px; }
.ck-foot { padding:10px 14px; color:var(--muted); font-size:11.5px; }
.ck-note { border:1px solid var(--border); background:var(--chip); border-radius:9px; padding:9px 12px; font-size:12.5px; margin-bottom:12px; }
.ck-ms-wrap { padding:4px 0; }
.ck-ms { display:flex; gap:10px; align-items:flex-start; padding:9px 14px; border-bottom:1px solid var(--border); }
.ck-ms:last-child { border-bottom:none; }
.ck-ms-k { font-weight:650; font-size:12.5px; }
.ck-dot { width:10px; height:10px; border-radius:50%; margin-top:4px; flex:0 0 auto; background:var(--border); }
.ck-dot.done { background:#1b7f37; }
.ck-dot.current { background:var(--accent); }
.ck-dot.risk { background:#b8860b; }
.ck-risk { margin-top:6px; }
.ck-risk summary { cursor:pointer; color:var(--ck-ai); font-size:12px; font-weight:600; }
.ck-riskbody { margin-top:7px; padding:9px 11px; border-radius:9px; border:1px solid color-mix(in srgb, var(--ck-ai) 40%, var(--border)); background:color-mix(in srgb, var(--ck-ai) 8%, transparent); font-size:12.5px; }
`;

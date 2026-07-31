import { useEffect, useState } from 'react';
import { af } from './authFetch';
import { Tag, ago } from './deskUi';

// Work IQ threads — Teams conversation, brought INTO the deal.
//
// The problem this solves: deal knowledge lives in chat, and chat has no idea
// which deal, lane or document it belongs to. Every thread here is ANCHORED to a
// deal object, so a conversation has a home in the deal record rather than only
// a timestamp in a channel.
//
// Where the deal has a provisioned Teams channel AND the Work IQ Graph app is
// configured, the messages are the real thread (read with the already-consented
// ChannelMessage.Read.All permission, through the same governed Work IQ
// dispatcher the agent tools use). Otherwise we show the demo corpus and say so
// — a surface that pretends to be live is worse than one that admits it isn't.

type Msg = { id: string; from: string; initials?: string; role?: string | null; at?: string | null; text: string; webUrl?: string | null; mine?: boolean };
type Thread = {
  id: string; group: string; title: string; ref?: string; state?: string;
  anchorKind: string; anchor: string; preview: string; updated?: string | null;
  participants: string[]; messages: Msg[]; live?: boolean; webUrl?: string | null; source: string;
};
type Desk = {
  company: string; connected: boolean; channelUrl?: string | null; canWrite?: boolean;
  threads: Thread[];
  catchUp: { count: number; window: string; keyPoint?: string | null; openQuestion?: string | null; decision: string; basis: string } | null;
  commitments: { id: string; author: string; headline: string; quote: string; owner?: string | null; due?: string | null; dueText?: string | null; laneLabel?: string | null; basis: string }[];
  decisions: { id: string; by: string; at?: string | null; text: string; recorded: boolean; basis: string }[];
  suggestedParticipants: { name: string; why: string }[];
};

const GROUPS = ['Deal objects', 'Cross-functional', 'Deal team'];

export default function ThreadsDesk({
  dealId, onAsk,
}: { dealId: string; onAsk?: (q: string) => void }) {
  const [data, setData] = useState<Desk | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState('');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    const r: Desk | null = await af(`/api/deals/${dealId}/threads`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    setData(r);
    setActive((cur) => (r?.threads.some((t) => t.id === cur) ? cur : r?.threads[0]?.id || ''));
    setLoading(false);
  }

  useEffect(() => { setNote(''); setDismissed(new Set()); setActive(''); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dealId]);

  // A detected decision only enters the decision log when a person records it —
  // it lands as a durable, attributed Work IQ note the rest of the deal can read.
  async function record(kind: 'decision' | 'task', text: string, id: string) {
    setBusy(id); setNote('');
    try {
      const r = await af(`/api/deals/${dealId}/workiq-notes`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: `${kind === 'decision' ? 'DECISION' : 'TASK'}: ${text}` }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setNote(d?.detail || 'Could not record that.'); return; }
      setNote(kind === 'decision' ? 'Decision recorded on the deal — visible to the whole deal team.' : 'Task recorded on the deal.');
      setDismissed((s) => new Set([...s, id]));
      await load();
    } catch (e: any) {
      setNote(`Could not record that (${String(e?.message || e)}).`);
    } finally { setBusy(''); }
  }

  if (loading) return <div className="card"><div className="bd muted">Reading the deal's conversations…</div></div>;
  if (!data) return <div className="card"><div className="bd muted">Threads are unavailable for this deal.</div></div>;
  if (!data.threads.length) {
    return (
      <div className="card">
        <div className="hd"><h3>Work IQ threads</h3><Tag kind="new" /></div>
        <div className="bd muted">No conversation is linked to this deal yet. Provision the deal's Teams channel to bring the war room in here.</div>
      </div>
    );
  }

  const canWrite = !!data.canWrite;
  const thread = data.threads.find((t) => t.id === active) || data.threads[0];
  const decisions = data.decisions.filter((d) => !dismissed.has(d.id));
  const commitments = data.commitments.filter((c) => !dismissed.has(c.id));

  return (
    <div>
      {note ? <div className="callout ai" style={{ marginBottom: 12 }}>{note}</div> : null}

      <div className="grid g3">
        {/* ---------------- Thread rail ---------------- */}
        <div style={{ minWidth: 0 }}>
          <div className="card">
            <div className="hd">
              <h3>Threads</h3>
              <Tag kind="new" />
              <span className="spacer" />
              <span className="chip">{data.threads.length}</span>
            </div>
            <div className="rail">
              {GROUPS.map((g) => {
                const list = data.threads.filter((t) => t.group === g);
                if (!list.length) return null;
                return (
                  <div key={g}>
                    <div className="railgrp">{g}</div>
                    {list.map((t) => (
                      <button key={t.id} className={`thrd${t.id === thread.id ? ' on' : ''}`} onClick={() => setActive(t.id)}>
                        <div className="k">{t.ref ? `${t.ref} · ` : ''}{t.title}</div>
                        <div className="anchor">📎 {t.anchorKind}: {t.anchor}</div>
                        <div className="p">{t.preview}</div>
                        <div className="sub">{t.state ? `${t.state} · ` : ''}{ago(t.updated)}</div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="note">
              {data.connected
                ? 'Live Microsoft Teams messages, read with the consented Work IQ permission.'
                : 'Showing the Work IQ demo corpus — no Teams channel is linked to this deal yet.'}
            </div>
          </div>
        </div>

        {/* ---------------- Conversation ---------------- */}
        <div style={{ minWidth: 0 }}>
          <div className="card">
            <div className="hd">
              <h3>{thread.title}</h3>
              <span className="chip ai">📎 {thread.anchorKind}: {thread.anchor}</span>
              <span className="spacer" />
              {thread.webUrl ? <a className="dashlink" href={thread.webUrl} target="_blank" rel="noreferrer">Open in Teams ↗</a> : null}
            </div>

            {data.catchUp && thread.group === 'Deal team' ? (
              <div className="bd">
                <div className="card aicard" style={{ marginBottom: 0 }}>
                  <div className="hd"><span className="aibadge">✦ AI</span><h3>Catch-up</h3></div>
                  <div className="bd" style={{ fontSize: 13 }}>
                    <div className="sub" style={{ marginBottom: 6 }}>{data.catchUp.count} message{data.catchUp.count === 1 ? '' : 's'} {data.catchUp.window}</div>
                    {data.catchUp.keyPoint ? <div style={{ marginBottom: 6 }}><b>Key point.</b> {data.catchUp.keyPoint}</div> : null}
                    {data.catchUp.openQuestion ? <div style={{ marginBottom: 6 }}><b>Open question.</b> {data.catchUp.openQuestion}</div> : null}
                    <div><b>Decision.</b> {data.catchUp.decision}</div>
                    <div className="sub" style={{ marginTop: 6 }}>{data.catchUp.basis}</div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="bd">
              {thread.messages.map((m) => (
                <div className={`msg${m.mine ? ' me' : ''}`} key={m.id}>
                  <span className="av">{m.initials || m.from.slice(0, 2).toUpperCase()}</span>
                  <div className="bub">
                    <div className="who">{m.from}{m.role ? <span className="sub"> · {m.role}</span> : null}</div>
                    <div>{m.text}</div>
                    <div className="t">{ago(m.at)}{m.webUrl ? <> · <a className="dashlink" href={m.webUrl} target="_blank" rel="noreferrer">open ↗</a></> : null}</div>
                  </div>
                </div>
              ))}
            </div>

            {data.suggestedParticipants.length ? (
              <div className="bd suggest" style={{ borderTop: '1px dashed var(--border)' }}>
                <span className="sub" style={{ fontWeight: 600 }}>Suggested participants from thread context</span>
                {data.suggestedParticipants.map((p) => (
                  <button key={p.name} className="sgchip" title={p.why} onClick={() => onAsk?.(`Loop ${p.name} into the ${thread.anchor} thread on ${data.company} — draft the message.`)}>
                    + {p.name}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="bd">
              <form className="askbox" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { onAsk?.(`In the ${thread.anchor} thread on ${data.company}: ${draft.trim()}`); setDraft(''); } }}>
                <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask the agent about this thread…" aria-label="Ask about this thread" />
                <button className="btn primary" type="submit" disabled={!draft.trim()}>Ask</button>
              </form>
              <div className="sub" style={{ marginTop: 6 }}>
                Replies are drafted here and posted from Teams — the app reads the channel, it does not speak for you.
              </div>
            </div>
          </div>
        </div>

        {/* ---------------- Post-meeting intelligence ---------------- */}
        <div style={{ minWidth: 0 }}>
          <div className="card aicard">
            <div className="hd"><span className="aibadge">✦ AI</span><h3>Detected in this deal</h3><Tag kind="new" /></div>
            <div className="bd">
              {decisions.length === 0 && commitments.length === 0 ? (
                <div className="muted">Nothing detected that isn't already on the deal record.</div>
              ) : null}

              {decisions.map((d) => (
                <div className="callout good" key={d.id}>
                  <div style={{ fontWeight: 650, marginBottom: 4 }}>✓ Decision detected</div>
                  <div>{d.text}</div>
                  <div className="sub" style={{ marginTop: 4 }}>{d.by} · {ago(d.at)} · {d.basis}</div>
                  {canWrite ? (
                    <div className="acts">
                      <button className="btn primary" disabled={busy === d.id} onClick={() => record('decision', d.text, d.id)}>
                        {busy === d.id ? 'Recording…' : '📌 Record as decision'}
                      </button>
                      <button className="btn link" onClick={() => setDismissed((s) => new Set([...s, d.id]))}>Dismiss</button>
                    </div>
                  ) : null}
                </div>
              ))}

              {commitments.map((c) => (
                <div className="callout" key={c.id}>
                  <div style={{ fontWeight: 650, marginBottom: 4 }}>⚡ Commitment — no task exists</div>
                  <div>{c.headline}</div>
                  <div className="quote">“{c.quote}”</div>
                  <div className="prefill">
                    Owner: <b>{c.owner || c.author}</b> · Due: <b>{c.dueText || 'not stated'}</b>
                    {c.laneLabel ? <> · Lane: <b>{c.laneLabel}</b></> : null}
                  </div>
                  {canWrite ? (
                    <div className="acts">
                      <button className="btn primary" disabled={busy === c.id} onClick={() => record('task', `${c.headline} (owner ${c.owner || c.author})`, c.id)}>
                        {busy === c.id ? 'Creating…' : '✓ Create task'}
                      </button>
                      <button className="btn link" onClick={() => setDismissed((s) => new Set([...s, c.id]))}>Dismiss</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="note">Detection proposes; the decision log records only what a named person confirms.</div>
          </div>

          <div className="card">
            <div className="hd"><h3>🤝 Cross-functional requests</h3><Tag kind="ext" /></div>
            <div className="bd">
              {data.threads.filter((t) => t.group === 'Cross-functional').length === 0 ? (
                <div className="muted">No open cross-functional requests on this deal.</div>
              ) : data.threads.filter((t) => t.group === 'Cross-functional').map((t) => (
                <div className={`callout ${t.state === 'In progress' ? '' : 'ai'}`} key={t.id}>
                  <div style={{ fontWeight: 650 }}>{t.ref} · {t.title}</div>
                  <div className="sub">{t.anchor} · {t.state} · {t.participants.join(', ')}</div>
                </div>
              ))}
              {canWrite ? (
                <div className="acts">
                  {['⚖ Legal', '🔒 Compliance', '📊 IC'].map((x) => (
                    <button key={x} className="btn" onClick={() => onAsk?.(`Raise a ${x.replace(/^\S+\s/, '')} request on ${data.company} — draft it.`)}>{x}</button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="note">Backed by the deal issue log — every request already has an owner, a lane and a state.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

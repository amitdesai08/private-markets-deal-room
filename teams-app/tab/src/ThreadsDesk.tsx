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
//
// You can also SPEAK here. The message is sent with your own delegated token, so it
// arrives in Teams from you — your name, your audit trail, your retention. The app is
// the surface, not the author: it never posts on its own and never posts as itself.

type Msg = { id: string; graphId?: string | null; from: string; initials?: string; role?: string | null; at?: string | null; text: string; webUrl?: string | null; mine?: boolean };
type Thread = {
  id: string; group: string; title: string; ref?: string; state?: string;
  anchorKind: string; anchor: string; preview: string; updated?: string | null;
  participants: string[]; messages: Msg[]; live?: boolean; webUrl?: string | null; source: string;
};
type Desk = {
  company: string; connected: boolean; channelUrl?: string | null; canWrite?: boolean;
  // How this content was actually read. `asUser` means the Graph call ran with the
  // signed-in person's own delegated token, so Microsoft 365 applied their
  // permissions; without it a live read is application-wide. `origin` distinguishes
  // authored demo content from content derived from the deal record.
  asUser?: boolean; obo?: boolean;
  origin?: { channel?: string; files?: string; mail?: string };
  // Whether this person can actually post into this channel, and if not, why not.
  // Resolved server-side so the composer is never offered when it could not work.
  compose?: { canSend: boolean; reason: string | null };
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
  const [replyTo, setReplyTo] = useState<{ id: string; from: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    const r: Desk | null = await af(`/api/deals/${dealId}/threads`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    setData(r);
    setActive((cur) => (r?.threads.some((t) => t.id === cur) ? cur : r?.threads[0]?.id || ''));
    setLoading(false);
  }

  useEffect(() => { setNote(''); setDismissed(new Set()); setActive(''); setReplyTo(null); setDraft(''); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dealId]);

  // Speak in the deal's Teams channel. The orchestrator posts with the signed-in
  // person's own delegated token, so this is them talking, not the app talking for
  // them. A failure is reported plainly and the draft is kept — there is no local
  // echo, because showing an unsent message as sent is worse than showing an error.
  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true); setNote('');
    try {
      const r = await af(`/api/deals/${dealId}/threads/message`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, replyTo: replyTo?.id || null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setNote(d?.detail || d?.reason || 'Microsoft 365 did not accept that message.');
        return;
      }
      setDraft(''); setReplyTo(null);
      setNote('Sent to Teams as you.');
      await load();
    } catch (e: any) {
      setNote(`Could not send that (${String(e?.message || e)}).`);
    } finally { setSending(false); }
  }

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
        <div className="hd"><h3>Deal channel</h3><Tag kind="new" /></div>
        <div className="bd muted">No conversation is linked to this deal yet. Set up the deal's Teams channel to bring the discussion in here.</div>
      </div>
    );
  }

  const canWrite = !!data.canWrite;
  const thread = data.threads.find((t) => t.id === active) || data.threads[0];
  // Posting is only offered on the thread that IS the Teams channel, and only when the
  // server has confirmed this person could actually post — channel linked, write seat,
  // their own M365 sign-in present. The issue log and shared-memory threads are
  // constructions of the deal record; there is no channel behind them to speak into.
  const canSend = !!data.compose?.canSend && thread.id === 'war-room' && !!thread.live;
  const sendBlockedReason = thread.id === 'war-room' ? data.compose?.reason || null : null;
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
                    <div className="railgrp">{g === 'Deal objects' ? 'Deal record' : g}</div>
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
              {data.connected && data.asUser
                ? `Live Microsoft Teams messages, read as you — you are seeing exactly what your own Microsoft 365 permissions allow, nothing more.${data.compose?.canSend ? ' You can reply from here, and it posts under your name.' : ''}`
                : data.connected
                  ? 'Live Microsoft Teams messages, read with the permission your organisation granted the app rather than your own — you are seeing only the channels this deal team can see.'
                  : data.origin?.channel === 'derived'
                    ? 'No Teams channel is linked to this deal yet, so this conversation is composed from the deal record — the workstreams, owners and dates it already holds.'
                    : data.channelUrl
                      // The deal HAS a channel — saying otherwise was flatly wrong once every
                      // deal was linked to one, and it sent people looking for a channel they
                      // already had. The honest gap is that we are not reading it yet.
                      ? 'This deal has a Teams channel, but its messages are not being read here yet — what you see below is sample conversation. Open the channel to read the real one.'
                      : 'Showing sample conversations — no Teams channel is linked to this deal yet.'}
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
                    <div className="t">
                      {ago(m.at)}
                      {m.webUrl ? <> · <a className="dashlink" href={m.webUrl} target="_blank" rel="noreferrer">open ↗</a></> : null}
                      {/* Replying needs the real Teams message id, which only exists on
                          messages actually read from Graph. Seeded corpus messages have
                          nothing to reply to, so they correctly offer nothing. */}
                      {canSend && m.graphId ? (
                        <> · <button className="linkish" type="button" onClick={() => setReplyTo({ id: m.graphId as string, from: m.from })}>reply</button></>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {canWrite && data.suggestedParticipants.length ? (
              <div className="bd suggest" style={{ borderTop: '1px dashed var(--border)' }}>
                <span className="sub" style={{ fontWeight: 600 }}>Suggested participants from thread context</span>
                {data.suggestedParticipants.map((p) => (
                  <button key={p.name} className="sgchip" title={p.why} onClick={() => onAsk?.(`Loop ${p.name} into the ${thread.anchor} thread on ${data.company} — draft the message.`)}>
                    + {p.name}
                  </button>
                ))}
              </div>
            ) : null}

            {/* One box, two destinations. Typing the same sentence twice into two
                near-identical inputs is how people send the wrong thing to the wrong
                place, so the text is written once and the button says where it goes:
                the channel, or the agent. */}
            <div className="bd">
              {replyTo ? (
                <div className="sub" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="chip">↩ Replying to {replyTo.from}</span>
                  <button className="linkish" type="button" onClick={() => setReplyTo(null)}>cancel</button>
                </div>
              ) : null}
              <form className="askbox" onSubmit={(e) => { e.preventDefault(); if (canSend) send(); }}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
              placeholder={canSend ? `Message the ${data.company} channel…` : 'Ask the assistant about this thread…'}
              aria-label={canSend ? 'Message the deal channel or ask the assistant' : 'Ask about this thread'}
                />
                {canSend ? (
                  <button className="btn primary" type="button" disabled={!draft.trim() || sending} onClick={send}>
                    {sending ? 'Sending…' : replyTo ? 'Reply in Teams' : 'Send to Teams'}
                  </button>
                ) : null}
                <button
                  className={canSend ? 'btn' : 'btn primary'}
                  type="button"
                  disabled={!draft.trim() || sending}
                  onClick={() => { onAsk?.(`In the ${thread.anchor} thread on ${data.company}: ${draft.trim()}`); setDraft(''); }}
                >
                  Ask the assistant
                </button>
              </form>
              <div className="sub" style={{ marginTop: 6 }}>
                {canSend
                    ? 'Send to Teams posts as you — it lands in the channel under your name, with the same audit trail, retention and eDiscovery treatment as if you had typed it in Teams. The Deal Room never posts as itself. Ask the assistant keeps the question here.'
                  : sendBlockedReason
                      ? `You can read this thread but not post to it: ${sendBlockedReason} Ask the assistant keeps the question in the Deal Room.`
                      : 'You can read this thread but not post to it. Ask the assistant keeps the question in the Deal Room.'}
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
                      <div style={{ fontWeight: 650, marginBottom: 4 }}>⚡ Follow-up — no task exists</div>
                  <div>{c.headline}</div>
                  <div className="quote">“{c.quote}”</div>
                  <div className="prefill">
                    Owner: <b>{c.owner || c.author}</b> · Due: <b>{c.dueText || 'not stated'}</b>
                      {c.laneLabel ? <> · Workstream: <b>{c.laneLabel}</b></> : null}
                  </div>
                  {canWrite ? (
                    <div className="acts">
                      <button className="btn primary" disabled={busy === c.id} onClick={() => record('task', `${c.headline} (owner ${c.owner || c.author})`, c.id)}>
                        {busy === c.id ? 'Adding…' : '✓ Add to follow-ups'}
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
                <div className="note">Backed by the deal issue log — every request already has an owner, a workstream and a state.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { af } from './authFetch';

// Work IQ — the deal's shared collaboration memory. A specialist saves/shares a
// conclusion from an assistant conversation here; it persists against the deal and is
// injected into LATER conversations (even by another persona), so a diligence decision
// resurfaces in the value-creation run. This panel makes that durable memory visible.

type Note = { id: string; author: string; personaLabel?: string; role?: string; text: string; sharedWith: string[]; createdAt: string };
type CorpusMsg = { from: string; created: string; preview: string };
type Corpus = { channel?: { name: string; messages: CorpusMsg[] } | null; files?: { name: string; summary: string; lastModified: string }[]; mail?: { subject: string; from: string; received: string; preview: string }[] };

const SHARE_OPTIONS: { id: string; label: string }[] = [
  { id: 'partner', label: 'Lead Partner' },
  { id: 'principal', label: 'Principal' },
  { id: 'ai-md', label: 'AI Partner' },
  { id: 'supply-md', label: 'Supply Chain' },
  { id: 'retail-md', label: 'Commercial' },
  { id: 'fund-cfo', label: 'Fund CFO' },
  { id: 'operating-partner', label: 'Operating Partner' },
];
const LABEL_BY_ID = Object.fromEntries(SHARE_OPTIONS.map((o) => [o.id, o.label]));

function ago(iso: string): string {
  const d = new Date(iso).getTime();
  if (!d) return '';
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function WorkIqPanel({ dealId, canWrite, onAsk }: { dealId: string; canWrite: boolean; onAsk?: (prompt: string) => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState('');
  const [share, setShare] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [corpus, setCorpus] = useState<Corpus | null>(null);

  function load() {
    af(`/api/deals/${dealId}/workiq-notes`)
      .then((r) => (r.ok ? r.json() : { notes: [] }))
      .then((d) => setNotes(Array.isArray(d.notes) ? d.notes : []))
      .catch(() => {});
  }
  useEffect(() => { if (dealId) load(); /* eslint-disable-next-line */ }, [dealId]);
  useEffect(() => {
    if (!dealId) { setCorpus(null); return; }
    af(`/api/deals/${dealId}/workiq-corpus`).then((r) => (r.ok ? r.json() : null)).then((d) => setCorpus(d && !d.error ? d : null)).catch(() => {});
  }, [dealId]);

  async function post() {
    if (!text.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      const r = await af(`/api/deals/${dealId}/workiq-notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), sharedWith: share }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); setErr(e.detail || e.error || 'Could not save'); }
      else { setText(''); setShare([]); load(); }
    } catch { setErr('Could not save'); }
    setBusy(false);
  }

  return (
    <>
    <section className="dd-panel wiq">
      <style>{CSS}</style>
      <div className="dd-panel-h">
        <span>Work IQ · shared memory</span>
        <span className="muted">{notes.length ? `${notes.length} note${notes.length > 1 ? 's' : ''} · resurfaces in later chats` : 'notes carry across seats & sessions'}</span>
      </div>

      <div className="wiq-body">
        {notes.length ? notes.map((n) => (
          <div className="wiq-note" key={n.id}>
            <div className="wiq-meta">
              <span className="wiq-who">{n.author}</span>
              {n.personaLabel ? <span className="wiq-seat">{n.personaLabel.split('—')[0].trim()}</span> : null}
              <span className="wiq-time">{ago(n.createdAt)}</span>
            </div>
            <div className="wiq-text">{n.text}</div>
            {n.sharedWith?.length ? (
              <div className="wiq-shared">Shared with {n.sharedWith.map((s) => LABEL_BY_ID[s] || s).join(', ')}</div>
            ) : null}
          </div>
        )) : (
          <div className="muted wiq-empty">No shared notes yet. When a specialist saves a conclusion from an assistant conversation, it lands here and grounds later conversations on this deal — even for a different persona.</div>
        )}

        {canWrite ? (
          <div className="wiq-composer">
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Share a diligence conclusion or hand-off to another seat — it will surface in later conversations on this deal…" rows={3} />
            <div className="wiq-share">
              <span className="muted">Share with:</span>
              {SHARE_OPTIONS.map((o) => (
                <button key={o.id} type="button" className={`wiq-chip${share.includes(o.id) ? ' on' : ''}`} onClick={() => setShare((s) => s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id])}>{o.label}</button>
              ))}
            </div>
            <div className="wiq-actions">
              {err ? <span className="wiq-err">{err}</span> : <span />}
              <button className="chbtn" disabled={busy || !text.trim()} onClick={post}>{busy ? 'Sharing…' : 'Share to Work IQ'}</button>
            </div>
          </div>
        ) : (
          <div className="muted wiq-ro">Read-only — you can see the team's shared memory but not add to it.</div>
        )}
      </div>
    </section>

    {corpus && (corpus.channel || (corpus.files || []).length || (corpus.mail || []).length) ? (
      <section className="dd-panel wiq">
        <div className="dd-panel-h">
          <span>Work IQ · deal corpus</span>
          <span className="muted">Microsoft 365 — Teams · SharePoint · Mail</span>
        </div>
        <div className="wiq-corpus">
          {corpus.channel ? (
            <div className="wiq-cgroup">
              <div className="wiq-ch">Teams channel · {corpus.channel.name}</div>
              {corpus.channel.messages.slice(0, 5).map((m, i) => (
                <div className="wiq-cmsg" key={i}>
                  <div className="wiq-cmeta"><span className="wiq-cwho">{m.from}</span><span className="wiq-ctime">{ago(m.created)}</span></div>
                  <div className="wiq-cprev">{m.preview}</div>
                </div>
              ))}
              {onAsk ? <button type="button" className="wiq-ask" onClick={() => onAsk('Catch me up — use Work IQ to summarise the latest war-room discussion in this deal\u2019s Teams channel.')}>Ask the assistant to summarise this channel ▸</button> : null}
            </div>
          ) : null}
          {(corpus.files || []).length ? (
            <div className="wiq-cgroup">
              <div className="wiq-ch">Data room · files ({corpus.files!.length})</div>
              {corpus.files!.map((f, i) => (
                <button type="button" className="wiq-file wiq-clk" key={i} onClick={() => onAsk?.(`Open the file “${f.name}” via Work IQ and give me its key points and any risks for this deal.`)} disabled={!onAsk}><span className="wiq-fname">{f.name}</span><span className="wiq-fsum">{f.summary}</span></button>
              ))}
            </div>
          ) : null}
          {(corpus.mail || []).length ? (
            <div className="wiq-cgroup">
              <div className="wiq-ch">Mailbox ({corpus.mail!.length})</div>
              {corpus.mail!.map((m, i) => (
                <button type="button" className="wiq-file wiq-clk" key={i} onClick={() => onAsk?.(`Summarise this email for the deal — “${m.subject}” from ${m.from} — and what it means for us.`)} disabled={!onAsk}><span className="wiq-fname">{m.subject}</span><span className="wiq-fsum">{m.from} · {m.preview}</span></button>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    ) : null}
    </>
  );
}

const CSS = `
.wiq .wiq-body { padding: 4px 14px 14px; display: flex; flex-direction: column; gap: 10px; }
.wiq-note { border: 1px solid var(--border, #2a2a35); border-radius: 10px; background: var(--bg, #131318); padding: 9px 12px; }
.wiq-meta { display: flex; align-items: center; gap: 8px; font-size: 11.5px; }
.wiq-who { font-weight: 700; color: var(--fg); }
.wiq-seat { font-size: 10.5px; color: #6cb6ea; border: 1px solid rgba(108,182,234,.4); border-radius: 4px; padding: 0 5px; }
.wiq-time { color: var(--muted); margin-left: auto; }
.wiq-text { font-size: 12.5px; line-height: 1.45; color: var(--fg); margin-top: 4px; white-space: pre-wrap; }
.wiq-shared { font-size: 11px; color: var(--muted); margin-top: 5px; }
.wiq-empty, .wiq-ro { font-size: 12px; line-height: 1.45; padding: 4px 0; }
.wiq-composer { border-top: 1px solid var(--border, #23232c); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.wiq-composer textarea { width: 100%; box-sizing: border-box; resize: vertical; font: inherit; font-size: 12.5px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: inherit; }
.wiq-share { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11.5px; }
.wiq-chip { font: inherit; font-size: 11px; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--border); background: var(--card); color: var(--muted); cursor: pointer; }
.wiq-chip.on { border-color: var(--accent, #6ea8fe); color: var(--accent, #6ea8fe); }
.wiq-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.wiq-err { color: #f99; font-size: 12px; }
.wiq-corpus { padding: 6px 14px 14px; display: flex; flex-direction: column; gap: 12px; }
.wiq-cgroup { display: flex; flex-direction: column; gap: 6px; }
.wiq-ch { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 700; }
.wiq-cmsg { border-left: 2px solid var(--border, #2a2a35); padding: 2px 0 2px 10px; }
.wiq-cmeta { display: flex; align-items: center; gap: 8px; font-size: 11.5px; }
.wiq-cwho { font-weight: 700; color: var(--fg); }
.wiq-ctime { color: var(--muted); }
.wiq-cprev { font-size: 12px; color: var(--fg); line-height: 1.4; margin-top: 1px; }
.wiq-file { display: flex; flex-direction: column; gap: 1px; border: 1px solid var(--border, #2a2a35); border-radius: 8px; background: var(--bg, #131318); padding: 7px 10px; }
.wiq-clk { cursor: pointer; text-align: left; font: inherit; color: inherit; width: 100%; }
.wiq-clk:hover:not(:disabled) { border-color: var(--accent, #6ea8fe); }
.wiq-clk:disabled { cursor: default; }
.wiq-ask { margin-top: 4px; align-self: flex-start; font: inherit; font-size: 11.5px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--card); color: var(--accent, #6ea8fe); cursor: pointer; }
.wiq-ask:hover { border-color: var(--accent, #6ea8fe); }
.wiq-fname { font-size: 12.5px; font-weight: 600; color: var(--fg); }
.wiq-fsum { font-size: 11.5px; color: var(--muted); line-height: 1.4; }
`;

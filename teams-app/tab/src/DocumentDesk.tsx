import { useEffect, useMemo, useState } from 'react';
import { af } from './authFetch';
import { Tag, ago } from './deskUi';
import DocOpenButton from './DocOpenButton';
import { type DocOpen } from './docOpen';

// Documents — the deal's paper, ordered by what moved rather than by folder.
//
// The unlock is the change briefing: someone returning to a deal does not want a
// file list, they want the three documents that changed and the one sentence
// that explains why it matters. Under that sits gap detection, which is not a
// guess — it reads the produces[] list already declared on each flow step, so
// "what should exist by now" is derived from the process definition itself.

type Doc = {
  id: string; name: string; kind: string; sensitivity: string; summary: string;
  lastModified?: string | null; webUrl?: string | null; changed?: boolean; live?: boolean;
  delta?: string; deltaTone?: string; author?: string; basis?: string;
  open?: DocOpen;
};
type Desk = {
  company: string; stageName?: string | null; since?: string | null; canWrite?: boolean;
  dataRoomUrl?: string | null;
  changed: Doc[]; docs: Doc[];
  comments: { id: string; blocking: boolean; doc: string; ref: string; author: string; text: string; webUrl?: string | null }[];
  counts: { docs: number; models: number; legal: number; icPack: number; openComments: number; blockingComments: number };
  gaps: { artefact: string; step: string; stepKey: string; owner: string }[];
  gapBasis: string;
};

type Filter = 'all' | 'Model' | 'Legal' | 'IC pack';

const ICON: Record<string, string> = { Model: '📊', Legal: '⚖', 'IC pack': '📋', Document: '📄' };
const SENS: Record<string, string> = { Restricted: 'bad', Confidential: 'warn', Internal: '' };

export default function DocumentDesk({
  dealId, onAsk,
}: { dealId: string; onAsk?: (q: string) => void }) {
  const [data, setData] = useState<Desk | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  // 403/404 from this route means "withheld", not "empty". A partner read
  // "Documents are unavailable for this deal" as "this deal has no documents" and
  // went off to chase the deal team for files that were sitting there all along.
  const [denied, setDenied] = useState(false);

  async function load() {
    setLoading(true);
    const x = await af(`/api/deals/${dealId}/doc-desk`).catch(() => null);
    setDenied(!!x && (x.status === 403 || x.status === 404));
    const r = x && x.ok ? await x.json().catch(() => null) : null;
    setData(r);
    setLoading(false);
  }

  useEffect(() => { setFilter('all'); setQ(''); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dealId]);

  const docs = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.docs
      .filter((d) => (filter === 'all' ? true : d.kind === filter))
      .filter((d) => (!term ? true : `${d.name} ${d.summary}`.toLowerCase().includes(term)));
  }, [data, filter, q]);

  if (loading) return <div className="card"><div className="bd muted">Reading the deal room…</div></div>;
  if (!data) return <div className="card"><div className="bd muted">{denied ? 'You do not have access to the documents on this deal. They exist — you are not cleared for them. Ask the deal lead to add you to the deal team.' : 'The documents on this deal could not be loaded just now. Try again in a moment.'}</div></div>;

  const canWrite = !!data.canWrite;
  const FILTERS: [Filter, string, number][] = [
    ['all', 'All', data.counts.docs], ['Model', 'Models', data.counts.models],
    ['Legal', 'Legal', data.counts.legal], ['IC pack', 'IC pack', data.counts.icPack],
  ];

  return (
    <div className="grid g2">
      <div style={{ minWidth: 0 }}>

        {note ? <div className="dd-actionnote">{note}</div> : null}

        {/* ---------------- Change briefing ---------------- */}
        <div className="card aicard">
          <div className="hd">
            <span className="aibadge">✦ AI</span>
            <h3>Change briefing</h3>
            <Tag kind="new" />
            <span className="spacer" />
            <button className="btn link compact" onClick={load}>↻ Refresh</button>
          </div>
          <div className="bd">
            <div className="sub" style={{ marginBottom: 8 }}>
              {data.changed.length
                ? `${data.changed.length} document${data.changed.length === 1 ? '' : 's'} changed since ${ago(data.since)}`
                : 'Nothing has changed since your last visit.'}
            </div>
            {data.changed.map((d) => (
              <div className="chg" key={d.id}>
                <span className="ic">{ICON[d.kind] || '📄'}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="k">{d.name}</div>
                  <div className="sub">{d.author || 'unknown author'} · {ago(d.lastModified)}</div>
                  {d.delta ? <div className={`delta ${d.deltaTone || 'warn'}`}>{d.delta}</div> : null}
                  {d.basis ? <div className="sub" style={{ marginTop: 4 }}>{d.basis}</div> : null}
                  <div className="acts">
                    <DocOpenButton dealId={dealId} name={d.name} open={d.open} onNote={setNote} dataRoomUrl={data.dataRoomUrl} />
                    <button className="btn compact" onClick={() => onAsk?.(`Summarise what changed in ${d.name} on ${data.company}.`)}>✦ Summarise</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ---------------- Document grid ---------------- */}
        <div className="card">
          <div className="hd">
            <h3>Deal documents</h3>
            <Tag kind="ext" />
            <span className="spacer" />
            {data.dataRoomUrl ? <a className="btn compact" href={data.dataRoomUrl} target="_blank" rel="noreferrer">Open the data room ↗</a> : null}
            <span className="chip">{data.counts.docs}</span>
          </div>
          <div className="searchrow">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents…" aria-label="Search documents" />
            <div className="pills">
              {FILTERS.map(([k, label, n]) => (
                <button key={k} className={`pillbtn${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>{label} ({n})</button>
              ))}
            </div>
          </div>
          <div className="bd">
            {docs.length === 0 ? <div className="muted">No documents match.</div> : (
              <div className="docgrid">
                {docs.map((d) => (
                  <div className="doc" key={d.id}>
                    <div className="t">
                      <span className="ic">{ICON[d.kind] || '📄'}</span>
                      <span className="k">{d.name}</span>
                    </div>
                    <div className="att-l">
                      <span className={`chip ${SENS[d.sensitivity] || ''}`}>{d.sensitivity}</span>
                      {d.changed ? <span className="chip warn">Changed</span> : <span className="chip good">Current</span>}
                      {d.live ? <span className="chip">SharePoint</span> : null}
                    </div>
                    <div className="sub" style={{ marginTop: 6 }}>{d.summary}</div>
                    <div className="sub" style={{ marginTop: 4 }}>Modified {ago(d.lastModified)}</div>
                    <div className="acts">
                      <DocOpenButton dealId={dealId} name={d.name} open={d.open} onNote={setNote} dataRoomUrl={data.dataRoomUrl} />
                      <button className="btn compact" onClick={() => onAsk?.(`What does ${d.name} tell us about ${data.company}?`)}>✦ Ask about this</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- Right rail ---------------- */}
      <div style={{ minWidth: 0 }}>
        <div className="card">
          <div className="hd">
            <h3>💬 Open review comments</h3>
            <Tag kind="new" />
            <span className="spacer" />
            <span className={`chip ${data.counts.blockingComments ? 'bad' : ''}`}>
              {data.counts.openComments} open{data.counts.blockingComments ? ` · ${data.counts.blockingComments} blocking` : ''}
            </span>
          </div>
          <div className="bd">
            {data.comments.length === 0 ? <div className="muted">No open review comments.</div> : data.comments.map((c) => (
              <div className="cmt" key={c.id}>
                <div className="att-t">
                  <span className={`chip ${c.blocking ? 'bad' : 'warn'}`}>{c.blocking ? 'Blocking' : 'Needs review'}</span>
                  <span className="name">{c.doc} § {c.ref}</span>
                </div>
                <div className="quote">“{c.text}”</div>
                <div className="sub">{c.author}</div>
                {c.webUrl ? <a className="dashlink" href={c.webUrl} target="_blank" rel="noreferrer">Open in document →</a> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="card aicard">
          <div className="hd"><span className="aibadge">✦ AI</span><h3>Document gap detection</h3><Tag kind="ext" /></div>
          <div className="bd">
            <div className="sub" style={{ marginBottom: 8 }}>
              Expected at <b>{data.stageName}</b> — not yet in the room:
            </div>
            {data.gaps.length === 0 ? <div className="muted">Nothing expected at this stage is missing.</div> : data.gaps.map((g, i) => (
              <div className="gap" key={i}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="k">{g.artefact}</div>
                  <div className="sub">{g.step} · owner {g.owner}</div>
                </div>
                {canWrite ? (
                  <button className="btn compact" onClick={() => onAsk?.(`Draft ${g.artefact} for ${data.company} (${g.step}).`)}>+ Create</button>
                ) : null}
              </div>
            ))}
            <div className="note">{data.gapBasis}</div>
          </div>
        </div>

        {canWrite ? (
          <div className="card">
            <div className="hd"><h3>📦 Evidence packaging</h3><Tag kind="new" /></div>
            <div className="bd">
              <div className="acts">
                {[['📊 For IC', 'the Investment Committee'], ['⚖ For Legal', 'legal counsel'], ['🔒 For Compliance', 'compliance'], ['👤 For LP', 'an LP']].map(([label, who]) => (
                  <button key={label} className="btn" onClick={() => onAsk?.(`Package the current evidence on ${data.company} for ${who}.`)}>{label}</button>
                ))}
              </div>
              <div className="sub" style={{ marginTop: 8 }}>Assembles the cited evidence already on the deal — nothing new is generated.</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

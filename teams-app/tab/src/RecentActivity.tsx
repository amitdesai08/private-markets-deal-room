import { useEffect, useMemo, useState } from 'react';
import { af } from './authFetch';
import { ago } from './deskUi';

// Everything that has happened on this deal in Microsoft 365 — email, chat and
// files — in one list.
//
// This is the panel the rest of the product was missing. The material was all
// here already, but split across three tabs, with the email not shown anywhere,
// so "what's happened on Meridian this week" meant opening three tabs and then
// Outlook. Merged and ordered by time, it answers that in one glance, and every
// row opens the real thing in the real app rather than a copy of it.
//
// Two things it will not do: invent an item, or offer an "Open" that opens
// nothing. Rows we composed for you say so, and only rows Microsoft 365 gave us
// a link for get a link.

type Item = {
  id: string; kind: 'email' | 'message' | 'file';
  title: string; who?: string | null; when?: string | null;
  preview?: string; url?: string | null; live?: boolean; forMe?: boolean;
};
type Feed = {
  company?: string | null;
  items: Item[];
  counts: { email: number; message: number; file: number; forMe: number; live: number };
  live: { channel: boolean; files: boolean; mail: boolean };
  delegated?: boolean;
  channelLinked?: boolean;
  dataRoomUrl?: string | null;
};

type Filter = 'all' | 'email' | 'message' | 'file' | 'mine';

const ICON: Record<Item['kind'], string> = { email: '✉️', message: '💬', file: '📄' };
const OPEN: Record<Item['kind'], string> = { email: 'Open in Outlook', message: 'Open in Teams', file: 'Open document' };
const NOUN: Record<Item['kind'], string> = { email: 'Email', message: 'Chat', file: 'File' };

export default function RecentActivity({
  dealId, compact = false, onAsk, onOpenTab,
}: {
  dealId: string;
  compact?: boolean;
  onAsk?: (q: string) => void;
  onOpenTab?: (tab: 'threads' | 'docdesk') => void;
}) {
  const [data, setData] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFilter('all');
    setExpanded(false);
    af(`/api/deals/${dealId}/recent`)
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null)
      .then((r) => { if (live) { setData(r); setLoading(false); } });
    return () => { live = false; };
  }, [dealId]);

  const items = useMemo(() => {
    const all = data?.items || [];
    if (filter === 'all') return all;
    if (filter === 'mine') return all.filter((i) => i.forMe);
    return all.filter((i) => i.kind === filter);
  }, [data, filter]);

  const shown = compact && !expanded ? items.slice(0, 4) : items;

  if (loading) return <div className="card"><div className="bd muted">Gathering this deal's email, chat and files…</div></div>;
  if (!data || !data.items.length) {
    return (
      <div className="card">
        <div className="bd muted">
          Nothing has come through on this deal yet — no email, no channel messages and no files.
        </div>
      </div>
    );
  }

  const c = data.counts;
  // Say plainly where this came from. Claiming a mailbox was read when it was not
  // is the one failure this panel cannot recover from.
  const anyLive = data.live.channel || data.live.files || data.live.mail;
  const provenance = anyLive
    ? `Read from Microsoft 365 as you${data.live.mail ? '' : ' — your mailbox was not included'}.`
    : data.delegated
      ? 'Microsoft 365 returned nothing for this deal, so this is put together from the deal record.'
      : 'Put together from the deal record. Sign in to Microsoft 365 in Teams to see your own email, chat and files here.';

  return (
    <div className="card">
      <div className="hd" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>📥 Recent activity</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {([
            ['all', `All ${data.items.length}`],
            ['email', `✉️ ${c.email}`],
            ['message', `💬 ${c.message}`],
            ['file', `📄 ${c.file}`],
            ...(c.forMe ? [['mine', `For you ${c.forMe}`]] as [Filter, string][] : []),
          ] as [Filter, string][]).map(([k, label]) => (
            <button
              key={k}
              className="chbtn"
              style={filter === k
                ? { fontSize: 12, padding: '3px 9px', background: 'var(--accent)', color: 'var(--accent-fg)' }
                : { fontSize: 12, padding: '3px 9px' }}
              onClick={() => setFilter(k)}
            >{label}</button>
          ))}
        </div>
      </div>
      <div className="bd" style={{ display: 'grid', gap: 8 }}>
        {shown.length === 0 ? (
          <div className="muted">Nothing of that kind on this deal.</div>
        ) : shown.map((it) => (
          <div
            key={it.id}
            style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 11px',
              borderRadius: 9, border: '1px solid var(--border)',
              background: it.forMe ? 'var(--chip)' : 'var(--card)',
            }}
          >
            <span style={{ fontSize: 15, lineHeight: '18px' }} title={NOUN[it.kind]}>{ICON[it.kind]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{it.title}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>
                {[it.who, it.when ? ago(it.when) : null].filter(Boolean).join(' · ')}
                {it.forMe ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}> · for you</span> : null}
                {it.live ? null : <span title="Composed from the deal record rather than read from Microsoft 365."> · from the deal record</span>}
              </div>
              {it.preview ? <div style={{ fontSize: 12, marginTop: 4, color: 'var(--muted)' }}>{it.preview}</div> : null}
            </div>
            <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
              {it.url ? (
                <a className="btn compact" href={it.url} target="_blank" rel="noreferrer">{OPEN[it.kind]} ↗</a>
              ) : it.kind === 'file' && data.dataRoomUrl ? (
                <a className="btn compact" href={data.dataRoomUrl} target="_blank" rel="noreferrer">Open the data room ↗</a>
              ) : onOpenTab && it.kind !== 'email' ? (
                <button className="chbtn" style={{ fontSize: 12 }} onClick={() => onOpenTab(it.kind === 'message' ? 'threads' : 'docdesk')}>Open ▸</button>
              ) : null}
              {onAsk ? (
                <button
                  className="chbtn"
                  style={{ fontSize: 12 }}
                  title="Ask about this"
                  onClick={() => onAsk(`What do I need to know about "${it.title}" on ${data.company || 'this deal'}, and what should I do about it?`)}
                >💬</button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="bd muted" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 11.5, borderTop: '1px solid var(--border)' }}>
        <span>{provenance}</span>
        {compact && items.length > shown.length ? (
          <button className="chbtn" style={{ fontSize: 12, marginLeft: 'auto' }} onClick={() => setExpanded(true)}>
            Show all {items.length} ▾
          </button>
        ) : null}
      </div>
    </div>
  );
}

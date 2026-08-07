// WHAT ARRIVED WHILE YOU WERE ELSEWHERE.
//
// The product could describe the state of every deal and never told anyone when one of
// them became their problem. A deal clears screening and lands on the deal team, a paper
// is assembled and the committee is now waiting, a lane you own starts blocking a deal
// with a date on it — each of those was only discoverable by going to look for it.
//
// "Read" is held here, in the reader's own browser, against the timestamps the server
// computes from the record. There is no read state on the server to fall out of step with
// anything, and two people looking at the same deal are told the same thing.
import { useEffect, useMemo, useRef, useState } from 'react';

type Item = {
  id: string; dealId: string; company: string; kind: 'stage' | 'needs-you' | 'decision';
  headline: string; detail?: string | null; when: string; basis?: string;
};
type Tray = { items: Item[]; total: number; unread: number; restricted?: number; restrictedNote?: string | null };

const SEEN_KEY = 'dr.notifications.seen';
const ICON: Record<string, string> = { stage: '→', 'needs-you': '!', decision: '✓' };
const LABEL: Record<string, string> = { stage: 'Reached your stage', 'needs-you': 'Waiting on you', decision: 'Decision' };

function ago(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export default function Notifications({ af, onOpenDeal, viewAs }: {
  af: (u: string, o?: RequestInit) => Promise<Response>;
  onOpenDeal: (dealId: string) => void;
  viewAs?: string;
}) {
  const [tray, setTray] = useState<Tray | null>(null);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string | null>(() => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } });
  const boxRef = useRef<HTMLDivElement>(null);

  // Re-read when the seat changes: a tray is only meaningful for the person holding it,
  // and switching seats must not leave the previous person's items on screen.
  useEffect(() => {
    let live = true;
    setTray(null);
    const load = () => {
      af(`/api/notifications${seen ? `?since=${encodeURIComponent(seen)}` : ''}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (live && d) setTray(d); })
        .catch(() => { /* the tray is never the reason a page fails */ });
    };
    load();
    const t = setInterval(load, 120000);
    return () => { live = false; clearInterval(t); };
  }, [viewAs, seen]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const unread = tray?.unread ?? 0;
  const grouped = useMemo(() => {
    const items = tray?.items || [];
    const t = seen ? new Date(seen).getTime() : 0;
    return items.map((i) => ({ ...i, isNew: !t || new Date(i.when).getTime() > t }));
  }, [tray, seen]);

  function markSeen() {
    const now = new Date().toISOString();
    try { localStorage.setItem(SEEN_KEY, now); } catch { /* storage blocked */ }
    setSeen(now);
  }

  return (
    <div className="notif" ref={boxRef}>
      <button
        className={`gearbtn${open ? ' on' : ''}`}
        onClick={() => { setOpen((v) => !v); }}
        aria-label={unread ? `${unread} new notifications` : 'Notifications'}
        title={unread ? `${unread} new` : 'Nothing new'}
      >
        🔔{unread ? <span className="notif-dot">{unread > 9 ? '9+' : unread}</span> : null}
      </button>
      {open ? (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <span className="notif-title">What&apos;s arrived</span>
            {unread ? <button className="btn ghost xs" onClick={markSeen}>Mark all as read</button> : null}
          </div>
          {tray === null ? (
            <div className="notif-empty">Checking…</div>
          ) : !grouped.length ? (
            // "Nothing new" and "nothing is happening" are different sentences, and a tray
            // that says the second when it means the first is how people stop trusting it.
            <div className="notif-empty">
              Nothing has arrived at your desk. This shows deals that reach your stage, a
              decision recorded on one, and any workstream you own that is holding a deal up.
            </div>
          ) : (
            <div className="notif-list">
              {grouped.map((i) => (
                <button
                  key={i.id}
                  className={`notif-item${i.isNew ? ' is-new' : ''}`}
                  onClick={() => { onOpenDeal(i.dealId); setOpen(false); markSeen(); }}
                >
                  <span className={`notif-kind k-${i.kind}`} title={LABEL[i.kind] || ''}>{ICON[i.kind] || '•'}</span>
                  <span className="notif-body">
                    <span className="notif-line">{i.headline}</span>
                    <span className="notif-sub">{[i.detail, ago(i.when)].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {/* Same rule as every other count in the product: a number computed only over
              what you can see, presented as if it were everything, is a lie of omission. */}
          {tray?.restrictedNote ? <div className="notif-foot">{tray.restrictedNote}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

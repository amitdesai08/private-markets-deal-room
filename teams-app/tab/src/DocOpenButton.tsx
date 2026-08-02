import { useState } from 'react';
import { downloadGeneratedDoc, fetchDocBrief, type DocOpen, type DocBrief } from './docOpen';

// The control that makes a document name in this product open the document.
//
// One button, three behaviours, decided by the server from evidence rather than
// guessed here:
//
//   external — Microsoft 365 holds the real file. Go there.
//   generate — the platform can write this document from the live deal record.
//              Build it and hand it over; it is a real .docx / .xlsx / .pptx and it
//              is current by construction.
//   brief    — the file lives outside the platform. Show what the deal record
//              genuinely holds about it, and say where the real one is.
//
// The third case is the one worth defending. The tempting design is to hide the
// button when we cannot open something, but then half the documents on screen stay
// dead and the person still has to go looking without knowing where. Saying "here
// is what we know, and the file itself is in the data room" is a smaller promise
// that is actually kept.

// Findings carry severity in two vocabularies depending on where they were authored
// — high/medium/low alongside positive/caution/negative. Both are mapped so a real
// finding never renders as an unstyled chip.
const SEV_TONE: Record<string, string> = {
  positive: 'good', low: 'good',
  caution: 'warn', medium: 'warn',
  negative: 'bad', high: 'bad',
};

export default function DocOpenButton({
  dealId, name, open, compact = false, onNote,
}: {
  dealId: string;
  name: string;
  open?: DocOpen;
  compact?: boolean;
  onNote?: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState<DocBrief | null>(null);
  const [showing, setShowing] = useState(false);

  if (!open) return null;
  const cls = compact ? 'chbtn' : 'btn compact';

  if (open.mode === 'external') {
    return <a className={cls} href={open.url} target="_blank" rel="noreferrer" title={open.reason}>Open ↗</a>;
  }

  if (open.mode === 'generate') {
    return (
      <button
        className={cls}
        disabled={busy}
        title={open.reason}
        onClick={async () => {
          setBusy(true);
          const r = await downloadGeneratedDoc(dealId, open.kind);
          setBusy(false);
          if (!r.ok && r.error) onNote?.(r.error);
        }}
      >{busy ? 'Opening…' : `${open.label} ↗`}</button>
    );
  }

  return (
    <>
      <button
        className={cls}
        disabled={busy}
        title={open.reason}
        onClick={async () => {
          setBusy(true);
          const b = await fetchDocBrief(dealId, name);
          setBusy(false);
          if (!b) { onNote?.('Nothing further is recorded about that document.'); return; }
          setBrief(b);
          setShowing(true);
        }}
      >{busy ? 'Opening…' : open.label}</button>

      {showing && brief ? (
        <div
          className="drawer-scrim"
          onClick={() => setShowing(false)}
          style={{ alignItems: 'center' }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(680px, 94vw)', maxHeight: '82vh', overflowY: 'auto', margin: 'auto' }}
          >
            <div className="hd">
              <h3 style={{ margin: 0, minWidth: 0 }}>📄 {brief.name}</h3>
              <span className="spacer" />
              <button className="btn compact" onClick={() => setShowing(false)}>Close</button>
            </div>
            <div className="bd" style={{ display: 'grid', gap: 12 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                This document is held outside the platform, so this is what the deal record says about it — not a copy of it.
              </div>

              {brief.summary ? <div style={{ fontSize: 13 }}>{brief.summary}</div> : null}

              {brief.owner || brief.lane ? (
                <div style={{ fontSize: 12.5 }}>
                  <span className="muted">Workstream: </span>
                  {[brief.lane, brief.owner].filter(Boolean).join(' · ')}
                </div>
              ) : null}

              <div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                  What diligence has found against it
                </div>
                {brief.findings.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    Nothing in the diligence findings refers to this document yet.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {brief.findings.map((f, i) => (
                      <div key={i} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12.5 }}>{f.text}</div>
                        <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                          <span className={`chip ${SEV_TONE[String(f.severity)] || ''}`}>{f.severity || 'note'}</span>
                          {' · '}{f.basis}{f.source ? ` · ${f.source}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {brief.dataRoomUrl ? (
                <a className="btn compact" href={brief.dataRoomUrl} target="_blank" rel="noreferrer" style={{ justifySelf: 'start' }}>
                  Open the data room ↗
                </a>
              ) : (
                <div className="muted" style={{ fontSize: 12 }}>
                  This deal has no shared data room yet, so there is nowhere to send you for the file itself.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

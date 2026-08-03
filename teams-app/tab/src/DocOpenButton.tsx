import { useEffect, useState } from 'react';
import { useModalKeys } from './useModalKeys';
import { downloadGeneratedDoc, downloadDocBrief, openDocBriefPdf, type DocOpen } from './docOpen';

// The control that makes a document name in this product open the document.
//
// One button, three behaviours, decided by the server from evidence rather than
// guessed here:
//
//   external — Microsoft 365 holds the real file. Go there. Any format: Microsoft
//              365 renders a PDF in the browser exactly as it does a Word document,
//              so nothing here turns on the extension.
//   generate — the platform can write this document from the live deal record.
//              Build it and hand it over; it is a real .docx / .xlsx / .pptx and it
//              is current by construction.
//   brief    — nobody has shared the original with us. Build a PDF of everything the
//              deal record holds against that name and render it here, in place.
//
// The third case is the one worth defending. The tempting design is to hide the
// button when we cannot open the file itself, but then most of the documents on
// screen are inert, the list looks half-built, and the person goes back to hunting
// through email for the attachment — which is the exact chasing about this product
// exists to remove.
//
// It is a PDF and not a panel of fields because a PDF is a document: it renders
// natively in the browser and in Teams, it reads like the thing it describes, and it
// can be saved or forwarded without the platform being involved. The first line of
// it says plainly that it is not the original.

export default function DocOpenButton({
  dealId, name, open, compact = false, onNote, dataRoomUrl,
}: {
  dealId: string;
  name: string;
  open?: DocOpen;
  compact?: boolean;
  onNote?: (msg: string) => void;
  dataRoomUrl?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdf, setPdf] = useState<string | null>(null);

  // A blob URL is a live handle on memory, so it is released when the reader closes
  // and again if this control ever unmounts with one still open.
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf); }, [pdf]);
  const close = () => { if (pdf) URL.revokeObjectURL(pdf); setPdf(null); };
  // Only armed while the preview is on screen — this component renders a plain button
  // the rest of the time, and Escape must not be swallowed then.
  const panelRef = useModalKeys(close, !!pdf);

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
          const r = await openDocBriefPdf(dealId, name);
          setBusy(false);
          if (!r.url) { onNote?.(r.error || 'Could not open that document.'); return; }
          setPdf(r.url);
        }}
      >{busy ? 'Opening…' : open.label}</button>

      {pdf ? (
        <div className="drawer-scrim" onClick={close} style={{ alignItems: 'center' }}>
          {/* Escape closes it and Tab stays inside it, as in every other Teams dialog. */}
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            ref={panelRef as React.RefObject<HTMLDivElement>}
            role="dialog"
            aria-modal="true"
            aria-label="Document preview"
            tabIndex={-1}
            style={{ width: 'min(940px, 96vw)', height: '90vh', margin: 'auto', display: 'flex', flexDirection: 'column' }}
          >
            <div className="hd">
              <h3 style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📄 {name}
              </h3>
              <span className="spacer" />
              <a className="btn compact" href={pdf} target="_blank" rel="noreferrer">Full screen ↗</a>
              <button
                className="btn compact"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  const r = await downloadDocBrief(dealId, name);
                  setSaving(false);
                  if (!r.ok && r.error) onNote?.(r.error);
                }}
              >{saving ? 'Preparing…' : 'Save as Word'}</button>
              {dataRoomUrl ? (
                <a className="btn compact" href={dataRoomUrl} target="_blank" rel="noreferrer">Data room ↗</a>
              ) : null}
              <button className="btn compact" onClick={close}>Close</button>
            </div>
            <iframe
              title={name}
              src={pdf}
              style={{ flex: 1, width: '100%', border: 0, borderRadius: '0 0 10px 10px', background: '#525659' }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

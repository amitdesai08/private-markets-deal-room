import { af } from './authFetch';
import { getSsoToken } from './teams';

// Opening a document from wherever its name appears.
//
// The platform can write four documents from the live deal record — the IC memo,
// the IC deck, the returns model and the deal model. They were only reachable from
// a separate export screen, so the memo listed in the data room and the memo the
// product could write for you were two unrelated things on two different tabs.
// This is the shared path that lets any surface offer the real file.
//
// It is a generate-then-open, not a fetch: the document is written from the record
// at the moment you ask for it, which is why it can never be the stale copy someone
// saved last month.

export type DocKind = 'ic-memo' | 'model' | 'returns' | 'ic-deck';

const FALLBACK_NAME: Record<DocKind, string> = {
  'ic-memo': 'IC Memo.docx',
  'ic-deck': 'IC Deck.pptx',
  returns: 'Returns Model.xlsx',
  model: 'Deal Model.xlsx',
};

/**
 * Build the document and hand it to the browser.
 *
 * Returns a message on failure rather than throwing, because every caller is a
 * button and a button needs something to say.
 */
export async function downloadGeneratedDoc(
  dealId: string,
  kind: DocKind,
  live = false,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sso = await getSsoToken();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (sso) headers['authorization'] = `Bearer ${sso}`;
    const r = await af(`/api/deals/${dealId}/documents/${kind}?dest=download${live ? '&live=1' : ''}`, {
      method: 'POST', headers, body: '{}',
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({} as any));
      return { ok: false, error: d?.reason || d?.error || 'Could not open the document.' };
    }
    const blob = await r.blob();
    const cd = r.headers.get('content-disposition') || '';
    const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd);
    const name = m ? decodeURIComponent(m[1]) : FALLBACK_NAME[kind];
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(href);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Could not open the document (${String(e?.message || e)}).` };
  }
}

// How a document opens, as the server resolved it. Mirrors app/lib/docOpen.js.
export type DocOpen =
  | { mode: 'external'; url: string; label: string; reason: string }
  | { mode: 'generate'; kind: DocKind; ext: string; label: string; reason: string }
  | { mode: 'brief'; label: string; reason: string };

export type DocBrief = {
  name: string;
  summary?: string | null;
  lane?: string | null;
  owner?: string | null;
  findings: { text: string; severity?: string | null; source?: string | null; basis: string }[];
  dataRoomUrl?: string | null;
};

export async function fetchDocBrief(dealId: string, name: string): Promise<DocBrief | null> {
  return af(`/api/deals/${dealId}/document-brief?name=${encodeURIComponent(name)}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

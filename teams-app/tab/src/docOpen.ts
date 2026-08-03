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

/** Hand a document response to the browser under the name the server gave it. */
async function saveBlob(r: Response, fallback: string) {
  const blob = await r.blob();
  const cd = r.headers.get('content-disposition') || '';
  // Deal document names are full of em dashes, so prefer the encoded form when the
  // server sent one — the plain form is an ASCII flattening of the same name.
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const plain = /filename=["']?([^"';]+)/i.exec(cd);
  let name = fallback;
  try { name = utf8 ? decodeURIComponent(utf8[1]) : plain ? decodeURIComponent(plain[1]) : fallback; } catch { name = plain?.[1] || fallback; }
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(href);
}

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
    await saveBlob(r, FALLBACK_NAME[kind]);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Could not open the document (${String(e?.message || e)}).` };
  }
}

/** The briefing on a document nobody has shared with us, as a Word file. */
export async function downloadDocBrief(dealId: string, name: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await af(`/api/deals/${dealId}/document-brief.docx?name=${encodeURIComponent(name)}`);
    if (!r.ok) return { ok: false, error: 'Could not build the briefing.' };
    await saveBlob(r, 'Document briefing.docx');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Could not build the briefing (${String(e?.message || e)}).` };
  }
}

/**
 * The same briefing as a PDF, ready to render.
 *
 * Fetched rather than linked because the request has to carry the caller's identity,
 * and handed back as an object URL so the browser's own PDF viewer draws it in
 * place. The caller owns the URL and must release it.
 */
export async function openDocBriefPdf(dealId: string, name: string): Promise<{ url?: string; error?: string }> {
  try {
    const r = await af(`/api/deals/${dealId}/document-brief.pdf?name=${encodeURIComponent(name)}`);
    if (!r.ok) {
      const d = await r.json().catch(() => ({} as any));
      return { error: d?.detail || 'That document is not listed on this deal.' };
    }
    const blob = await r.blob();
    return { url: URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: 'application/pdf' })) };
  } catch (e: any) {
    return { error: `Could not open that document (${String(e?.message || e)}).` };
  }
}

// How a document opens, as the server resolved it. Mirrors app/lib/docOpen.js.
export type DocOpen =
  | { mode: 'external'; url: string; label: string; reason: string }
  | { mode: 'generate'; kind: DocKind; ext: string; label: string; reason: string }
  | { mode: 'brief'; label: string; reason: string };

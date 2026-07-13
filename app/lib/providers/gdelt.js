// GDELT — free, keyless global news / event stream (api.gdeltproject.org).
//
// Supplements the news & filings desk with a broad, real, no-key news feed so the
// catalyst classifier has live articles to work on in a demo without a paid news
// provider. Returns recent articles (title, url, domain, date, tone) for a query.

const DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';

export function gdeltConfigured() {
  return true; // free + keyless
}

export async function gdeltNews(query, { max = 12, timespan = '1m' } = {}) {
  const q = String(query || '').trim();
  if (!q) return { found: false, source: 'gdelt', articles: [] };
  const params = new URLSearchParams({ query: q, mode: 'ArtList', maxrecords: String(max), format: 'json', sort: 'DateDesc' });
  if (timespan) params.set('timespan', timespan); // e.g. 1d, 1w, 1m, 3m
  const url = `${DOC_API}?${params.toString()}`;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return { found: false, source: 'gdelt', articles: [] };
    const data = await r.json().catch(() => ({}));
    const articles = (data.articles || []).map((a) => ({
      title: a.title,
      url: a.url,
      domain: a.domain,
      seendate: a.seendate,
      language: a.language,
      tone: typeof a.tone === 'number' ? a.tone : null,
    }));
    return { found: articles.length > 0, source: 'gdelt', articles };
  } catch (err) {
    return { found: false, source: 'gdelt', articles: [], error: String(err?.message || err) };
  }
}

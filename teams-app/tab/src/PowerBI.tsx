// "Deal Room Report" — embeds the real Power BI report published to the fund's
// "Deal Room" workspace (5 pages: Portfolio Overview, Sector & Industry, Pipeline by
// Stage, Deal Value & Valuation, Time-based metrics). It embeds user-owns-data using
// the signed-in user's Power BI token (Teams SSO -> OBO, from /api/powerbi/embed).
//
// The Power BI JS SDK is loaded from CDN on demand (the tab's npm registry is locked
// down, so it isn't bundled). If the token isn't available yet (the Power BI delegated
// permission hasn't been consented, or we're outside Teams) OR the SDK can't load, it
// degrades gracefully to an "Open in Power BI" link plus the native at-a-glance summary.
import { useEffect, useRef, useState } from 'react';
import Report from './Report';
import type { Analytics, Pipeline, Deal, MarketIntel, BackendConfig } from './types';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/powerbi-client@2.23.1/dist/powerbi.min.js';

type EmbedInfo = {
  available: boolean; reportId: string; workspaceId: string; name?: string;
  embedUrl: string; webUrl: string; token?: string; tokenType?: string;
};

let sdkPromise: Promise<any> | null = null;
function loadPowerBiSdk(): Promise<any> {
  const w = window as any;
  if (w.powerbi && w['powerbi-client']) return Promise.resolve(w);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK_URL; s.async = true;
    s.onload = () => resolve(window as any);
    s.onerror = () => reject(new Error('powerbi-sdk-load-failed'));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export default function PowerBI({ ssoToken, analytics, pipeline, deals, market, config, dealId }: {
  ssoToken?: string; analytics: Analytics | null; pipeline: Pipeline | null; deals: Deal[];
  market: MarketIntel | null; config: BackendConfig | null; dealId?: string;
}) {
  const [info, setInfo] = useState<EmbedInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const host = useRef<HTMLDivElement | null>(null);

  // 1) Ask the backend for the embed config + a user-owns-data token (OBO).
  useEffect(() => {
    let live = true;
    fetch('/api/powerbi/embed', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ssoToken: ssoToken || undefined }),
    }).then((r) => r.json()).then((d: EmbedInfo) => { if (live) setInfo(d); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [ssoToken]);

  // 2) When a token is available, load the SDK and embed the report.
  useEffect(() => {
    if (!info?.available || !info.token || !host.current) return;
    let cancelled = false;
    loadPowerBiSdk().then((w) => {
      if (cancelled || !host.current) return;
      const pbi = w.powerbi; const models = w['powerbi-client'].models;
      pbi.reset(host.current);
      pbi.embed(host.current, {
        type: 'report',
        id: info.reportId,
        embedUrl: info.embedUrl,
        accessToken: info.token,
        tokenType: models.TokenType.Aad,
        settings: {
          panes: { filters: { visible: false }, pageNavigation: { visible: true } },
          bars: { statusBar: { visible: false } },
        },
      });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [info]);

  const canEmbed = info?.available && info.token && !failed;

  return (
    <div className="pbi">
      <style>{PBI_CSS}</style>
      <div className="pbi-head">
        <div>
          <div className="pbi-kicker">Power BI · Deal Room workspace</div>
          <h1 className="pbi-title">{info?.name || 'Deal Room Report'}</h1>
        </div>
        {info?.webUrl ? (
          <a className="pbi-open" href={info.webUrl} target="_blank" rel="noopener noreferrer">Open in Power BI ↗</a>
        ) : null}
      </div>

      {canEmbed ? (
        <div className="pbi-frame" ref={host} />
      ) : (
        <>
          {info && !info.available ? (
            <div className="pbi-note">
              Sign-in to Power BI is required to embed the live report here. Use <b>Open in Power BI</b> above to
              view the full interactive report (Portfolio Overview · Sector &amp; Industry · Pipeline by Stage ·
              Deal Value &amp; Valuation · Time-based metrics). The at-a-glance summary below is generated live from
              the Deal Room backend.
            </div>
          ) : (
            <div className="pbi-note">Loading the Power BI report…</div>
          )}
          <Report analytics={analytics} pipeline={pipeline} deals={deals} market={market} config={config} dealId={dealId} />
        </>
      )}
    </div>
  );
}

const PBI_CSS = `
.pbi { display: flex; flex-direction: column; height: 100%; min-height: 100vh; background: #fff; }
.pbi-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 24px; border-bottom: 2px solid #6264A7; }
.pbi-kicker { color: #6264A7; font-weight: 700; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }
.pbi-title { margin: 3px 0 0; font-size: 20px; color: #1b1b1f; }
.pbi-open { flex: 0 0 auto; border: 1px solid #6264A7; background: #6264A7; color: #fff; padding: 8px 14px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px; }
.pbi-open:hover { background: #4f5199; }
.pbi-frame { flex: 1; min-height: 640px; border: none; }
.pbi-frame iframe { border: none; }
.pbi-note { margin: 16px 24px 0; padding: 12px 14px; background: #f2f2fb; border: 1px solid #e0e0f0; border-radius: 8px; color: #333; font-size: 13px; }
`;

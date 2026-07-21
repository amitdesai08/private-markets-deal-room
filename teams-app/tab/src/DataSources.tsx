// The "Data Sources" tab: the config menu for the platform's data connectors.
// Lists every connector from GET /api/connectors grouped by tier (free/open,
// subscription providers, Microsoft 365, not-wired), with a live status pill and
// controls: enable/disable (POST /api/connectors/:id/enable), test connectivity
// (POST /api/connectors/:id/test), and connect/disconnect for OAuth-backed sources.
//
// The free/open sources (SEC EDGAR, GDELT, GLEIF) need no subscription and are on
// by default — this is where a demo turns individual sources on and off.
import { useEffect, useState } from 'react';

type Connector = {
  id: string; name: string; kind: string; provider: string | null; role: string;
  loginUrl: string | null; primaryJob: string; sweetSpot: string;
  free: boolean; enabled: boolean; configured: boolean; testable: boolean;
  connectable: boolean; status: string; latencyMs: number | null;
  lastSync: string | null; message: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  connected: 'Connected', disconnected: 'Not connected', degraded: 'Degraded',
  disabled: 'Disabled', unknown: 'Ready',
};

const TIERS: { key: string; title: string; blurb: string; match: (c: Connector) => boolean }[] = [
  { key: 'free', title: 'Free & open (no subscription)', blurb: 'Keyless public data — on by default for demos.', match: (c) => c.free && c.kind !== 'web' },
  { key: 'web', title: 'Live web search', blurb: 'Bing-grounded Foundry agent (Azure-metered).', match: (c) => c.kind === 'web' },
  { key: 'fabric-agent', title: 'Fabric Data Agent', blurb: 'Natural-language Q&A over the fund\u2019s lakehouse (live or grounded).', match: (c) => c.kind === 'fabric-agent' },
  { key: 'mcp', title: 'Subscription providers', blurb: 'Vendor data over MCP — sign in to connect.', match: (c) => c.kind === 'mcp' },
  { key: 'm365', title: 'Microsoft 365', blurb: 'Delegated Teams / SharePoint / mailbox.', match: (c) => c.kind === 'm365' },
  { key: 'database', title: 'Not wired', blurb: 'Vendor DBs shown for context — no live connection.', match: (c) => c.kind === 'database' },
];

export default function DataSources() {
  const [rows, setRows] = useState<Connector[] | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = () => fetch('/api/connectors').then((r) => (r.ok ? r.json() : [])).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const patch = (id: string, fields: Partial<Connector>) =>
    setRows((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, ...fields } : c)) : prev));
  const setBusyFor = (id: string, v: boolean) => setBusy((b) => ({ ...b, [id]: v }));

  const toggle = async (c: Connector) => {
    const enabled = !c.enabled;
    patch(c.id, { enabled, status: enabled ? 'unknown' : 'disabled', message: null }); // optimistic
    setBusyFor(c.id, true);
    try {
      await fetch(`/api/connectors/${c.id}/enable`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }),
      });
    } catch { /* keep optimistic */ }
    finally { setBusyFor(c.id, false); }
  };

  const test = async (c: Connector) => {
    setBusyFor(c.id, true);
    try {
      const r = await fetch(`/api/connectors/${c.id}/test`, { method: 'POST' });
      const out = await r.json();
      patch(c.id, { status: out.status, latencyMs: out.latencyMs, lastSync: out.lastSync, message: out.message });
    } catch { patch(c.id, { status: 'degraded', message: 'Test failed to run.' }); }
    finally { setBusyFor(c.id, false); }
  };

  const connect = (c: Connector) => {
    const url = c.loginUrl || (c.provider ? `/api/connectors/${c.provider}/login` : null);
    if (url) window.open(url, '_blank', 'noopener');
  };
  const disconnect = async (c: Connector) => {
    setBusyFor(c.id, true);
    try { await fetch(`/api/connectors/${c.id}/disconnect`, { method: 'POST' }); patch(c.id, { status: 'disconnected', message: null }); }
    catch { /* ignore */ }
    finally { setBusyFor(c.id, false); }
  };

  if (!rows) return <div className="ds-wrap"><style>{CSS}</style><p className="ds-empty">Loading data sources…</p></div>;

  const activeFree = rows.filter((c) => c.free && c.enabled).length;
  const freeTotal = rows.filter((c) => c.free).length;

  return (
    <div className="ds-wrap">
      <style>{CSS}</style>
      <div className="ds-head">
        <h2>Data sources</h2>
        <p>
          Configure the connectors that ground the Deal Room. {activeFree}/{freeTotal} free &amp; open sources active —
          no subscription needed. Toggle a source off to exclude it from the demo; sign in to enable a vendor provider.
        </p>
      </div>

      {TIERS.map((tier) => {
        const items = rows.filter(tier.match);
        if (!items.length) return null;
        return (
          <section key={tier.key} className="ds-tier">
            <header className="ds-tier-h">
              <span className="ds-tier-t">{tier.title}</span>
              <span className="ds-tier-b">{tier.blurb}</span>
            </header>
            <div className="ds-grid">
              {items.map((c) => (
                <article key={c.id} className={`ds-card${c.enabled ? '' : ' off'}`}>
                  <div className="ds-card-top">
                    <div className="ds-name">
                      {c.name}
                      {c.free ? <span className="ds-badge free">Free</span> : null}
                      <span className="ds-role">{c.role}</span>
                    </div>
                    <label className="ds-switch" title={c.enabled ? 'Enabled' : 'Disabled'}>
                      <input type="checkbox" checked={c.enabled} disabled={!!busy[c.id]} onChange={() => toggle(c)} />
                      <span className="ds-slider" />
                    </label>
                  </div>
                  <p className="ds-job">{c.primaryJob}</p>
                  <p className="ds-sweet">{c.sweetSpot}</p>
                  <div className="ds-foot">
                    <span className={`ds-pill ${c.status}`}>{STATUS_LABEL[c.status] || c.status}</span>
                    {c.latencyMs != null ? <span className="ds-lat">{c.latencyMs}ms</span> : null}
                    <span className="ds-actions">
                      {c.testable && c.enabled ? (
                        <button className="ds-btn" disabled={!!busy[c.id]} onClick={() => test(c)}>Test</button>
                      ) : null}
                      {c.connectable && c.enabled ? (
                        c.configured
                          ? <button className="ds-btn" disabled={!!busy[c.id]} onClick={() => disconnect(c)}>Disconnect</button>
                          : <button className="ds-btn primary" onClick={() => connect(c)}>Connect</button>
                      ) : null}
                    </span>
                  </div>
                  {c.message ? <p className="ds-msg">{c.message}</p> : null}
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const CSS = `
.ds-wrap { padding: 16px 20px 40px; max-width: 1100px; }
.ds-empty { color: var(--muted); }
.ds-head h2 { margin: 0 0 4px; font-size: 20px; }
.ds-head p { margin: 0 0 18px; color: var(--muted); font-size: 13px; max-width: 760px; line-height: 1.5; }
.ds-tier { margin-bottom: 22px; }
.ds-tier-h { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; border-bottom: 1px solid var(--border, #2a2a35); padding-bottom: 6px; }
.ds-tier-t { font-weight: 600; font-size: 14px; color: var(--fg); }
.ds-tier-b { font-size: 12px; color: var(--muted); }
.ds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.ds-card { border: 1px solid var(--border, #2a2a35); border-radius: 10px; padding: 12px 14px; background: var(--card, #1b1b22); transition: opacity .15s; }
.ds-card.off { opacity: .55; }
.ds-card-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ds-name { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ds-role { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); border: 1px solid var(--border, #2a2a35); border-radius: 4px; padding: 1px 5px; }
.ds-badge.free { font-size: 10px; font-weight: 600; color: #0a6; background: rgba(0,170,102,.14); border-radius: 4px; padding: 1px 6px; }
.ds-job { margin: 8px 0 2px; font-size: 12.5px; color: var(--fg); }
.ds-sweet { margin: 0; font-size: 12px; color: var(--muted); }
.ds-foot { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.ds-lat { font-size: 11px; color: var(--muted); }
.ds-actions { margin-left: auto; display: flex; gap: 6px; }
.ds-btn { border: 1px solid var(--border, #33333f); background: none; color: var(--fg); border-radius: 6px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
.ds-btn:hover:not(:disabled) { border-color: var(--accent, #6ea8fe); color: var(--accent, #6ea8fe); }
.ds-btn:disabled { opacity: .5; cursor: default; }
.ds-btn.primary { border-color: var(--accent, #6ea8fe); color: var(--accent, #6ea8fe); }
.ds-msg { margin: 8px 0 0; font-size: 11.5px; color: var(--muted); line-height: 1.4; }
.ds-pill { font-size: 11px; font-weight: 600; border-radius: 999px; padding: 2px 9px; }
.ds-pill.connected { color: #0a6; background: rgba(0,170,102,.14); }
.ds-pill.disconnected { color: #b98; background: rgba(180,140,120,.14); }
.ds-pill.degraded { color: #d80; background: rgba(221,136,0,.16); }
.ds-pill.disabled { color: var(--muted); background: rgba(140,140,150,.14); }
.ds-pill.unknown { color: #6ea8fe; background: rgba(110,168,254,.14); }
.ds-switch { position: relative; display: inline-block; width: 38px; height: 20px; flex: none; }
.ds-switch input { opacity: 0; width: 0; height: 0; }
.ds-slider { position: absolute; inset: 0; cursor: pointer; background: #444; border-radius: 999px; transition: .15s; }
.ds-slider::before { content: ''; position: absolute; height: 14px; width: 14px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .15s; }
.ds-switch input:checked + .ds-slider { background: var(--accent, #6ea8fe); }
.ds-switch input:checked + .ds-slider::before { transform: translateX(18px); }
.ds-switch input:disabled + .ds-slider { opacity: .6; cursor: default; }
`;

// The "Data Sources" tab: the config menu for the platform's data connectors.
// Lists every connector from GET /api/connectors grouped by tier (free/open,
// subscription providers, Microsoft 365, not-wired), with a live status pill and
// controls: enable/disable (POST /api/connectors/:id/enable), test connectivity
// (POST /api/connectors/:id/test), and connect/disconnect for OAuth-backed sources.
//
// The free/open sources (SEC EDGAR, GDELT, GLEIF) need no subscription and are on
// by default — this is where a demo turns individual sources on and off.
import { useEffect, useState } from 'react';
import { af } from './authFetch';

type Connector = {
  id: string; name: string; kind: string; provider: string | null; role: string;
  loginUrl: string | null; primaryJob: string; sweetSpot: string;
  free: boolean; enabled: boolean; configured: boolean; testable: boolean;
  connectable: boolean; status: string; latencyMs: number | null;
  lastSync: string | null; message: string | null;
  custom?: boolean;
  approved?: boolean;
  freshness?: { status: string; ageMs: number | null; slaMs: number; lastSync: string | null } | null;
  configFields?: { key: string; label: string; placeholder?: string; kind?: string }[] | null;
  config?: Record<string, string>;
};

const STATUS_LABEL: Record<string, string> = {
  connected: 'Connected', disconnected: 'Not connected', degraded: 'Degraded',
  disabled: 'Disabled', unknown: 'Ready', pending: 'Pending approval',
};

const TIERS: { key: string; title: string; blurb: string; match: (c: Connector) => boolean }[] = [
  { key: 'free', title: 'Free & open (no subscription)', blurb: 'Keyless public data — on by default for demos.', match: (c) => c.free && c.kind !== 'web' },
  { key: 'web', title: 'Live web search', blurb: 'Bing-grounded Foundry agent (Azure-metered).', match: (c) => c.kind === 'web' },
  { key: 'fabric-agent', title: 'Fabric Data Agent', blurb: 'Natural-language Q&A over the fund\u2019s lakehouse (live or grounded).', match: (c) => c.kind === 'fabric-agent' },
  { key: 'mcp', title: 'Subscription providers', blurb: 'Vendor data over MCP — sign in to connect.', match: (c) => c.kind === 'mcp' },
  { key: 'm365', title: 'Microsoft 365', blurb: 'Delegated Teams / SharePoint / mailbox.', match: (c) => c.kind === 'm365' },  { key: 'workiq', title: 'Work IQ (M365 work data for agents)', blurb: 'SharePoint files \u00b7 Teams threads \u00b7 mailbox over MCP \u2014 set the endpoint, then connect.', match: (c) => c.kind === 'workiq' },  { key: 'database', title: 'Not wired', blurb: 'Vendor DBs shown for context — no live connection.', match: (c) => c.kind === 'database' },
  { key: 'custom', title: 'Custom sources', blurb: 'Providers your fund added — declared honestly, probed for reachability.', match: (c) => c.kind === 'custom' },
];

export default function DataSources({ isAdmin = false }: { isAdmin?: boolean }) {
  const [rows, setRows] = useState<Connector[] | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  // Local edits for connectors that expose configFields (e.g. the WorkIQ MCP URL).
  const [cfgEdit, setCfgEdit] = useState<Record<string, Record<string, string>>>({});
  // "Add a data source" form (custom providers the fund registers itself).
  const [form, setForm] = useState({ name: '', primaryJob: '', role: 'confirm', endpoint: '' });
  const [addErr, setAddErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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

  const cfgVal = (c: Connector, key: string) => cfgEdit[c.id]?.[key] ?? (c.config?.[key] ?? '');
  const setCfg = (id: string, key: string, val: string) =>
    setCfgEdit((p) => ({ ...p, [id]: { ...(p[id] || {}), [key]: val } }));
  const saveConfig = async (c: Connector) => {
    const config = { ...(c.config || {}), ...(cfgEdit[c.id] || {}) };
    setBusyFor(c.id, true);
    try {
      await fetch(`/api/connectors/${c.id}/config`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config }),
      });
      patch(c.id, { config });
      setCfgEdit((p) => { const n = { ...p }; delete n[c.id]; return n; }); // committed
    } catch { /* keep local edits */ }
    finally { setBusyFor(c.id, false); }
  };

  // Register a custom data source; the backend rejects a name that already exists.
  const addSource = async () => {
    const name = form.name.trim();
    if (!name) { setAddErr('Give the source a name.'); return; }
    setAdding(true); setAddErr(null);
    try {
      const r = await fetch('/api/connectors', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
      });
      if (r.status === 409) { setAddErr(`A source called “${name}” already exists — look for it above.`); return; }
      if (!r.ok) { setAddErr('Could not add that source.'); return; }
      setForm({ name: '', primaryJob: '', role: 'confirm', endpoint: '' });
      await load();
    } catch { setAddErr('Could not add that source.'); }
    finally { setAdding(false); }
  };

  const removeSource = async (c: Connector) => {
    setBusyFor(c.id, true);
    try {
      await fetch(`/api/connectors/${c.id}`, { method: 'DELETE' });
      setRows((prev) => (prev ? prev.filter((x) => x.id !== c.id) : prev));
    } catch { /* ignore */ }
    finally { setBusyFor(c.id, false); }
  };

  // Admin-only: approve a pending custom source for production use (uses af so the
  // caller's identity flows to the server's admin gate).
  const approveSource = async (c: Connector) => {
    setBusyFor(c.id, true);
    try {
      const r = await af(`/api/connectors/${c.id}/approve`, { method: 'POST' });
      if (r.ok) patch(c.id, { approved: true, status: 'unknown', message: null });
      else if (r.status === 403) patch(c.id, { message: 'Only an administrator can approve a data source.' });
    } catch { /* ignore */ }
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

      <div className="ds-add">
        <div className="ds-add-h">
          <span className="ds-add-t">Add a data source</span>
          <span className="ds-add-b">No built-in for your provider (PitchBook, Morningstar Direct, an internal API)? Register it here. New sources start <b>pending</b> until an admin approves them.</span>
        </div>
        <div className="ds-add-grid">
          <input className="ds-cfg-in" placeholder="Name (e.g. PitchBook)" value={form.name} maxLength={60}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input className="ds-cfg-in" placeholder="What it provides (optional)" value={form.primaryJob} maxLength={200}
            onChange={(e) => setForm((f) => ({ ...f, primaryJob: e.target.value }))} />
          <select className="ds-cfg-in" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} title="Where this source fits in sourcing">
            <option value="discover">Discover</option>
            <option value="confirm">Confirm</option>
            <option value="quality">Quality</option>
            <option value="context">Context</option>
          </select>
          <input className="ds-cfg-in" type="url" placeholder="Endpoint / API URL (optional)" value={form.endpoint} spellCheck={false}
            onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))} />
          <button className="ds-btn primary" disabled={adding || !form.name.trim()} onClick={addSource}>{adding ? 'Adding…' : 'Add source'}</button>
        </div>
        {addErr ? <p className="ds-add-err">{addErr}</p> : null}
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
                  {c.configFields?.length ? (
                    <div className="ds-config">
                      {c.configFields.map((f) => {
                        const dirty = cfgEdit[c.id]?.[f.key] !== undefined && cfgEdit[c.id][f.key] !== (c.config?.[f.key] ?? '');
                        return (
                          <label key={f.key} className="ds-cfg-row">
                            <span className="ds-cfg-l">{f.label}</span>
                            <span className="ds-cfg-edit">
                              <input
                                className="ds-cfg-in"
                                type={f.kind === 'url' ? 'url' : 'text'}
                                value={cfgVal(c, f.key)}
                                placeholder={f.placeholder || ''}
                                spellCheck={false}
                                disabled={!!busy[c.id]}
                                onChange={(e) => setCfg(c.id, f.key, e.target.value)}
                              />
                              <button className="ds-btn" disabled={!!busy[c.id] || !dirty} onClick={() => saveConfig(c)}>Save</button>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="ds-foot">
                    <span className={`ds-pill ${c.status}`}>{STATUS_LABEL[c.status] || c.status}</span>
                    {c.freshness?.status === 'stale' ? <span className="ds-pill degraded" title="Older than its freshness SLA — labelled stale and excluded from IC / LP-facing outputs">Stale</span> : null}
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
                      {c.custom && !c.approved && isAdmin ? <button className="ds-btn primary" disabled={!!busy[c.id]} onClick={() => approveSource(c)}>Approve</button> : null}
                      {c.custom ? <button className="ds-btn danger" disabled={!!busy[c.id]} onClick={() => removeSource(c)}>Remove</button> : null}
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
.ds-add { border: 1px dashed var(--border, #33333f); border-radius: 10px; padding: 12px 14px; margin-bottom: 22px; background: var(--card, #1b1b22); }
.ds-add-h { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.ds-add-t { font-weight: 600; font-size: 14px; color: var(--fg); }
.ds-add-b { font-size: 12px; color: var(--muted); }
.ds-add-grid { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(180px, 1.4fr) auto minmax(180px, 1.4fr) auto; gap: 8px; align-items: center; }
@media (max-width: 720px) { .ds-add-grid { grid-template-columns: 1fr 1fr; } }
.ds-add-err { margin: 8px 0 0; font-size: 12px; color: #d80; }
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
.ds-config { margin: 10px 0 2px; display: flex; flex-direction: column; gap: 8px; }
.ds-cfg-row { display: flex; flex-direction: column; gap: 4px; }
.ds-cfg-l { font-size: 11px; color: var(--muted); font-weight: 600; }
.ds-cfg-edit { display: flex; gap: 6px; }
.ds-cfg-in { flex: 1; min-width: 0; background: var(--input-bg, #12121a); color: var(--fg); border: 1px solid var(--border, #2a2a35); border-radius: 6px; padding: 6px 8px; font: inherit; font-size: 12px; }
.ds-cfg-in:focus { outline: none; border-color: var(--accent, #5b8cff); }
.ds-foot { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.ds-lat { font-size: 11px; color: var(--muted); }
.ds-actions { margin-left: auto; display: flex; gap: 6px; }
.ds-btn { border: 1px solid var(--border, #33333f); background: none; color: var(--fg); border-radius: 6px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
.ds-btn:hover:not(:disabled) { border-color: var(--accent, #6ea8fe); color: var(--accent, #6ea8fe); }
.ds-btn:disabled { opacity: .5; cursor: default; }
.ds-btn.primary { border-color: var(--accent, #6ea8fe); color: var(--accent, #6ea8fe); }
.ds-btn.danger { border-color: #b23b3b; color: #d88; }
.ds-btn.danger:hover:not(:disabled) { border-color: #d55; color: #f99; }
.ds-msg { margin: 8px 0 0; font-size: 11.5px; color: var(--muted); line-height: 1.4; }
.ds-pill { font-size: 11px; font-weight: 600; border-radius: 999px; padding: 2px 9px; }
.ds-pill.connected { color: #0a6; background: rgba(0,170,102,.14); }
.ds-pill.disconnected { color: #b98; background: rgba(180,140,120,.14); }
.ds-pill.degraded { color: #d80; background: rgba(221,136,0,.16); }
.ds-pill.disabled { color: var(--muted); background: rgba(140,140,150,.14); }
.ds-pill.pending { color: #d80; background: rgba(221,136,0,.16); }
.ds-pill.unknown { color: #6ea8fe; background: rgba(110,168,254,.14); }
.ds-switch { position: relative; display: inline-block; width: 38px; height: 20px; flex: none; }
.ds-switch input { opacity: 0; width: 0; height: 0; }
.ds-slider { position: absolute; inset: 0; cursor: pointer; background: #444; border-radius: 999px; transition: .15s; }
.ds-slider::before { content: ''; position: absolute; height: 14px; width: 14px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .15s; }
.ds-switch input:checked + .ds-slider { background: var(--accent, #6ea8fe); }
.ds-switch input:checked + .ds-slider::before { transform: translateX(18px); }
.ds-switch input:disabled + .ds-slider { opacity: .6; cursor: default; }
`;

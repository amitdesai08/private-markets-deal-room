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

// The stored role values are single words with a specific meaning to the sourcing
// engine. On screen they were four unexplained uppercase chips.
const ROLE_LABEL: Record<string, string> = {
  discover: 'Finds targets', confirm: 'Confirms facts', quality: 'Checks quality', context: 'Adds context',
  // The Microsoft 365 card carries a fifth value. It was the one chip still
  // rendering its stored word, which is how a lone lowercase 'identity' ended up
  // sitting beside four English phrases.
  identity: 'Signs you in',
};
const ROLE_HINT: Record<string, string> = {
  discover: 'Used to surface companies we are not already tracking',
  confirm: 'Used to verify a fact we already have against an authoritative record',
  quality: 'Used to judge how reliable a figure is before it reaches IC or LP material',
  context: 'Used for background — market, sector and news colour around a target',
  identity: 'Establishes who you are, so the other sources can be reached on your behalf',
};

type Connector = {
  id: string; name: string; kind: string; provider: string | null; role: string;
  loginUrl: string | null; primaryJob: string; sweetSpot: string;
  free: boolean; enabled: boolean; configured: boolean; testable: boolean;
  connectable: boolean; status: string; latencyMs: number | null;
  lastSync: string | null; message: string | null;
  custom?: boolean;
  approved?: boolean;
  freshness?: { status: string; ageMs: number | null; slaMs: number; lastSync: string | null } | null;
  configFields?: { key: string; label: string; placeholder?: string; kind?: string; options?: string[] }[] | null;
  config?: Record<string, string>;
};

const STATUS_LABEL: Record<string, string> = {
  // "Not connected" beside a switch already in the on position told a partner nothing
  // about the only question she had, which was whether the firm is paying for the thing.
  // It is not a subscription state; it means no credentials have been entered yet.
  connected: 'Connected', disconnected: 'No sign-in details entered yet', degraded: 'Degraded',
  // "Not tested" over a header saying these sources are on read as a warning. They are
  // enabled and in use; what has not happened is a reachability check from this screen.
  disabled: 'Disabled', unknown: 'On — no test run yet', pending: 'Pending approval',
};

const TIERS: { key: string; title: string; blurb: string; match: (c: Connector) => boolean }[] = [
  { key: 'free', title: 'Free & open (no subscription)', blurb: 'Free public market & company data — on by default.', match: (c) => c.free && c.kind !== 'web' },
  { key: 'web', title: 'Live web search', blurb: 'Searches the open web for market news and signals. Charged by use.', match: (c) => c.kind === 'web' },
  { key: 'fabric-agent', title: 'Ask your fund data', blurb: 'Natural-language Q&A over the fund\u2019s data.', match: (c) => c.kind === 'fabric-agent' },
  { key: 'mcp', title: 'Subscription providers', blurb: 'Premium vendor data — sign in to connect.', match: (c) => c.kind === 'mcp' },
  { key: 'm365', title: 'Microsoft 365 sign-in', blurb: 'Signs you in so the app knows who you are.', match: (c) => c.kind === 'm365' },  { key: 'workiq', title: 'Your team’s files, chats and email', blurb: 'Files, chats and email already in Microsoft 365 — add the address, then sign in.', match: (c) => c.kind === 'workiq' },  { key: 'database', title: 'Reference only', blurb: 'Shown for context — not connected.', match: (c) => c.kind === 'database' },
  { key: 'sor', title: 'Your CRM / deal database', blurb: 'Your firm\u2019s system of record — DealCloud, Salesforce, Allvue/eFront or an internal system. Admin only.', match: (c) => c.kind === 'sor' },
  { key: 'custom', title: 'Custom sources', blurb: 'Sources your fund added — shown with their live status.', match: (c) => c.kind === 'custom' },
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

  // "Connect your CRM / system of record" form — admin only (real credentials).
  // A preset just fills in a sensible name/placeholder; the connector itself is
  // one generic REST-or-OAuth kind so it works with DealCloud, Salesforce FSC,
  // Allvue/eFront or an internal system without us guessing any vendor's exact API.
  const SOR_PRESETS: Record<string, { name: string; baseUrl: string; healthPath: string }> = {
    dealcloud: { name: 'DealCloud', baseUrl: 'https://yourfirm.dealcloud.com', healthPath: '/api/rest/v2/health' },
    salesforce: { name: 'Salesforce', baseUrl: 'https://yourfirm.my.salesforce.com', healthPath: '/services/data/v60.0/limits' },
    allvue: { name: 'Allvue / eFront', baseUrl: 'https://yourfirm.allvuesystems.com', healthPath: '/api/health' },
    other: { name: '', baseUrl: '', healthPath: '' },
  };
  const [sorForm, setSorForm] = useState({
    preset: 'dealcloud', name: 'DealCloud', baseUrl: '', healthPath: '', authType: 'oauthClientCredentials',
    apiKey: '', tokenUrl: '', clientId: '', clientSecret: '',
  });
  const [sorErr, setSorErr] = useState<string | null>(null);
  const [sorAdding, setSorAdding] = useState(false);

  const pickSorPreset = (preset: string) => {
    const p = SOR_PRESETS[preset] || SOR_PRESETS.other;
    setSorForm((f) => ({ ...f, preset, name: p.name || f.name }));
  };

  const addSorSource = async () => {
    const name = sorForm.name.trim();
    if (!name) { setSorErr('Give the connection a name.'); return; }
    if (!sorForm.baseUrl.trim()) { setSorErr('Add your API base URL.'); return; }
    setSorAdding(true); setSorErr(null);
    try {
      const r = await af('/api/connectors', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'sor', name,
          primaryJob: `Pull ${name} pipeline and push IC decisions back`,
          baseUrl: sorForm.baseUrl.trim(), healthPath: sorForm.healthPath.trim(), authType: sorForm.authType,
          apiKey: sorForm.apiKey.trim(), tokenUrl: sorForm.tokenUrl.trim(), clientId: sorForm.clientId.trim(), clientSecret: sorForm.clientSecret.trim(),
        }),
      });
      if (r.status === 403) { setSorErr('Only an administrator can connect a CRM / system of record.'); return; }
      if (r.status === 409) { setSorErr(`A source called “${name}” already exists — look for it above.`); return; }
      if (!r.ok) { setSorErr('Could not add that connection.'); return; }
      setSorForm({ preset: 'dealcloud', name: 'DealCloud', baseUrl: '', healthPath: '', authType: 'oauthClientCredentials', apiKey: '', tokenUrl: '', clientId: '', clientSecret: '' });
      await load();
    } catch { setSorErr('Could not add that connection.'); }
    finally { setSorAdding(false); }
  };

  const load = () => fetch('/api/connectors').then((r) => (r.ok ? r.json() : [])).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const patch = (id: string, fields: Partial<Connector>) =>
    setRows((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, ...fields } : c)) : prev));
  const setBusyFor = (id: string, v: boolean) => setBusy((b) => ({ ...b, [id]: v }));
  // Turning a source off changed the count above it and said nothing else. A partner
  // switched GDELT off, got no acknowledgement of any kind, and reloaded the entire
  // page to find out whether it had saved. Failure was reported; success was not.
  const [saved, setSaved] = useState<Record<string, string>>({});
  const saySaved = (id: string, msg: string) => {
    setSaved((s) => ({ ...s, [id]: msg }));
    window.setTimeout(() => setSaved((s) => { const n = { ...s }; delete n[id]; return n; }), 4000);
  };

  // A refusal from the server has to reach the switch. fetch only rejects when the
  // network drops -- a 403 or a 500 resolves normally -- so without the r.ok check
  // below an enable that the server refused still sat on screen showing ON, and
  // whoever turned it on walked away believing the source was live.
  const toggle = async (c: Connector) => {
    const enabled = !c.enabled;
    const before = { enabled: c.enabled, status: c.status, message: c.message };
    patch(c.id, { enabled, status: enabled ? 'unknown' : 'disabled', message: null }); // optimistic
    setBusyFor(c.id, true);
    try {
      const r = await fetch(`/api/connectors/${c.id}/enable`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }),
      });
      if (!r.ok) {
        patch(c.id, { ...before, message: r.status === 403 ? 'Only an administrator can change this.' : 'That did not save — the source is unchanged.' });
      } else {
        saySaved(c.id, enabled ? '✓ Saved — this source is on and will be used from the next refresh.' : '✓ Saved — this source is off. Nothing will be read from it.');
      }
    } catch { patch(c.id, { ...before, message: 'That did not save — the source is unchanged.' }); }
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
    // Only report it disconnected if it actually disconnected. Showing the word
    // regardless would tell an administrator a credential had been revoked when it
    // is still live.
    try {
      const r = await fetch(`/api/connectors/${c.id}/disconnect`, { method: 'POST' });
      if (r.ok) patch(c.id, { status: 'disconnected', message: null });
      else patch(c.id, { message: r.status === 403 ? 'Only an administrator can disconnect this.' : 'That did not go through — the source is still connected.' });
    } catch { patch(c.id, { message: 'That did not go through — the source is still connected.' }); }
    finally { setBusyFor(c.id, false); }
  };

  const cfgVal = (c: Connector, key: string, kind?: string) => {
    // Secret fields are never sent back from the server in the clear (redacted to a
    // fixed mask), so the input always starts blank — typing a value replaces it,
    // leaving it blank on Save keeps whatever is already stored.
    if (kind === 'secret') return cfgEdit[c.id]?.[key] ?? '';
    return cfgEdit[c.id]?.[key] ?? (c.config?.[key] ?? '');
  };
  const setCfg = (id: string, key: string, val: string) =>
    setCfgEdit((p) => ({ ...p, [id]: { ...(p[id] || {}), [key]: val } }));
  const saveConfig = async (c: Connector) => {
    // Never resubmit a secret's redacted mask as its real value: only include a
    // secret-typed field in the patch when the admin actually typed something this
    // session; every other field carries over from the last saved config as before.
    const secretKeys = new Set((c.configFields || []).filter((f) => f.kind === 'secret').map((f) => f.key));
    const base = Object.fromEntries(Object.entries(c.config || {}).filter(([k]) => !secretKeys.has(k)));
    const config = { ...base, ...(cfgEdit[c.id] || {}) };
    setBusyFor(c.id, true);
    // Clearing the edit buffer is what makes a save look committed. Do it only when
    // the server took the settings -- otherwise the typed endpoint and keys vanished
    // from the form while nothing had been stored.
    try {
      const r = await fetch(`/api/connectors/${c.id}/config`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config }),
      });
      if (r.ok) {
        patch(c.id, { config, message: null });
        setCfgEdit((p) => { const n = { ...p }; delete n[c.id]; return n; }); // committed
      } else {
        patch(c.id, { message: r.status === 403 ? 'Only an administrator can change these settings.' : 'Those settings did not save — what you typed is still here, try again.' });
      }
    } catch { patch(c.id, { message: 'Those settings did not save — what you typed is still here, try again.' }); }
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
    // The row disappearing IS the confirmation, so it must not disappear on a refusal.
    try {
      const r = await fetch(`/api/connectors/${c.id}`, { method: 'DELETE' });
      if (r.ok) setRows((prev) => (prev ? prev.filter((x) => x.id !== c.id) : prev));
      else patch(c.id, { message: r.status === 403 ? 'Only an administrator can remove a source.' : 'That did not go through — the source is still here.' });
    } catch { patch(c.id, { message: 'That did not go through — the source is still here.' }); }
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
  // "4/4 free & open sources active" sat directly above a group of three, because the
  // fourth free source is grouped separately further down the page. A fraction printed
  // over a list it does not describe reads as a bug in the count.

  return (
    <div className="ds-wrap">
      <style>{CSS}</style>
      <div className="ds-head">
        <h2>Data sources</h2>
        <p>
          Choose the market-data sources that power the Deal Room. {activeFree} of {freeTotal} free &amp; open sources
          are on across the groups below — no subscription needed. Turn a source off to leave it out; sign in to enable a paid provider.
        </p>
      </div>

      <div className="ds-add">
        <div className="ds-add-h">
          <span className="ds-add-t">Add a data source</span>
          <span className="ds-add-b">Don't see your provider (PitchBook, Morningstar Direct, an internal source)? Add it here. New sources stay <b>pending</b> until an admin approves them.</span>
        </div>
        <div className="ds-add-grid">
          <input className="ds-cfg-in" placeholder="Name (e.g. PitchBook)" value={form.name} maxLength={60}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input className="ds-cfg-in" placeholder="What it provides (optional)" value={form.primaryJob} maxLength={200}
            onChange={(e) => setForm((f) => ({ ...f, primaryJob: e.target.value }))} />
          <select className="ds-cfg-in" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} title="Where this source fits in sourcing" aria-label="Where this source fits in sourcing">
            <option value="discover">Finds targets</option>
            <option value="confirm">Confirms facts</option>
            <option value="quality">Checks quality</option>
            <option value="context">Adds context</option>
          </select>
          <input className="ds-cfg-in" type="url" placeholder="Data source URL (optional)" value={form.endpoint} spellCheck={false}
            onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))} />
          {/* A read-only Member was shown Add source, Connect and Disconnect fully
            enabled, and only found out the server refuses them by pressing one and
            getting a 401. Offering somebody a control that cannot work is worse than
            not offering it: they assume they broke something. Test stays enabled --
            checking whether a source is reachable harms nothing. */}
        <button className="ds-btn primary" disabled={!isAdmin || adding || !form.name.trim()} title={!isAdmin ? 'Only an administrator can change data sources.' : undefined} onClick={addSource}>{adding ? 'Adding…' : 'Add source'}</button>
        </div>
        {addErr ? <p className="ds-add-err">{addErr}</p> : null}
      </div>

      <div className="ds-add">
        <div className="ds-add-h">
          <span className="ds-add-t">Connect your CRM / deal database</span>
          <span className="ds-add-b">
            Pull your firm’s existing pipeline from DealCloud, Salesforce, Allvue/eFront or an internal system, and push
            IC decisions back to it. Carries real credentials, so this is <b>admin only</b> and stays <b>pending</b> until
            an admin approves it, same as any other custom source.
          </span>
        </div>
        {isAdmin ? (
          <>
            <div className="ds-add-grid">
              <select className="ds-cfg-in" value={sorForm.preset} onChange={(e) => pickSorPreset(e.target.value)} title="Which system" aria-label="Which system">
                <option value="dealcloud">DealCloud</option>
                <option value="salesforce">Salesforce (FSC)</option>
                <option value="allvue">Allvue / eFront</option>
                <option value="other">Other / internal system</option>
              </select>
              <input className="ds-cfg-in" placeholder="Name shown in Data sources" value={sorForm.name} maxLength={60}
                onChange={(e) => setSorForm((f) => ({ ...f, name: e.target.value }))} />
              <input className="ds-cfg-in" type="url" placeholder="API base URL" value={sorForm.baseUrl} spellCheck={false}
                onChange={(e) => setSorForm((f) => ({ ...f, baseUrl: e.target.value }))} />
              <input className="ds-cfg-in" placeholder="Health-check path (e.g. /api/health)" value={sorForm.healthPath} spellCheck={false}
                onChange={(e) => setSorForm((f) => ({ ...f, healthPath: e.target.value }))} />
              <select className="ds-cfg-in" value={sorForm.authType} onChange={(e) => setSorForm((f) => ({ ...f, authType: e.target.value }))} title="Authentication" aria-label="Authentication">
                <option value="oauthClientCredentials">OAuth client credentials</option>
                <option value="apiKey">API key / bearer token</option>
              </select>
              {sorForm.authType === 'apiKey' ? (
                <input className="ds-cfg-in" type="password" autoComplete="new-password" placeholder="API key / bearer token" value={sorForm.apiKey}
                  onChange={(e) => setSorForm((f) => ({ ...f, apiKey: e.target.value }))} />
              ) : (
                <>
                  <input className="ds-cfg-in" type="url" placeholder="OAuth token URL" value={sorForm.tokenUrl} spellCheck={false}
                    onChange={(e) => setSorForm((f) => ({ ...f, tokenUrl: e.target.value }))} />
                  <input className="ds-cfg-in" placeholder="OAuth client ID" value={sorForm.clientId}
                    onChange={(e) => setSorForm((f) => ({ ...f, clientId: e.target.value }))} />
                  <input className="ds-cfg-in" type="password" autoComplete="new-password" placeholder="OAuth client secret" value={sorForm.clientSecret}
                    onChange={(e) => setSorForm((f) => ({ ...f, clientSecret: e.target.value }))} />
                </>
              )}
              <button className="ds-btn primary" disabled={sorAdding || !sorForm.name.trim() || !sorForm.baseUrl.trim()} onClick={addSorSource}>{sorAdding ? 'Connecting…' : 'Connect'}</button>
            </div>
            {sorErr ? <p className="ds-add-err">{sorErr}</p> : null}
          </>
        ) : (
          <p className="ds-add-b">Ask an administrator to connect your firm’s CRM here.</p>
        )}
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
                      {/* This printed the raw stored value - `discover`, `confirm`,
                          `quality`, `context` - as an unexplained uppercase chip. The
                          title says what the word is claiming about the source. */}
                      <span className="ds-role" title={ROLE_HINT[c.role] || 'Where this source fits in sourcing'}>{ROLE_LABEL[c.role] || c.role}</span>
                    </div>
                    {/* `title` on the label is not an accessible name for the input, so
                        a screen reader announced this as an unlabelled checkbox on every
                        card. Name the source it switches.
                        A partner counted six switches sitting in the ON position beside
                        six sources whose own text said they were not connected, and read
                        it as "we are paying for these". The switch means "allowed to be
                        used"; it cannot mean "working" until somebody enters the sign-in
                        details. When the two disagree, show it on the switch itself. */}
                    <label className={`ds-switch${c.enabled && c.status === 'disconnected' ? ' unusable' : ''}`} title={c.kind === 'sor' && !isAdmin ? 'Only an administrator can change data sources.' : c.enabled ? (c.status === 'disconnected' ? 'Allowed, but not usable until sign-in details are entered' : 'Enabled') : 'Disabled'}>
                      <input type="checkbox" checked={c.enabled} disabled={!!busy[c.id] || (c.kind === 'sor' && !isAdmin)} onChange={() => toggle(c)} aria-label={`${c.name} — ${c.enabled ? 'on, switch off' : 'off, switch on'}`} />
                      <span className="ds-slider" />
                    </label>
                  </div>
                  {c.enabled && c.status === 'disconnected' ? (
                    <p className="ds-warn">Allowed, but nothing is being read from it. It needs sign-in details before it can be used — and you are not being charged for it until then.</p>
                  ) : null}
                  <p className="ds-job">{c.primaryJob}</p>
                  <p className="ds-sweet">{c.sweetSpot}</p>
                  {c.configFields?.length ? (
                    <div className="ds-config">
                      {c.configFields.map((f) => {
                        const dirty = f.kind === 'secret'
                          ? !!(cfgEdit[c.id]?.[f.key] && cfgEdit[c.id][f.key].length)
                          : cfgEdit[c.id]?.[f.key] !== undefined && cfgEdit[c.id][f.key] !== (c.config?.[f.key] ?? '');
                        return (
                          <label key={f.key} className="ds-cfg-row">
                            <span className="ds-cfg-l">{f.label}</span>
                            <span className="ds-cfg-edit">
                              {f.kind === 'select' ? (
                                <select
                                  className="ds-cfg-in"
                                  value={cfgVal(c, f.key)}
                                  disabled={!!busy[c.id]}
                                  onChange={(e) => setCfg(c.id, f.key, e.target.value)}
                                >
                                  <option value="">Choose…</option>
                                  {(f.options || []).map((opt) => (
                                    <option key={opt} value={opt}>{opt === 'apiKey' ? 'API key / bearer token' : opt === 'oauthClientCredentials' ? 'OAuth client credentials' : opt}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  className="ds-cfg-in"
                                  type={f.kind === 'url' ? 'url' : f.kind === 'secret' ? 'password' : 'text'}
                                  value={cfgVal(c, f.key, f.kind)}
                                  placeholder={f.kind === 'secret' && c.config?.[f.key] ? 'Set — leave blank to keep unchanged' : (f.placeholder || '')}
                                  spellCheck={false}
                                  autoComplete={f.kind === 'secret' ? 'new-password' : 'off'}
                                  disabled={!!busy[c.id]}
                                  onChange={(e) => setCfg(c.id, f.key, e.target.value)}
                                />
                              )}
                              <button className="ds-btn" disabled={!!busy[c.id] || !dirty || (c.kind === 'sor' && !isAdmin)} title={c.kind === 'sor' && !isAdmin ? 'Only an administrator can change data sources.' : undefined} onClick={() => saveConfig(c)}>Save</button>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="ds-foot">
                    <span className={`ds-pill ${c.status}`}>{STATUS_LABEL[c.status] || c.status}</span>
                    {c.freshness?.status === 'stale' ? <span className="ds-pill degraded" title="Older than the refresh window this source allows, so it is kept out of IC and LP material">Stale</span> : null}
                    {c.latencyMs != null ? <span className="ds-lat">{c.latencyMs}ms</span> : null}
                    <span className="ds-actions">
                      {c.testable && c.enabled ? (
                        // A connection test is a read, so it stays available to everyone --
                        // but "Test" beside three disabled admin buttons reads as the one
                        // control this seat is allowed to change something with. Name it for
                        // what it does instead.
                        <button className="ds-btn" disabled={!!busy[c.id]} onClick={() => test(c)}
                          title="Checks the connection is alive. Changes nothing.">{isAdmin ? 'Test' : 'Check status'}</button>
                      ) : null}
                      {c.connectable && c.enabled ? (
                        c.configured
                      ? <button className="ds-btn" disabled={!isAdmin || !!busy[c.id]} title={!isAdmin ? 'Only an administrator can change data sources.' : undefined} onClick={() => disconnect(c)}>Disconnect</button>
                      : <button className="ds-btn primary" disabled={!isAdmin} title={!isAdmin ? 'Only an administrator can change data sources.' : undefined} onClick={() => connect(c)}>Connect</button>
                      ) : null}
                      {c.custom && !c.approved && isAdmin ? <button className="ds-btn primary" disabled={!!busy[c.id]} onClick={() => approveSource(c)}>Approve</button> : null}
                      {c.custom ? <button className="ds-btn danger" disabled={!!busy[c.id] || (c.kind === 'sor' && !isAdmin)} title={c.kind === 'sor' && !isAdmin ? 'Only an administrator can remove a data source.' : undefined} onClick={() => removeSource(c)}>Remove</button> : null}
                    </span>
                  </div>
                  {c.message ? <p className="ds-msg">{c.message}</p> : null}
              {saved[c.id] ? <p className="ds-msg" style={{ color: 'var(--good)' }} role="status">{saved[c.id]}</p> : null}
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
.ds-add-err { margin: 8px 0 0; font-size: 12px; color: var(--warn); }
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
.ds-badge.free { font-size: 10px; font-weight: 600; color: var(--good); background: var(--good-bg); border-radius: 4px; padding: 1px 6px; }
.ds-job { margin: 8px 0 2px; font-size: 12.5px; color: var(--fg); }
.ds-sweet { margin: 0; font-size: 12px; color: var(--muted); }
.ds-warn { margin: 4px 0 0; font-size: 12px; color: var(--warn, #b26a00); }
.ds-switch.unusable .ds-slider { background: repeating-linear-gradient(135deg, var(--accent, #2f6fed) 0 4px, rgba(255,255,255,.45) 4px 8px); }
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
.ds-btn.danger { border-color: var(--bad-br); color: var(--bad); }
.ds-btn.danger:hover:not(:disabled) { border-color: var(--bad); color: var(--bad); }
.ds-msg { margin: 8px 0 0; font-size: 11.5px; color: var(--muted); line-height: 1.4; }
.ds-pill { font-size: 11px; font-weight: 600; border-radius: 999px; padding: 2px 9px; }
.ds-pill.connected { color: var(--good); background: var(--good-bg); }
.ds-pill.disconnected { color: var(--muted); background: transparent; border: 1px dashed var(--border); }
.ds-pill.degraded { color: var(--warn); background: var(--warn-bg); }
.ds-pill.disabled { color: var(--muted); background: var(--chip); }
.ds-pill.pending { color: var(--warn); background: var(--warn-bg); }
.ds-pill.unknown { color: var(--accent); background: var(--chip); }
.ds-switch { position: relative; display: inline-block; width: 38px; height: 20px; flex: none; }
.ds-switch input { opacity: 0; width: 0; height: 0; }
.ds-slider { position: absolute; inset: 0; cursor: pointer; background: var(--border); border-radius: 999px; transition: .15s; }
.ds-slider::before { content: ''; position: absolute; height: 14px; width: 14px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .15s; }
.ds-switch input:checked + .ds-slider { background: var(--accent, #6ea8fe); }
.ds-switch input:checked + .ds-slider::before { transform: translateX(18px); }
.ds-switch input:disabled + .ds-slider { opacity: .6; cursor: default; }
`;

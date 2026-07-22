// The "Admin" tab — in-app RBAC role builder + persona designer. Visible only to an
// administrator (App gates it on isAdmin; the orchestrator re-enforces admin-only on
// every write). Custom roles/personas persist server-side and layer over the built-in
// defaults. Layout: two sub-tabs (Roles · Personas); each row is a collapsed summary
// that expands into clearly-grouped sections (Identity · Access · Workflow · Data
// sovereignty · Assignment) to keep the surface uncluttered.
import { useEffect, useState } from 'react';

type Role = {
  id: string; label: string; rank: number; personas: string[]; write: boolean; stage2: boolean;
  advanceWorkflow: boolean; allowedStages: string[]; regions: string[];
  isAdminRole: boolean; builtin: boolean; assignments: string[]; envAssignedCount: number;
};
type Persona = { id: string; label: string; lane: string | null; builtin: boolean; actions: string[] | null; stages: string[] };
type Action = { id: string; label: string; personas: string[]; laneScoped: boolean };
type AdminData = {
  config: any; roles: Role[]; personas: Persona[]; actions: Action[];
  lanes: Record<string, string>; allPersonaIds: string[]; stages: string[];
  demoMode?: boolean; demoModeConfigurable?: boolean;
};

export default function Admin({ ssoToken, viewAs }: { ssoToken?: string; viewAs?: string }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'roles' | 'personas'>('roles');
  const [busy, setBusy] = useState(false);

  const post = async (path: string, body: any = {}) => {
    const r = await fetch(`/api/admin${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, ssoToken, as: viewAs || undefined }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  };
  const load = () => post('/access-config').then(setData).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (err) return <div className="adm"><style>{CSS}</style><p className="adm-err">Admin data unavailable: {err}</p></div>;
  if (!data) return <div className="adm"><style>{CSS}</style><p className="adm-empty">Loading access configuration…</p></div>;

  const personaIds = data.personas.map((p) => p.id);
  const roleCount = { total: data.roles.length, custom: data.roles.filter((r) => !r.builtin).length };
  const pCount = { total: data.personas.length, custom: data.personas.filter((p) => !p.builtin).length };

  return (
    <div className="adm">
      <style>{CSS}</style>
      <div className="adm-head">
        <h2>Access administration</h2>
        <p>Define custom RBAC roles and personas — data sovereignty, access level, and workflow rights. Select a row to expand and edit; changes persist and layer over the built-in defaults.</p>
      </div>

      {data.demoModeConfigurable ? (
        <div className="adm-demo">
          <div className="adm-demo-txt">
            <div className="adm-demo-t">Demo mode {data.demoMode ? <span className="adm-demo-on">On</span> : <span className="adm-demo-off">Off</span>}</div>
            <div className="adm-demo-s">Shows the “View as” switcher and showcase personas so the access model is demoable. Turn this off for a production-style experience — every user then sees only their own role and identity.</div>
          </div>
          <label className="adm-toggle" title={data.demoMode ? 'Disable demo mode' : 'Enable demo mode'}>
            <input
              type="checkbox"
              checked={!!data.demoMode}
              disabled={busy}
              onChange={async (e) => {
                const on = e.target.checked;
                setBusy(true);
                try { await post('/demo-mode', { on }); window.location.reload(); }
                catch (err: any) { setErr(String(err?.message || err)); setBusy(false); }
              }}
            />
            <span className="adm-toggle-track"><span className="adm-toggle-knob" /></span>
          </label>
        </div>
      ) : null}

      <nav className="adm-tabs">
        <button className={tab === 'roles' ? 'on' : ''} onClick={() => setTab('roles')}>Roles <span className="adm-count">{roleCount.total}</span></button>
        <button className={tab === 'personas' ? 'on' : ''} onClick={() => setTab('personas')}>Personas <span className="adm-count">{pCount.total}</span></button>
      </nav>

      {tab === 'roles'
        ? <RolesEditor data={data} personaIds={personaIds} busy={busy} setBusy={setBusy} post={post} reload={load} />
        : <PersonasEditor data={data} busy={busy} setBusy={setBusy} post={post} reload={load} />}
    </div>
  );
}

// ---- small presentational helpers -------------------------------------------
function Section({ title, hint, children }: { title: string; hint?: string; children: any }) {
  return (
    <section className="adm-sec">
      <div className="adm-sec-h"><span className="adm-sec-t">{title}</span>{hint ? <span className="adm-sec-hint">{hint}</span> : null}</div>
      <div className="adm-sec-body">{children}</div>
    </section>
  );
}
function Field({ label, hint, col, children }: { label: string; hint?: string; col?: boolean; children: any }) {
  return (
    <div className={`adm-field${col ? ' col' : ''}`}>
      <span className="adm-flabel">{label}{hint ? <em> {hint}</em> : null}</span>
      <div className="adm-fctl">{children}</div>
    </div>
  );
}
function Chip({ children }: { children: any }) { return <span className="adm-mchip">{children}</span>; }
function CheckGrid({ options, value, onChange, labels }: { options: string[]; value: string[]; onChange: (v: string[]) => void; labels?: Record<string, string> }) {
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="adm-grid">
      {options.map((o) => (
        <label key={o} className={`adm-chip${value.includes(o) ? ' on' : ''}`}>
          <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} />{labels?.[o] || o}
        </label>
      ))}
    </div>
  );
}

function BulkAssign({ data, post, reload }: any) {
  const [csv, setCsv] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parse = (text: string) => {
    const rows: { user: string; role: string }[] = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 2) continue;
      if (cols[0].toLowerCase() === 'user' && cols[1].toLowerCase() === 'role') continue; // header
      rows.push({ user: cols[0], role: cols[1] });
    }
    return rows;
  };
  const template = () => {
    const ex = (data.roles || []).slice(0, 3).map((r: Role) => `user@contoso.com,${r.id}`).join('\n');
    const url = URL.createObjectURL(new Blob([`user,role\n${ex}\n`], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'role-assignments-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };
  const onFile = (e: any) => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = () => setCsv(String(rd.result || '')); rd.readAsText(f);
  };
  const importNow = async () => {
    const rows = parse(csv);
    if (!rows.length) { setResult('No rows parsed — expected "user,role" lines.'); return; }
    setBusy(true);
    try {
      const out = await post('/assignments/import', { assignments: rows, mode });
      const per = Object.entries(out.applied || {}).map(([r, n]) => `${r}: ${n}`).join(', ');
      const unk = (out.unknownRoles || []).length ? ` · skipped unknown roles: ${out.unknownRoles.join(', ')}` : '';
      setResult(`Imported ${out.imported} assignment(s) (${mode}). Totals — ${per || 'none'}${unk}`);
      await reload();
    } catch (e: any) { setResult(`Import failed: ${String(e.message || e)}`); }
    finally { setBusy(false); }
  };

  return (
    <div className="adm-panel">
      <p className="adm-panel-lead">Assign many users at once. Columns: <code>user,role</code> (user = object id / UPN / display name). Unknown roles are skipped.</p>
      <textarea className="adm-csv" rows={4} placeholder={'user,role\nalice@contoso.com,partner\nbob@contoso.com,analyst'} value={csv} onChange={(e) => setCsv(e.target.value)} />
      <div className="adm-bulk-ctl">
        <input type="file" accept=".csv,text/csv" onChange={onFile} />
        <label className="adm-flag"><input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} />merge</label>
        <label className="adm-flag"><input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />replace</label>
        <button className="adm-btn" type="button" onClick={template}>Download template</button>
        <button className="adm-btn primary" disabled={busy || !csv.trim()} onClick={importNow}>Import</button>
      </div>
      {result ? <p className="adm-bulk-res">{result}</p> : null}
    </div>
  );
}

function RolesEditor({ data, personaIds, busy, setBusy, post, reload }: any) {
  const [draft, setDraft] = useState<Record<string, Role>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [panel, setPanel] = useState<'' | 'add' | 'import'>('');
  const [newRole, setNewRole] = useState({ id: '', label: '', rank: 50 });
  const roleOf = (r: Role): Role => draft[r.id] || r;
  const edit = (id: string, patch: Partial<Role>) => setDraft((d: any) => ({ ...d, [id]: { ...(d[id] || data.roles.find((x: Role) => x.id === id)), ...patch } }));

  const save = async (r: Role) => {
    setBusy(true);
    try {
      await post(`/roles/${r.id}`, {
        patch: { label: r.label, rank: Number(r.rank), personas: r.personas, write: r.write, stage2: r.stage2, advanceWorkflow: r.advanceWorkflow, allowedStages: r.allowedStages, regions: r.regions },
        assignments: r.assignments,
      });
      setDraft((d: any) => { const c = { ...d }; delete c[r.id]; return c; });
      await reload();
    } finally { setBusy(false); }
  };
  const del = async (id: string) => { setBusy(true); try { await post(`/roles/${id}/delete`); if (open === id) setOpen(null); await reload(); } finally { setBusy(false); } };
  const addRole = async () => {
    if (!newRole.id.trim()) return;
    setBusy(true);
    try {
      const id = newRole.id.trim().toLowerCase();
      await post(`/roles/${id}`, { patch: { label: newRole.label || newRole.id, rank: Number(newRole.rank), personas: [], write: false, stage2: false, advanceWorkflow: false, allowedStages: [], regions: [] } });
      setNewRole({ id: '', label: '', rank: 50 }); setPanel(''); await reload(); setOpen(id);
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="adm-toolbar">
        <button className={`adm-tbtn${panel === 'add' ? ' on' : ''}`} onClick={() => setPanel(panel === 'add' ? '' : 'add')}>+ New role</button>
        <button className={`adm-tbtn${panel === 'import' ? ' on' : ''}`} onClick={() => setPanel(panel === 'import' ? '' : 'import')}>Import CSV…</button>
      </div>
      {panel === 'add' ? (
        <div className="adm-panel">
          <div className="adm-addrow">
            <input placeholder="role id (e.g. compliance)" value={newRole.id} onChange={(e) => setNewRole({ ...newRole, id: e.target.value })} />
            <input placeholder="label" value={newRole.label} onChange={(e) => setNewRole({ ...newRole, label: e.target.value })} />
            <input type="number" placeholder="rank" value={newRole.rank} onChange={(e) => setNewRole({ ...newRole, rank: Number(e.target.value) })} style={{ width: 76 }} />
            <button className="adm-btn primary" disabled={busy || !newRole.id.trim()} onClick={addRole}>Create</button>
          </div>
          <p className="adm-panel-lead">New roles start with no access — expand the row to grant personas, write, stages, and regions.</p>
        </div>
      ) : null}
      {panel === 'import' ? <BulkAssign data={data} post={post} reload={reload} /> : null}

      <div className="adm-list">
        {data.roles.map((base: Role) => {
          const r = roleOf(base);
          const isOpen = open === base.id;
          const dirty = isDirty(base, r);
          return (
            <article key={base.id} className={`adm-item${isOpen ? ' open' : ''}`}>
              <button className="adm-sum" onClick={() => setOpen(isOpen ? null : base.id)}>
                <span className="adm-caret">{isOpen ? '▾' : '▸'}</span>
                <span className="adm-sum-name">{base.label}</span>
                <span className={`adm-tag${base.builtin ? '' : ' custom'}`}>{base.builtin ? 'built-in' : 'custom'}</span>
                {base.isAdminRole ? <span className="adm-tag admin">admin</span> : null}
                {dirty ? <span className="adm-dot" title="Unsaved changes">●</span> : null}
                <span className="adm-sum-meta">
                  <Chip>rank {base.rank}</Chip>
                  <Chip>{base.personas.length} personas</Chip>
                  <Chip>{base.write ? 'write' : 'read-only'}</Chip>
                  {base.stage2 ? <Chip>Stage 2</Chip> : null}
                  <Chip>{base.regions.length ? base.regions.join(' / ') : 'all regions'}</Chip>
                  <Chip>{base.assignments.length + base.envAssignedCount} users</Chip>
                </span>
              </button>
              {isOpen ? (
                <div className="adm-body">
                  <Section title="Identity">
                    <Field label="Label"><input className="adm-text" value={r.label} onChange={(e) => edit(base.id, { label: e.target.value })} /></Field>
                    <Field label="Rank" hint="(seniority; higher wins on conflict, and “view-as” only goes down)"><input className="adm-num" type="number" value={r.rank} onChange={(e) => edit(base.id, { rank: Number(e.target.value) })} /></Field>
                  </Section>
                  <Section title="Access level" hint="What this role can see and do">
                    <div className="adm-flags">
                      <label className="adm-flag"><input type="checkbox" checked={r.write} onChange={(e) => edit(base.id, { write: e.target.checked })} />Can write</label>
                      <label className="adm-flag"><input type="checkbox" checked={r.stage2} onChange={(e) => edit(base.id, { stage2: e.target.checked })} />See Stage 2 (diligence)</label>
                    </div>
                    <Field label="Personas this role may act as" col><CheckGrid options={personaIds} value={r.personas} onChange={(v) => edit(base.id, { personas: v })} /></Field>
                  </Section>
                  <Section title="Workflow management" hint="Advancing the pipeline and the stages this role may manage">
                    <div className="adm-flags">
                      <label className="adm-flag"><input type="checkbox" checked={r.advanceWorkflow} onChange={(e) => edit(base.id, { advanceWorkflow: e.target.checked })} />May advance the workflow</label>
                    </div>
                    <Field label="Stages this role may manage" hint="(none = all)" col><CheckGrid options={data.stages} value={r.allowedStages} onChange={(v) => edit(base.id, { allowedStages: v })} /></Field>
                  </Section>
                  <Section title="Data sovereignty" hint="Regions / jurisdictions this role may see">
                    <Field label="Allowed regions" hint="(comma-separated; none = all)"><input className="adm-text" value={r.regions.join(', ')} onChange={(e) => edit(base.id, { regions: splitCsv(e.target.value) })} placeholder="e.g. US, EU" /></Field>
                  </Section>
                  <Section title="Assignment" hint="Users mapped to this role">
                    <Field label="Assigned users" hint="(object id / UPN / name, comma-separated)">
                      <input className="adm-text" value={r.assignments.join(', ')} onChange={(e) => edit(base.id, { assignments: splitCsv(e.target.value) })} placeholder="alice@contoso.com, …" />
                    </Field>
                    {base.envAssignedCount ? <p className="adm-note">+{base.envAssignedCount} additional user(s) assigned from the deploy configuration (read-only).</p> : null}
                  </Section>
                  <div className="adm-foot">
                    <button className="adm-btn primary" disabled={busy || !dirty} onClick={() => save(r)}>Save changes</button>
                    <button className="adm-btn" disabled={busy || !dirty} onClick={() => setDraft((d: any) => { const c = { ...d }; delete c[base.id]; return c; })}>Reset</button>
                    {!base.builtin ? <button className="adm-btn danger" disabled={busy} onClick={() => del(base.id)}>Delete role</button> : null}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PersonasEditor({ data, busy, setBusy, post, reload }: any) {
  const [draft, setDraft] = useState<Record<string, Persona>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newP, setNewP] = useState({ id: '', label: '', lane: '' });
  const actionIds = data.actions.map((a: Action) => a.id);
  const actionLabels: Record<string, string> = Object.fromEntries(data.actions.map((a: Action) => [a.id, a.label]));
  const pOf = (p: Persona): Persona => draft[p.id] || p;
  const edit = (id: string, patch: Partial<Persona>) => setDraft((d: any) => ({ ...d, [id]: { ...(d[id] || data.personas.find((x: Persona) => x.id === id)), ...patch } }));
  const laneLabel = (k: string | null) => (k ? (data.lanes[k] || k) : 'no lane');

  const save = async (p: Persona) => {
    setBusy(true);
    try {
      await post(`/personas/${p.id}`, { patch: { label: p.label, lane: p.lane || undefined }, actions: p.actions == null ? undefined : p.actions, stages: p.stages });
      setDraft((d: any) => { const c = { ...d }; delete c[p.id]; return c; });
      await reload();
    } finally { setBusy(false); }
  };
  const del = async (id: string) => { setBusy(true); try { await post(`/personas/${id}/delete`); if (open === id) setOpen(null); await reload(); } finally { setBusy(false); } };
  const addP = async () => {
    if (!newP.id.trim()) return;
    setBusy(true);
    try {
      const id = newP.id.trim().toLowerCase();
      await post(`/personas/${id}`, { patch: { label: newP.label || newP.id, lane: newP.lane || undefined }, actions: [], stages: [] });
      setNewP({ id: '', label: '', lane: '' }); setShowAdd(false); await reload(); setOpen(id);
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="adm-toolbar">
        <button className={`adm-tbtn${showAdd ? ' on' : ''}`} onClick={() => setShowAdd((v) => !v)}>+ New persona</button>
      </div>
      {showAdd ? (
        <div className="adm-panel">
          <div className="adm-addrow">
            <input placeholder="persona id (e.g. esg-lead)" value={newP.id} onChange={(e) => setNewP({ ...newP, id: e.target.value })} />
            <input placeholder="label" value={newP.label} onChange={(e) => setNewP({ ...newP, label: e.target.value })} />
            <select value={newP.lane} onChange={(e) => setNewP({ ...newP, lane: e.target.value })}>
              <option value="">(no lane)</option>
              {Object.entries(data.lanes).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}
            </select>
            <button className="adm-btn primary" disabled={busy || !newP.id.trim()} onClick={addP}>Create</button>
          </div>
          <p className="adm-panel-lead">New personas start with no workflow actions — expand the row to grant actions and stage limits.</p>
        </div>
      ) : null}

      <div className="adm-list">
        {data.personas.map((base: Persona) => {
          const p = pOf(base);
          const dirty = isDirty(base, p);
          const isOpen = open === base.id;
          const effActions = p.actions == null ? data.actions.filter((a: Action) => a.personas.includes(base.id)).map((a: Action) => a.id) : p.actions;
          return (
            <article key={base.id} className={`adm-item${isOpen ? ' open' : ''}`}>
              <button className="adm-sum" onClick={() => setOpen(isOpen ? null : base.id)}>
                <span className="adm-caret">{isOpen ? '▾' : '▸'}</span>
                <span className="adm-sum-name">{base.label}</span>
                <span className={`adm-tag${base.builtin ? '' : ' custom'}`}>{base.builtin ? 'built-in' : 'custom'}</span>
                {dirty ? <span className="adm-dot" title="Unsaved changes">●</span> : null}
                <span className="adm-sum-meta">
                  <Chip>{laneLabel(base.lane)}</Chip>
                  <Chip>{base.actions == null ? 'default actions' : `${base.actions.length} actions`}</Chip>
                  <Chip>{base.stages.length ? `${base.stages.length} stage(s)` : 'all stages'}</Chip>
                </span>
              </button>
              {isOpen ? (
                <div className="adm-body">
                  <Section title="Identity">
                    <Field label="Label"><input className="adm-text" value={p.label} onChange={(e) => edit(base.id, { label: e.target.value })} /></Field>
                    <Field label="Diligence lane">
                      <select className="adm-sel" value={p.lane || ''} onChange={(e) => edit(base.id, { lane: e.target.value || null })}>
                        <option value="">(none)</option>
                        {Object.entries(data.lanes).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}
                      </select>
                    </Field>
                  </Section>
                  <Section title="Workflow actions" hint={p.actions == null ? 'Built-in defaults — toggle any to start overriding' : 'Custom allowlist'}>
                    <CheckGrid options={actionIds} value={effActions} labels={actionLabels} onChange={(v) => edit(base.id, { actions: v })} />
                  </Section>
                  <Section title="Stage restriction" hint="Limit this persona to acting only in these stages">
                    <Field label="Allowed stages" hint="(none = all)" col><CheckGrid options={data.stages} value={p.stages} onChange={(v) => edit(base.id, { stages: v })} /></Field>
                  </Section>
                  <div className="adm-foot">
                    <button className="adm-btn primary" disabled={busy || !dirty} onClick={() => save(p)}>Save changes</button>
                    <button className="adm-btn" disabled={busy || !dirty} onClick={() => setDraft((d: any) => { const c = { ...d }; delete c[base.id]; return c; })}>Reset</button>
                    {!base.builtin ? <button className="adm-btn danger" disabled={busy} onClick={() => del(base.id)}>Delete persona</button> : null}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function isDirty(a: any, b: any) { return JSON.stringify(a) !== JSON.stringify(b); }
function splitCsv(s: string) { return s.split(',').map((x) => x.trim()).filter(Boolean); }

const CSS = `
.adm { padding: 16px 20px 48px; max-width: 940px; }
.adm-empty, .adm-err { color: var(--muted); }
.adm-err { color: #d66; }
.adm-head h2 { margin: 0 0 4px; font-size: 20px; }
.adm-head p { margin: 0 0 14px; color: var(--muted); font-size: 13px; max-width: 760px; line-height: 1.5; }
.adm-demo { display: flex; align-items: center; gap: 16px; justify-content: space-between; padding: 12px 14px; margin: 0 0 16px; border: 1px solid var(--border, #2a2a35); border-radius: 10px; background: var(--panel, rgba(255,255,255,0.02)); }
.adm-demo-txt { min-width: 0; }
.adm-demo-t { font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px; }
.adm-demo-s { color: var(--muted); font-size: 12.5px; line-height: 1.45; margin-top: 3px; max-width: 640px; }
.adm-demo-on { font-size: 11px; font-weight: 700; color: #34d399; border: 1px solid #34d39955; border-radius: 999px; padding: 1px 8px; }
.adm-demo-off { font-size: 11px; font-weight: 700; color: var(--muted); border: 1px solid var(--border, #2a2a35); border-radius: 999px; padding: 1px 8px; }
.adm-toggle { flex: 0 0 auto; cursor: pointer; }
.adm-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
.adm-toggle-track { display: inline-block; width: 42px; height: 24px; border-radius: 999px; background: var(--border, #3a3a46); position: relative; transition: background .15s ease; }
.adm-toggle-knob { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: left .15s ease; }
.adm-toggle input:checked + .adm-toggle-track { background: #2f81f7; }
.adm-toggle input:checked + .adm-toggle-track .adm-toggle-knob { left: 21px; }
.adm-toggle input:disabled + .adm-toggle-track { opacity: 0.5; }
.adm-tabs { display: flex; gap: 6px; margin-bottom: 14px; border-bottom: 1px solid var(--border, #2a2a35); }
.adm-tabs button { border: none; background: none; color: var(--muted); border-bottom: 2px solid transparent; padding: 6px 12px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.adm-tabs button.on { color: var(--accent, #6ea8fe); border-bottom-color: var(--accent, #6ea8fe); }
.adm-count { font-size: 11px; background: rgba(140,140,150,.18); color: var(--muted); border-radius: 999px; padding: 0 7px; }
.adm-tabs button.on .adm-count { background: rgba(110,168,254,.2); color: var(--accent, #6ea8fe); }

.adm-toolbar { display: flex; gap: 8px; margin-bottom: 10px; }
.adm-tbtn { border: 1px solid var(--border, #33333f); background: none; color: var(--fg); border-radius: 6px; padding: 5px 12px; font-size: 12.5px; cursor: pointer; }
.adm-tbtn.on { border-color: var(--accent, #6ea8fe); color: var(--accent, #6ea8fe); }
.adm-panel { border: 1px solid var(--border, #2a2a35); border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; background: var(--card, #1b1b22); }
.adm-panel-lead { margin: 8px 0 0; font-size: 12px; color: var(--muted); line-height: 1.5; }
.adm-panel-lead code, .adm-panel code { background: rgba(140,140,150,.16); padding: 0 4px; border-radius: 4px; }
.adm-addrow { display: flex; gap: 8px; flex-wrap: wrap; }
.adm-addrow input, .adm-addrow select { border: 1px solid var(--border, #33333f); background: var(--bg, #14141a); color: var(--fg); border-radius: 6px; padding: 5px 8px; font-size: 13px; }

.adm-list { display: flex; flex-direction: column; gap: 8px; }
.adm-item { border: 1px solid var(--border, #2a2a35); border-radius: 10px; background: var(--card, #1b1b22); overflow: hidden; }
.adm-item.open { border-color: var(--accent, #6ea8fe); }
.adm-sum { width: 100%; display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: none; border: none; color: var(--fg); cursor: pointer; text-align: left; flex-wrap: wrap; }
.adm-sum:hover { background: rgba(255,255,255,.02); }
.adm-caret { color: var(--muted); font-size: 11px; width: 12px; }
.adm-sum-name { font-weight: 600; font-size: 14px; }
.adm-tag { font-size: 10px; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); border: 1px solid var(--border, #33333f); border-radius: 4px; padding: 1px 6px; }
.adm-tag.custom { color: #6ea8fe; border-color: rgba(110,168,254,.4); }
.adm-tag.admin { color: #d8a; border-color: rgba(210,140,170,.4); }
.adm-dot { color: #e0a13a; font-size: 12px; }
.adm-sum-meta { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; }
.adm-mchip { font-size: 11px; color: var(--muted); background: rgba(140,140,150,.14); border-radius: 999px; padding: 1px 8px; white-space: nowrap; }

.adm-body { border-top: 1px solid var(--border, #2a2a35); padding: 6px 14px 14px; }
.adm-sec { padding: 12px 0; border-bottom: 1px solid var(--border, #23232c); }
.adm-sec:last-of-type { border-bottom: none; }
.adm-sec-h { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.adm-sec-t { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--fg); }
.adm-sec-hint { font-size: 11.5px; color: var(--muted); }
.adm-sec-body { display: flex; flex-direction: column; gap: 8px; }
.adm-field { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.adm-field.col { flex-direction: column; align-items: stretch; gap: 5px; }
.adm-flabel { font-size: 12.5px; color: var(--muted); min-width: 150px; }
.adm-flabel em { font-style: normal; opacity: .75; }
.adm-fctl { flex: 1; min-width: 220px; }
.adm-flags { display: flex; gap: 16px; flex-wrap: wrap; }
.adm-flag { display: flex; align-items: center; gap: 6px; color: var(--fg); font-size: 12.5px; }
.adm-text, .adm-num, .adm-sel { border: 1px solid var(--border, #33333f); background: var(--bg, #14141a); color: var(--fg); border-radius: 6px; padding: 5px 8px; font-size: 12.5px; }
.adm-text { width: 100%; }
.adm-num { width: 90px; }
.adm-note { margin: 6px 0 0; font-size: 11.5px; color: var(--muted); }

.adm-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.adm-chip { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--border, #33333f); border-radius: 999px; padding: 2px 10px; font-size: 12px; color: var(--muted); cursor: pointer; }
.adm-chip.on { color: var(--accent, #6ea8fe); border-color: var(--accent, #6ea8fe); background: rgba(110,168,254,.08); }
.adm-chip input { display: none; }

.adm-foot { display: flex; gap: 8px; margin-top: 12px; }
.adm-btn { border: 1px solid var(--border, #33333f); background: none; color: var(--fg); border-radius: 6px; padding: 5px 14px; font-size: 12.5px; cursor: pointer; }
.adm-btn.primary { border-color: var(--accent, #6ea8fe); color: var(--accent, #6ea8fe); }
.adm-btn.danger { border-color: #a44; color: #d88; margin-left: auto; }
.adm-btn:disabled { opacity: .45; cursor: default; }

.adm-csv { width: 100%; border: 1px solid var(--border, #33333f); background: var(--bg, #14141a); color: var(--fg); border-radius: 6px; padding: 8px; font-size: 12.5px; font-family: ui-monospace, monospace; resize: vertical; }
.adm-bulk-ctl { display: flex; align-items: center; gap: 14px; margin-top: 8px; flex-wrap: wrap; }
.adm-bulk-res { margin: 8px 0 0; font-size: 12px; color: var(--accent, #6ea8fe); }
`;

// The "Admin" tab — in-app RBAC role builder + persona designer. Visible only to an
// administrator (App gates it on isAdmin; the orchestrator re-enforces admin-only on
// every write). Lets an admin define custom roles and personas without a code change:
//   • Data sovereignty — the deal regions/jurisdictions a role may see.
//   • Access level     — which persona agents a role may act as, plus write / Stage-2.
//   • Workflow mgmt    — may advance the pipeline, which stages a role may act in, and
//                        (per persona) exactly which workflow actions + stages are allowed.
//
// All edits persist server-side (Cosmos) and layer over the built-in defaults.
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

  return (
    <div className="adm">
      <style>{CSS}</style>
      <div className="adm-head">
        <h2>Access administration</h2>
        <p>Design custom RBAC roles and personas — data sovereignty, access level, and workflow rights. Changes persist and layer over the built-in defaults.</p>
      </div>
      <nav className="adm-tabs">
        <button className={tab === 'roles' ? 'on' : ''} onClick={() => setTab('roles')}>Roles</button>
        <button className={tab === 'personas' ? 'on' : ''} onClick={() => setTab('personas')}>Personas</button>
      </nav>

      {tab === 'roles'
        ? <RolesEditor data={data} personaIds={personaIds} busy={busy} setBusy={setBusy} post={post} reload={load} />
        : <PersonasEditor data={data} busy={busy} setBusy={setBusy} post={post} reload={load} />}
    </div>
  );
}

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

function RolesEditor({ data, personaIds, busy, setBusy, post, reload }: any) {
  const [draft, setDraft] = useState<Record<string, Role>>({});
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
  const del = async (id: string) => { setBusy(true); try { await post(`/roles/${id}/delete`); await reload(); } finally { setBusy(false); } };
  const addRole = async () => {
    if (!newRole.id.trim()) return;
    setBusy(true);
    try { await post(`/roles/${newRole.id.trim().toLowerCase()}`, { patch: { label: newRole.label || newRole.id, rank: Number(newRole.rank), personas: [], write: false, stage2: false, advanceWorkflow: false, allowedStages: [], regions: [] } }); setNewRole({ id: '', label: '', rank: 50 }); await reload(); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="adm-add">
        <input placeholder="role id (e.g. compliance)" value={newRole.id} onChange={(e) => setNewRole({ ...newRole, id: e.target.value })} />
        <input placeholder="label" value={newRole.label} onChange={(e) => setNewRole({ ...newRole, label: e.target.value })} />
        <input type="number" placeholder="rank" value={newRole.rank} onChange={(e) => setNewRole({ ...newRole, rank: Number(e.target.value) })} style={{ width: 70 }} />
        <button className="adm-btn primary" disabled={busy || !newRole.id.trim()} onClick={addRole}>Add role</button>
      </div>

      {data.roles.map((base: Role) => {
        const r = roleOf(base);
        const dirty = isDirty(base, r);
        return (
          <article key={base.id} className="adm-card">
            <div className="adm-card-h">
              <input className="adm-label" value={r.label} onChange={(e) => edit(base.id, { label: e.target.value })} />
              <span className="adm-id">{base.id}{base.builtin ? ' · built-in' : ' · custom'}{base.isAdminRole ? ' · admin' : ''}</span>
              <label className="adm-rank">rank <input type="number" value={r.rank} onChange={(e) => edit(base.id, { rank: Number(e.target.value) })} /></label>
            </div>
            <div className="adm-row"><span className="adm-k">Access level</span>
              <label className="adm-flag"><input type="checkbox" checked={r.write} onChange={(e) => edit(base.id, { write: e.target.checked })} />can write</label>
              <label className="adm-flag"><input type="checkbox" checked={r.stage2} onChange={(e) => edit(base.id, { stage2: e.target.checked })} />see Stage 2</label>
              <label className="adm-flag"><input type="checkbox" checked={r.advanceWorkflow} onChange={(e) => edit(base.id, { advanceWorkflow: e.target.checked })} />advance workflow</label>
            </div>
            <div className="adm-row col"><span className="adm-k">Personas this role may act as</span>
              <CheckGrid options={personaIds} value={r.personas} onChange={(v) => edit(base.id, { personas: v })} />
            </div>
            <div className="adm-row col"><span className="adm-k">Workflow stages this role may manage <em>(none = all)</em></span>
              <CheckGrid options={data.stages} value={r.allowedStages} onChange={(v) => edit(base.id, { allowedStages: v })} />
            </div>
            <div className="adm-row"><span className="adm-k">Data sovereignty — allowed regions <em>(comma; none = all)</em></span>
              <input className="adm-text" value={r.regions.join(', ')} onChange={(e) => edit(base.id, { regions: splitCsv(e.target.value) })} placeholder="e.g. US, EU" />
            </div>
            <div className="adm-row"><span className="adm-k">Assigned users <em>(oid / upn / name, comma)</em></span>
              <input className="adm-text" value={r.assignments.join(', ')} onChange={(e) => edit(base.id, { assignments: splitCsv(e.target.value) })} placeholder="alice@contoso.com, ..." />
              {base.envAssignedCount ? <span className="adm-note">+{base.envAssignedCount} from env</span> : null}
            </div>
            <div className="adm-foot">
              <button className="adm-btn primary" disabled={busy || !dirty} onClick={() => save(r)}>Save</button>
              {!base.builtin ? <button className="adm-btn danger" disabled={busy} onClick={() => del(base.id)}>Delete</button> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function PersonasEditor({ data, busy, setBusy, post, reload }: any) {
  const [draft, setDraft] = useState<Record<string, Persona>>({});
  const [newP, setNewP] = useState({ id: '', label: '', lane: '' });
  const actionIds = data.actions.map((a: Action) => a.id);
  const actionLabels: Record<string, string> = Object.fromEntries(data.actions.map((a: Action) => [a.id, a.label]));
  const pOf = (p: Persona): Persona => draft[p.id] || p;
  const edit = (id: string, patch: Partial<Persona>) => setDraft((d: any) => ({ ...d, [id]: { ...(d[id] || data.personas.find((x: Persona) => x.id === id)), ...patch } }));

  const save = async (p: Persona) => {
    setBusy(true);
    try {
      await post(`/personas/${p.id}`, {
        patch: { label: p.label, lane: p.lane || undefined },
        actions: p.actions == null ? undefined : p.actions,
        stages: p.stages,
      });
      setDraft((d: any) => { const c = { ...d }; delete c[p.id]; return c; });
      await reload();
    } finally { setBusy(false); }
  };
  const del = async (id: string) => { setBusy(true); try { await post(`/personas/${id}/delete`); await reload(); } finally { setBusy(false); } };
  const addP = async () => {
    if (!newP.id.trim()) return;
    setBusy(true);
    try { await post(`/personas/${newP.id.trim().toLowerCase()}`, { patch: { label: newP.label || newP.id, lane: newP.lane || undefined }, actions: [], stages: [] }); setNewP({ id: '', label: '', lane: '' }); await reload(); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="adm-add">
        <input placeholder="persona id (e.g. esg-lead)" value={newP.id} onChange={(e) => setNewP({ ...newP, id: e.target.value })} />
        <input placeholder="label" value={newP.label} onChange={(e) => setNewP({ ...newP, label: e.target.value })} />
        <select value={newP.lane} onChange={(e) => setNewP({ ...newP, lane: e.target.value })}>
          <option value="">(no lane)</option>
          {Object.entries(data.lanes).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}
        </select>
        <button className="adm-btn primary" disabled={busy || !newP.id.trim()} onClick={addP}>Add persona</button>
      </div>

      {data.personas.map((base: Persona) => {
        const p = pOf(base);
        const effActions = p.actions == null ? data.actions.filter((a: Action) => a.personas.includes(base.id)).map((a: Action) => a.id) : p.actions;
        return (
          <article key={base.id} className="adm-card">
            <div className="adm-card-h">
              <input className="adm-label" value={p.label} onChange={(e) => edit(base.id, { label: e.target.value })} />
              <span className="adm-id">{base.id}{base.builtin ? ' · built-in' : ' · custom'}</span>
              <label className="adm-rank">lane
                <select value={p.lane || ''} onChange={(e) => edit(base.id, { lane: e.target.value || null })}>
                  <option value="">(none)</option>
                  {Object.entries(data.lanes).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}
                </select>
              </label>
            </div>
            <div className="adm-row col"><span className="adm-k">Workflow actions this persona may perform{p.actions == null ? <em> (built-in defaults — edit to override)</em> : null}</span>
              <CheckGrid options={actionIds} value={effActions} labels={actionLabels} onChange={(v) => edit(base.id, { actions: v })} />
            </div>
            <div className="adm-row col"><span className="adm-k">Restrict to stages <em>(none = all)</em></span>
              <CheckGrid options={data.stages} value={p.stages} onChange={(v) => edit(base.id, { stages: v })} />
            </div>
            <div className="adm-foot">
              <button className="adm-btn primary" disabled={busy} onClick={() => save(p)}>Save</button>
              {!base.builtin ? <button className="adm-btn danger" disabled={busy} onClick={() => del(base.id)}>Delete</button> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function isDirty(a: any, b: any) { return JSON.stringify(a) !== JSON.stringify(b); }
function splitCsv(s: string) { return s.split(',').map((x) => x.trim()).filter(Boolean); }

const CSS = `
.adm { padding: 16px 20px 48px; max-width: 1000px; }
.adm-empty, .adm-err { color: var(--muted); }
.adm-err { color: #d66; }
.adm-head h2 { margin: 0 0 4px; font-size: 20px; }
.adm-head p { margin: 0 0 14px; color: var(--muted); font-size: 13px; max-width: 760px; line-height: 1.5; }
.adm-tabs { display: flex; gap: 6px; margin-bottom: 14px; }
.adm-tabs button { border: 1px solid var(--border, #2a2a35); background: none; color: var(--muted); border-radius: 6px; padding: 4px 14px; font-size: 13px; cursor: pointer; }
.adm-tabs button.on { color: var(--accent, #6ea8fe); border-color: var(--accent, #6ea8fe); }
.adm-add { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.adm-add input, .adm-add select { border: 1px solid var(--border, #33333f); background: var(--card, #1b1b22); color: var(--fg); border-radius: 6px; padding: 5px 8px; font-size: 13px; }
.adm-card { border: 1px solid var(--border, #2a2a35); border-radius: 10px; padding: 12px 14px; background: var(--card, #1b1b22); margin-bottom: 12px; }
.adm-card-h { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.adm-label { font-weight: 600; font-size: 14px; background: none; border: none; border-bottom: 1px solid transparent; color: var(--fg); padding: 2px 0; }
.adm-label:hover, .adm-label:focus { border-bottom-color: var(--border, #33333f); outline: none; }
.adm-id { font-size: 11px; color: var(--muted); }
.adm-rank { margin-left: auto; font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
.adm-rank input, .adm-rank select { width: 64px; border: 1px solid var(--border, #33333f); background: var(--bg, #14141a); color: var(--fg); border-radius: 5px; padding: 2px 6px; }
.adm-rank select { width: auto; }
.adm-row { display: flex; align-items: center; gap: 10px; margin: 8px 0; flex-wrap: wrap; font-size: 12.5px; }
.adm-row.col { flex-direction: column; align-items: stretch; }
.adm-k { color: var(--muted); min-width: 180px; }
.adm-k em { font-style: normal; opacity: .7; }
.adm-flag { display: flex; align-items: center; gap: 5px; color: var(--fg); }
.adm-text { flex: 1; min-width: 200px; border: 1px solid var(--border, #33333f); background: var(--bg, #14141a); color: var(--fg); border-radius: 6px; padding: 4px 8px; font-size: 12.5px; }
.adm-note { font-size: 11px; color: var(--muted); }
.adm-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.adm-chip { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--border, #33333f); border-radius: 999px; padding: 2px 10px; font-size: 12px; color: var(--muted); cursor: pointer; }
.adm-chip.on { color: var(--accent, #6ea8fe); border-color: var(--accent, #6ea8fe); }
.adm-chip input { display: none; }
.adm-foot { display: flex; gap: 8px; margin-top: 10px; }
.adm-btn { border: 1px solid var(--border, #33333f); background: none; color: var(--fg); border-radius: 6px; padding: 4px 14px; font-size: 12.5px; cursor: pointer; }
.adm-btn.primary { border-color: var(--accent, #6ea8fe); color: var(--accent, #6ea8fe); }
.adm-btn.danger { border-color: #a44; color: #d88; }
.adm-btn:disabled { opacity: .5; cursor: default; }
`;

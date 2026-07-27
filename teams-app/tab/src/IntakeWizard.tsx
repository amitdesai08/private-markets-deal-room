// Guided deal-intake wizard — a 3-step flow that captures a new deal's details,
// its TERRITORY (region) and DEAL GROUPS (tags) up front, so access maps to Entra
// security groups from the moment the deal is created (no ad-hoc tagging later).
//
// Step 1 Details · Step 2 Territory & groups · Step 3 Review → POST /api/deals/create.
import { useEffect, useState } from 'react';
import { af } from './authFetch';
import type { Region, DealGroup } from './types';

const SECTORS = ['Consumer & Retail', 'Software', 'Healthcare', 'Industrials', 'Financials', 'Energy', 'Business Services', 'Other'];

export default function IntakeWizard({ isAdmin, onClose, onCreated }: { isAdmin: boolean; onClose: () => void; onCreated: (dealId: string) => void }) {
  const [step, setStep] = useState(1);
  const [regions, setRegions] = useState<Region[]>([]);
  const [dealGroups, setDealGroups] = useState<DealGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // form state
  const [company, setCompany] = useState('');
  const [sector, setSector] = useState(SECTORS[0]);
  const [dealSize, setDealSize] = useState('');
  const [hq, setHq] = useState('');
  const [thesis, setThesis] = useState('');
  const [region, setRegion] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [confidential, setConfidential] = useState(false);

  useEffect(() => {
    fetch('/api/regions').then((r) => r.json()).then((d) => setRegions(d?.regions || [])).catch(() => {});
    fetch('/api/deal-groups').then((r) => r.json()).then((d) => setDealGroups(d?.dealGroups || [])).catch(() => {});
  }, []);

  async function addTag() {
    const label = newTag.trim(); if (!label) return;
    let id = dealGroups.find((g) => g.label.toLowerCase() === label.toLowerCase() || g.id === label.toLowerCase())?.id;
    if (!id) {
      const cr = await af('/api/deal-groups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label }) }).catch(() => null);
      if (cr && cr.ok) { const dg = await cr.json(); id = dg.id; setDealGroups((p) => [...p.filter((x) => x.id !== dg.id), dg]); }
      else id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
    if (id && !tags.includes(id)) setTags((t) => [...t, id!]);
    setNewTag('');
  }

  async function create() {
    setBusy(true); setErr('');
    try {
      const r = await af('/api/deals/create', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company: company.trim(), sector, dealSize: Number(dealSize) || 0, hq: hq.trim(), thesis: thesis.trim(), region, tags, confidential }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); setErr(e?.error === 'you cannot create deals' ? 'You don’t have rights to create deals.' : (e?.error || `Failed (${r.status})`)); return; }
      const d = await r.json();
      onCreated(d.id);
    } catch (e: any) { setErr(String(e?.message || e)); }
    finally { setBusy(false); }
  }

  const canNext1 = company.trim().length > 1;
  const lbl = (id: string) => regions.find((r) => r.id === id)?.label || id;
  const tagLabel = (id: string) => dealGroups.find((g) => g.id === id)?.label || id;

  const field: React.CSSProperties = { width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'inherit', boxSizing: 'border-box' };
  const label: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)', marginBottom: 4, display: 'block' };

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" style={{ maxWidth: 560, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <button className="iconbtn" onClick={onClose} aria-label="Close">✕</button>
          <div className="drawer-title">New deal — guided intake</div>
        </div>
        <div className="drawer-body" style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {['Details', 'Territory & groups', 'Review'].map((s, i) => (
              <div key={s} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, fontWeight: 600, padding: '5px 0', borderRadius: 999, background: step === i + 1 ? 'var(--accent, #0369a1)' : 'var(--hover)', color: step === i + 1 ? '#fff' : 'var(--muted)' }}>{i + 1}. {s}</div>
            ))}
          </div>

          {step === 1 ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div><label style={label}>Company / target *</label><input style={field} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Cascadia Timber Partners" autoFocus /></div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}><label style={label}>Sector</label><select style={field} value={sector} onChange={(e) => setSector(e.target.value)}>{SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                <div style={{ flex: 1 }}><label style={label}>Deal size ($M)</label><input style={field} type="number" value={dealSize} onChange={(e) => setDealSize(e.target.value)} placeholder="300" /></div>
              </div>
              <div><label style={label}>Headquarters</label><input style={field} value={hq} onChange={(e) => setHq(e.target.value)} placeholder="City, State, Country (drives the territory)" /></div>
              <div><label style={label}>Thesis (optional)</label><textarea style={{ ...field, minHeight: 60, resize: 'vertical' }} value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="One-line investment thesis" /></div>
            </div>
          ) : step === 2 ? (
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={label}>Territory (region)</label>
                <select style={field} value={region} onChange={(e) => setRegion(e.target.value)}>
                  <option value="">— infer from HQ —</option>
                  {regions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>Access is scoped to members of this territory’s Entra region group. Leave blank to infer from the HQ.</div>
              </div>
              <div>
                <label style={label}>Deal groups (tags)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  {tags.map((t) => (
                    <span key={t} style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'rgba(3,105,161,.16)', color: '#6cb6ea', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      #{tagLabel(t)}<button onClick={() => setTags((x) => x.filter((y) => y !== t))} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>×</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input list="iw-groups" style={{ ...field, flex: 1 }} value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder={isAdmin ? 'pick or create a deal group' : 'pick a deal group'} />
                  <datalist id="iw-groups">{dealGroups.map((g) => <option key={g.id} value={g.label} />)}</datalist>
                  <button className="chbtn" disabled={!newTag.trim()} onClick={addTag}>add</button>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>Each deal group is backed by an Entra security group{isAdmin ? ' (created automatically)' : ''}; its members get this deal’s workspace.</div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} />
                Confidential — hide from the wider pipeline; only the named team + admins see it exists.
              </label>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
              <Row k="Company" v={company} />
              <Row k="Sector" v={sector} />
              <Row k="Deal size" v={dealSize ? `$${dealSize}M` : '—'} />
              <Row k="HQ" v={hq || '—'} />
              <Row k="Territory" v={region ? lbl(region) : `auto (from HQ)`} />
              <Row k="Deal groups" v={tags.length ? tags.map(tagLabel).map((t) => `#${t}`).join('  ') : '—'} />
              <Row k="Confidential" v={confidential ? 'Yes' : 'No'} />
              {err ? <div style={{ color: '#f99', fontSize: 12.5 }}>⚠ {err}</div> : null}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'space-between' }}>
            <button className="btn ghost" onClick={step === 1 ? onClose : () => setStep((s) => s - 1)}>{step === 1 ? 'Cancel' : '‹ Back'}</button>
            {step < 3 ? (
              <button className="btn" disabled={step === 1 && !canNext1} onClick={() => setStep((s) => s + 1)}>Next ›</button>
            ) : (
              <button className="btn" disabled={busy || !canNext1} onClick={create}>{busy ? 'Creating…' : '✓ Create deal'}</button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--muted)' }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span>
    </div>
  );
}

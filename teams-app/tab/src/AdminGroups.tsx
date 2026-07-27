// Admin screen — Deal Groups & Territories. Lets an administrator define the
// customizable DEAL GROUPS that deals fall into (each auto-backed by an Entra
// security group) and review the TERRITORY (region) taxonomy with live deal counts.
// Membership in these Entra groups is what grants deal / channel / SharePoint access.
import { useEffect, useState } from 'react';
import { af } from './authFetch';
import type { Deal, Region, DealGroup } from './types';

type RegionGroup = { id: string; label: string; regions: string[] };

export default function AdminGroups({ deals, onClose }: { deals: Deal[]; onClose: () => void }) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionGroups, setRegionGroups] = useState<RegionGroup[]>([]);
  const [dealGroups, setDealGroups] = useState<DealGroup[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  function reloadGroups() { fetch('/api/deal-groups').then((r) => r.json()).then((d) => setDealGroups(d?.dealGroups || [])).catch(() => {}); }
  useEffect(() => {
    fetch('/api/regions').then((r) => r.json()).then((d) => { setRegions(d?.regions || []); setRegionGroups(d?.regionGroups || []); }).catch(() => {});
    reloadGroups();
  }, []);

  const regionCount = (id: string) => deals.filter((d) => (d.region || '') === id).length;
  const groupDealCount = (id: string) => deals.filter((d) => (d.tags || []).includes(id)).length;

  async function createGroup() {
    const label = newLabel.trim(); if (!label) return;
    setBusy('create'); setNote('');
    try {
      const r = await af('/api/deal-groups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label }) });
      if (r.ok) { const dg = await r.json(); setDealGroups((p) => [...p.filter((x) => x.id !== dg.id), dg]); setNewLabel(''); setNote(dg.groupPending ? 'Deal group created — Entra group pending (connect M365 to provision it).' : 'Deal group + Entra security group created.'); }
      else setNote(r.status === 403 ? 'Admins only.' : `Failed (${r.status}).`);
    } finally { setBusy(''); }
  }
  async function del(id: string) {
    setBusy(id);
    try { await af(`/api/deal-groups/${encodeURIComponent(id)}`, { method: 'DELETE' }); setDealGroups((p) => p.filter((x) => x.id !== id)); }
    finally { setBusy(''); }
  }
  async function reconcile() {
    setBusy('reconcile'); setNote('');
    try { const r = await af('/api/deal-groups/reconcile', { method: 'POST' }); if (r.ok) { setNote('Retried Entra group provisioning for pending deal groups.'); reloadGroups(); } else setNote('Admins only.'); }
    finally { setBusy(''); }
  }

  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--card)' };
  const rGroupLabel = (id: string) => regions.find((r) => r.id === id)?.label || id;

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" style={{ maxWidth: 640, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <button className="iconbtn" onClick={onClose} aria-label="Close">✕</button>
          <div className="drawer-title">Deal groups &amp; territories</div>
        </div>
        <div className="drawer-body" style={{ padding: 16, display: 'grid', gap: 16 }}>
          {note ? <div style={{ fontSize: 12.5, color: 'var(--muted)', background: 'var(--hover)', padding: '8px 10px', borderRadius: 8 }}>{note}</div> : null}

          {/* Deal groups */}
          <section style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Deal groups <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· customizable tags → Entra security groups</span></div>
              <button className="chbtn" disabled={busy === 'reconcile'} onClick={reconcile} title="Retry Entra group creation for any pending groups">↻ reconcile</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <input style={{ flex: 1, fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg, #111)', color: 'inherit' }} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') createGroup(); }} placeholder="New deal group — e.g. Fund V, Healthcare Pod, Project Falcon clean-team" />
              <button className="btn" disabled={busy === 'create' || !newLabel.trim()} onClick={createGroup}>{busy === 'create' ? '…' : '+ Create'}</button>
            </div>
            {dealGroups.length ? (
              <div style={{ display: 'grid', gap: 6 }}>
                {dealGroups.map((g) => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>#{g.label}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, padding: '1px 8px', borderRadius: 999, background: g.groupPending ? 'rgba(216,128,0,.16)' : 'rgba(0,170,102,.14)', color: g.groupPending ? '#d80' : '#0a6' }}>{g.groupPending ? '⏳ Entra group pending' : '✓ Entra group'}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{groupDealCount(g.id)} deal(s)</span>
                    <button className="chbtn" style={{ marginLeft: 'auto' }} disabled={busy === g.id} onClick={() => del(g.id)}>Remove</button>
                  </div>
                ))}
              </div>
            ) : <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No deal groups yet. Create one above; MDs can then tag deals into it from the deal cockpit.</div>}
          </section>

          {/* Territories */}
          <section style={card}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Territories <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· region groups scope who sees which deals</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8 }}>
              {regions.map((r) => (
                <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{regionCount(r.id)} deal(s) · DealRoom-Region-{r.label.replace(/\s+/g, '')}</div>
                </div>
              ))}
            </div>
            {regionGroups.length ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)', marginBottom: 6 }}>Grouped territories</div>
                {regionGroups.map((g) => (
                  <div key={g.id} style={{ fontSize: 12.5, padding: '3px 0' }}>
                    <b>{g.label}</b> <span style={{ color: 'var(--muted)' }}>= {g.regions.map(rGroupLabel).join(' + ')}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>Add a user to a <code>DealRoom-Region-*</code> group to scope them to that territory. Users in no region group (MDs, partners, admins) see every territory.</div>
          </section>
        </div>
      </aside>
    </div>
  );
}

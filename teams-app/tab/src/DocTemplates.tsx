import { useEffect, useState } from 'react';

// Document templates — white-label & tweak the generated IC memo, deck and models.
// Reads/writes /api/doc-template (write is admin-gated via ssoToken + as, like Admin).
type Sections = { merits: boolean; financials: boolean; valuation: boolean; valueCreation: boolean; findings: boolean };
type Template = {
  fundName: string; accentColor: string; inkColor: string; confidentialLabel: string;
  coverEyebrow: string; disclaimer: string; sections: Sections;
};

const SECTION_LABELS: { key: keyof Sections; label: string }[] = [
  { key: 'merits', label: 'Investment merits' },
  { key: 'financials', label: 'Financial summary' },
  { key: 'valuation', label: 'Valuation & returns' },
  { key: 'valueCreation', label: 'Value creation plan' },
  { key: 'findings', label: 'Findings by workstream' },
];

export default function DocTemplates({ ssoToken, viewAs }: { ssoToken?: string; viewAs?: string }) {
  const [tpl, setTpl] = useState<Template | null>(null);
  const [defaults, setDefaults] = useState<Template | null>(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  async function load() {
    try {
      const r = await fetch('/api/doc-template');
      const d = await r.json();
      setTpl(d.template); setDefaults(d.defaults);
    } catch { setNote('Could not load templates.'); }
  }
  useEffect(() => { load(); }, []);

  function set<K extends keyof Template>(k: K, v: Template[K]) { setTpl((t) => (t ? { ...t, [k]: v } : t)); }
  function setSection(k: keyof Sections, v: boolean) { setTpl((t) => (t ? { ...t, sections: { ...t.sections, [k]: v } } : t)); }

  async function save() {
    if (!tpl) return;
    setBusy('save'); setNote('');
    try {
      const r = await fetch('/api/admin/doc-template', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...tpl, ssoToken, as: viewAs || undefined }) });
      if (r.ok) { const d = await r.json(); setTpl(d.template); setNote('Saved — all newly generated documents will use this template.'); }
      else setNote(r.status === 403 ? 'Admins only.' : `Failed (${r.status}).`);
    } finally { setBusy(''); }
  }
  async function reset() {
    setBusy('reset'); setNote('');
    try {
      const r = await fetch('/api/admin/doc-template/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ssoToken, as: viewAs || undefined }) });
      if (r.ok) { const d = await r.json(); setTpl(d.template); setNote('Reset to the built-in template.'); }
      else setNote(r.status === 403 ? 'Admins only.' : `Failed (${r.status}).`);
    } finally { setBusy(''); }
  }

  if (!tpl) return <div className="dt-wrap"><style>{CSS}</style><p className="dt-muted">Loading templates…</p></div>;

  const accent = `#${(tpl.accentColor || '2E74B5').replace(/^#/, '')}`;
  const ink = `#${(tpl.inkColor || '1F3864').replace(/^#/, '')}`;

  return (
    <div className="dt-wrap">
      <style>{CSS}</style>
      <p className="dt-intro">
        White-label and tweak the documents The Deal Room generates — the IC memo (Word), IC deck (PowerPoint) and
        the Excel models. Changes apply to every document generated from now on; nothing here affects existing files.
      </p>

      <div className="dt-grid">
        <div className="dt-card">
          <div className="dt-card-h">Branding</div>
          <label className="dt-f"><span>Fund / firm name</span>
            <input value={tpl.fundName} maxLength={80} onChange={(e) => set('fundName', e.target.value)} placeholder="e.g. Meridian Capital Partners" />
          </label>
          <label className="dt-f"><span>Cover eyebrow (memo)</span>
            <input value={tpl.coverEyebrow} maxLength={80} onChange={(e) => set('coverEyebrow', e.target.value)} placeholder="INVESTMENT COMMITTEE MEMORANDUM" />
          </label>
          <label className="dt-f"><span>Confidentiality label</span>
            <input value={tpl.confidentialLabel} maxLength={40} onChange={(e) => set('confidentialLabel', e.target.value)} placeholder="CONFIDENTIAL" />
          </label>
          <div className="dt-row">
            <label className="dt-f dt-color"><span>Header / ink colour</span>
              <div className="dt-swatch"><input type="color" value={ink} onChange={(e) => set('inkColor', e.target.value.replace(/^#/, '').toUpperCase())} /><code>#{(tpl.inkColor || '').replace(/^#/, '')}</code></div>
            </label>
            <label className="dt-f dt-color"><span>Accent colour</span>
              <div className="dt-swatch"><input type="color" value={accent} onChange={(e) => set('accentColor', e.target.value.replace(/^#/, '').toUpperCase())} /><code>#{(tpl.accentColor || '').replace(/^#/, '')}</code></div>
            </label>
          </div>
          <label className="dt-f"><span>Confidentiality / basis-of-preparation note</span>
            <textarea rows={4} value={tpl.disclaimer} maxLength={800} onChange={(e) => set('disclaimer', e.target.value)} />
          </label>
        </div>

        <div className="dt-card">
          <div className="dt-card-h">Sections in the IC memo</div>
          <p className="dt-muted">Turn optional sections on or off. The executive summary, deal snapshot, risks, diligence status, IC readiness and recommendation are always included.</p>
          <div className="dt-toggles">
            {SECTION_LABELS.map((s) => (
              <label key={s.key} className="dt-toggle">
                <input type="checkbox" checked={!!tpl.sections?.[s.key]} onChange={(e) => setSection(s.key, e.target.checked)} />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
          <div className="dt-preview" style={{ borderColor: accent }}>
            <div className="dt-prev-eyebrow" style={{ color: accent }}>{tpl.coverEyebrow || 'INVESTMENT COMMITTEE MEMORANDUM'}</div>
            <div className="dt-prev-title" style={{ color: ink }}>Project Sterling</div>
            <div className="dt-prev-sub">{tpl.fundName || 'The Deal Room'} · {tpl.confidentialLabel || 'CONFIDENTIAL'}</div>
            <div className="dt-prev-rule" style={{ background: accent }} />
            <div className="dt-prev-note">Live preview of the memo cover styling.</div>
          </div>
        </div>
      </div>

      <div className="dt-actions">
        <button className="dt-btn primary" disabled={busy === 'save'} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save template'}</button>
        <button className="dt-btn" disabled={busy === 'reset'} onClick={reset}>{busy === 'reset' ? '…' : 'Reset to default'}</button>
        {note ? <span className="dt-note">{note}</span> : null}
      </div>
    </div>
  );
}

const CSS = `
.dt-wrap { padding: 14px 20px 24px; }
.dt-intro { color: var(--muted); font-size: 12.5px; max-width: 780px; line-height: 1.55; margin: 0 0 14px; }
.dt-muted { color: var(--muted); font-size: 12px; }
.dt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 860px) { .dt-grid { grid-template-columns: 1fr; } }
.dt-card { border: 1px solid var(--border, #2a2a35); border-radius: 10px; padding: 14px; background: var(--card, #1b1b22); }
.dt-card-h { font-weight: 700; font-size: 14px; margin-bottom: 10px; }
.dt-f { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; font-size: 12px; color: var(--muted); }
.dt-f input, .dt-f textarea { font-size: 13px; padding: 7px 9px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg, #111); color: inherit; font-family: inherit; }
.dt-row { display: flex; gap: 12px; }
.dt-color { flex: 1; }
.dt-swatch { display: flex; align-items: center; gap: 8px; }
.dt-swatch input[type=color] { width: 40px; height: 30px; padding: 0; border: 1px solid var(--border); border-radius: 6px; background: none; cursor: pointer; }
.dt-swatch code { font-size: 12px; color: var(--muted); }
.dt-toggles { display: grid; gap: 8px; margin: 6px 0 14px; }
.dt-toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.dt-preview { border: 1px solid; border-radius: 8px; padding: 14px; background: var(--bg, #0f0f14); }
.dt-prev-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; }
.dt-prev-title { font-size: 22px; font-weight: 800; margin: 4px 0 2px; }
.dt-prev-sub { font-size: 11px; color: var(--muted); }
.dt-prev-rule { height: 3px; width: 60%; margin: 10px 0 8px; border-radius: 2px; }
.dt-prev-note { font-size: 10.5px; color: var(--muted); font-style: italic; }
.dt-actions { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
.dt-btn { border: 1px solid var(--border); background: var(--card); color: inherit; border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
.dt-btn.primary { background: var(--accent, #2E74B5); border-color: var(--accent, #2E74B5); color: #fff; font-weight: 600; }
.dt-note { font-size: 12px; color: var(--muted); }
`;

import { useEffect, useState } from 'react';
import DataSources from './DataSources';
import Admin from './Admin';
import DocTemplates from './DocTemplates';

// Settings panel — houses the technical / configuration surfaces (data-source
// connectors, and access administration for admins) so the primary navigation stays
// purely deal-focused. Opened from the gear in the top bar.
export default function Settings({ isAdmin, ssoToken, viewAs, onClose }: {
  isAdmin: boolean; ssoToken?: string; viewAs?: string; onClose: () => void;
}) {
  const [tab, setTab] = useState<'sources' | 'templates' | 'admin'>('sources');
  const showAdmin = isAdmin && tab === 'admin';
  const showTemplates = isAdmin && tab === 'templates';

  // Demo mode is switched here as well as in Access administration, because switching it
  // OFF takes the administration tab away with it: outside Teams the demo profile is the
  // only thing making anyone an administrator. The switch has to outlive the thing it
  // switches off.
  const [demo, setDemo] = useState<{ demoMode: boolean; demoModeConfigurable: boolean } | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  useEffect(() => {
    fetch('/api/demo-mode').then((r) => r.json()).then(setDemo).catch(() => setDemo(null));
  }, []);
  const toggleDemo = async () => {
    if (!demo) return;
    setDemoBusy(true);
    try {
      const next = await fetch('/api/demo-mode', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ on: !demo.demoMode }),
      }).then((r) => r.json());
      setDemo(next);
      // The roster, the persona switcher and every access answer are resolved at load.
      window.location.reload();
    } catch { setDemoBusy(false); }
  };

  return (
    <div className="settings">
      <style>{CSS}</style>
      <div className="set-head">
        {/* Just "Back". It used to say "Back to deals" and returned you to whichever
            main tab you came from — Home, Fund & Portfolio or Report. */}
        <button className="set-back" onClick={onClose}>← Back</button>
        <h2>Settings</h2>
        {/* The blurb promised "access" to everyone, and the access section only exists
            for administrators. Describe what this person can actually reach. */}
        <p>{isAdmin
          ? 'Data sources, document templates and access administration. Kept here so the deal views stay focused on your pipeline.'
          : 'Where the market and news data on your deals comes from. Kept here so the deal views stay focused on your pipeline.'}</p>
      </div>
      {demo?.demoModeConfigurable ? (
        <div className="set-demo">
          <div>
            <div className="set-demo-t">Demo mode is {demo.demoMode ? 'on' : 'off'}</div>
            <div className="set-demo-s">
              {demo.demoMode
                ? 'You can sign in as another member of the firm and see the product as they see it. Turn this off to use it as yourself.'
                : 'Everyone sees the product as themselves. Turn it back on to review the access model from another seat.'}
            </div>
          </div>
          <button className="btn" disabled={demoBusy} onClick={toggleDemo}>
            {demoBusy ? 'Switching…' : demo.demoMode ? 'Turn demo mode off' : 'Turn demo mode on'}
          </button>
        </div>
      ) : null}
      <nav className="set-tabs">
        <button className={tab === 'sources' ? 'on' : ''} onClick={() => setTab('sources')}>Data sources</button>
        {isAdmin ? <button className={tab === 'templates' ? 'on' : ''} onClick={() => setTab('templates')}>Document templates</button> : null}
        {isAdmin ? <button className={tab === 'admin' ? 'on' : ''} onClick={() => setTab('admin')}>Access administration</button> : null}
      </nav>
      <div className="set-body">
        {showAdmin ? <Admin ssoToken={ssoToken} viewAs={viewAs} /> : showTemplates ? <DocTemplates ssoToken={ssoToken} viewAs={viewAs} /> : <DataSources isAdmin={isAdmin} />}
      </div>
    </div>
  );
}

const CSS = `
.settings { padding: 4px 0 0; }
.set-demo { display: flex; align-items: center; gap: 16px; margin: 10px 20px 0; padding: 12px 14px; border: 1px solid var(--border, #2a2a35); border-radius: 10px; background: var(--card); }
.set-demo > div { flex: 1; min-width: 0; }
.set-demo-t { font-weight: 650; font-size: 13px; }
.set-demo-s { color: var(--muted); font-size: 12px; margin-top: 2px; }
.set-head { padding: 8px 20px 0; }
.set-back { border: none; background: none; color: var(--accent, #6ea8fe); cursor: pointer; font-size: 12.5px; padding: 4px 0; }
.set-head h2 { margin: 6px 0 4px; font-size: 20px; }
.set-head p { margin: 0 0 8px; color: var(--muted); font-size: 12.5px; max-width: 720px; line-height: 1.5; }
.set-tabs { display: flex; gap: 6px; padding: 0 20px; border-bottom: 1px solid var(--border, #2a2a35); }
.set-tabs button { border: none; background: none; color: var(--muted); border-bottom: 2px solid transparent; padding: 8px 12px; font-size: 13px; cursor: pointer; }
.set-tabs button.on { color: var(--accent, #6ea8fe); border-bottom-color: var(--accent, #6ea8fe); }
`;

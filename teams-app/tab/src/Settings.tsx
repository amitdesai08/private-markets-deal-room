import { useState } from 'react';
import DataSources from './DataSources';
import Admin from './Admin';

// Settings panel — houses the technical / configuration surfaces (data-source
// connectors, and access administration for admins) so the primary navigation stays
// purely deal-focused. Opened from the gear in the top bar.
export default function Settings({ isAdmin, ssoToken, viewAs, onClose }: {
  isAdmin: boolean; ssoToken?: string; viewAs?: string; onClose: () => void;
}) {
  const [tab, setTab] = useState<'sources' | 'admin'>('sources');
  const showAdmin = isAdmin && tab === 'admin';

  return (
    <div className="settings">
      <style>{CSS}</style>
      <div className="set-head">
        <button className="set-back" onClick={onClose}>← Back to deals</button>
        <h2>Settings</h2>
        <p>Connectivity and access configuration. These technical surfaces live here so the deal views stay focused on the data.</p>
      </div>
      <nav className="set-tabs">
        <button className={tab === 'sources' ? 'on' : ''} onClick={() => setTab('sources')}>Data Sources</button>
        {isAdmin ? <button className={tab === 'admin' ? 'on' : ''} onClick={() => setTab('admin')}>Access Administration</button> : null}
      </nav>
      <div className="set-body">
        {showAdmin ? <Admin ssoToken={ssoToken} viewAs={viewAs} /> : <DataSources />}
      </div>
    </div>
  );
}

const CSS = `
.settings { padding: 4px 0 0; }
.set-head { padding: 8px 20px 0; }
.set-back { border: none; background: none; color: var(--accent, #6ea8fe); cursor: pointer; font-size: 12.5px; padding: 4px 0; }
.set-head h2 { margin: 6px 0 4px; font-size: 20px; }
.set-head p { margin: 0 0 8px; color: var(--muted); font-size: 12.5px; max-width: 720px; line-height: 1.5; }
.set-tabs { display: flex; gap: 6px; padding: 0 20px; border-bottom: 1px solid var(--border, #2a2a35); }
.set-tabs button { border: none; background: none; color: var(--muted); border-bottom: 2px solid transparent; padding: 8px 12px; font-size: 13px; cursor: pointer; }
.set-tabs button.on { color: var(--accent, #6ea8fe); border-bottom-color: var(--accent, #6ea8fe); }
`;

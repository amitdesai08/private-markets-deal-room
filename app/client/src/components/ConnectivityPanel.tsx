import { useEffect, useState } from 'react';
import type { Connector, ConnectorTest } from '../types';
import { api } from '../api';
import { timeAgo } from './Bits';

const ROLE_META: Record<string, { tag: string; color: string }> = {
  discover: { tag: 'Discover', color: '#2563eb' },
  confirm: { tag: 'Confirm', color: '#7c3aed' },
  quality: { tag: 'Quality', color: '#0d9488' }
};

// Home connectivity panel — the real status of every data source. Web and the
// MCP connectors (Morningstar, LSEG, Moody's) are tested for real; unwired
// vendor DBs report disconnected honestly.
export function ConnectivityPanel() {
  const [connectors, setConnectors] = useState<Connector[] | null>(null);
  const [tests, setTests] = useState<Record<string, ConnectorTest>>({});
  const [testing, setTesting] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    // Surface the result of an in-app connector sign-in (callback redirects here
    // with ?connected=<provider> or ?connect_error=<msg>), then clean the URL.
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const err = params.get('connect_error');
    let justConnected: string | null = null;
    if (connected) {
      justConnected = connected;
      setNotice({ kind: 'ok', text: `${connected} connected.` });
    } else if (err) {
      setNotice({ kind: 'err', text: `Sign-in failed: ${err}` });
    }
    if (connected || err) window.history.replaceState({}, '', window.location.pathname);

    api.connectors().then((cs) => {
      setConnectors(cs);
      cs.filter((c) => c.testable || c.id === justConnected).forEach((c) => runTest(c.id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runTest(id: string) {
    setTesting((s) => new Set(s).add(id));
    try {
      const r = await api.testConnector(id);
      setTests((t) => ({ ...t, [id]: r }));
    } catch {
      /* leave prior state; the row shows its last-known status */
    } finally {
      setTesting((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  if (!connectors) return null;

  const liveCount = connectors.filter((c) => (tests[c.id]?.status ?? c.status) === 'connected').length;

  return (
    <div className="conn-panel">
      <div className="conn-panel-hd">
        <div>
          <div className="conn-panel-eyebrow">Data-source connectivity</div>
          <div className="conn-panel-sub">Live status of the sources that feed sourcing, screening & diligence</div>
        </div>
        <span className="conn-panel-count">{liveCount} / {connectors.length} connected</span>
      </div>

      {notice && (
        <div className={`conn-notice ${notice.kind}`}>
          {notice.kind === 'ok' ? '✓' : '⚠'} {notice.text}
          <button className="conn-notice-x" onClick={() => setNotice(null)}>✕</button>
        </div>
      )}

      <div className="src-table conn-table">
        <div className="src-row src-th">
          <div>Source</div>
          <div>Primary job</div>
          <div>Sweet spot</div>
          <div>Role</div>
        </div>
        {connectors.map((c) => (
          <ConnectorRow
            key={c.id}
            c={c}
            test={tests[c.id]}
            testing={testing.has(c.id)}
            expanded={expanded === c.id}
            onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
            onTest={() => runTest(c.id)}
          />
        ))}
      </div>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'connected': return '● Connected';
    case 'degraded': return '◐ Degraded';
    case 'unknown': return '… Checking';
    default: return '○ Disconnected';
  }
}

function ConnectorRow({ c, test, testing, expanded, onToggle, onTest }: {
  c: Connector;
  test?: ConnectorTest;
  testing: boolean;
  expanded: boolean;
  onToggle: () => void;
  onTest: () => void;
}) {
  const role = ROLE_META[c.role];
  const status = testing && !test ? 'unknown' : (test?.status ?? c.status);
  const latencyMs = test?.latencyMs ?? c.latencyMs;
  const lastSync = test?.lastSync ?? c.lastSync;
  const dotClass = status === 'connected' ? 'connected' : status === 'degraded' ? 'degraded' : 'disconnected';

  return (
    <>
      <button className={`src-row ${expanded ? 'exp' : ''}`} onClick={onToggle}>
        <div className="src-name">
          <span className={`sdot2 ${dotClass}`} />
          {c.name}
        </div>
        <div className="src-job">{c.primaryJob}</div>
        <div className="src-sweet">{c.sweetSpot}</div>
        <div><span className="role-tag" style={{ background: role.color }}>{role.tag}</span></div>
      </button>
      {expanded && (
        <div className="src-detail">
          <div className="src-detail-grid">
            <span><i>Connection</i><b className={`conn ${dotClass}`}>{statusLabel(status)}</b></span>
            <span><i>Latency</i>{latencyMs != null ? `${latencyMs} ms` : '—'}</span>
            <span><i>Last sync</i>{lastSync ? timeAgo(lastSync) : 'never'}</span>
          </div>
          <div className="src-detail-actions">
            {c.testable && (
              <button className="btn" onClick={onTest} disabled={testing}>
                {testing ? 'Testing…' : '⚡ Test connectivity'}
              </button>
            )}
            {c.connectable && status !== 'connected' && (
              <a className="conn-connect" href={`/api/connectors/${c.provider}/login?returnTo=/`}>
                🔗 Connect {c.name}
              </a>
            )}
            {c.kind === 'database' && (
              <span className="conn-note">Integration not wired — no live connection.</span>
            )}
            {test && (
              <span className={`test-result ${test.ok ? 'ok' : 'warn'}`}>{test.ok ? '✓' : '⚠'} {test.message}</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

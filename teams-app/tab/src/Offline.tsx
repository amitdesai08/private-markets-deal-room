import { useState } from 'react';

// Offline gate — shown when platform power control is on and the orchestrator (the
// data plane) is asleep to save cost. Anyone can wake it for a fixed lease (default
// 1 hour, which then auto-stops) or, via the advanced path, keep it online
// indefinitely. Polls status after a wake and reloads into the app once it's online.
// Backed by the Teams app's /api/platform/{status,wake} endpoints (server/platform.js).

export type PlatformStatus = {
  control: boolean;
  online: boolean;
  running?: string;
  appName?: string | null;
  leaseHours?: number;
  isAdmin?: boolean;
  adminGated?: boolean;
  lease?: { mode: string; expiresAt?: string | null; minutesRemaining?: number | null; setBy?: string | null } | null;
};

const hrs = (n: number) => `${n} hour${n > 1 ? 's' : ''}`;

export default function Offline({ status, ssoToken }: { status: PlatformStatus; ssoToken?: string | null }) {
  const [phase, setPhase] = useState<'idle' | 'starting'>('idle');
  const [mode, setMode] = useState<'hour' | 'indefinite'>('hour');
  const [err, setErr] = useState('');
  const leaseHours = status.leaseHours || 1;
  const canIndefinite = status.isAdmin !== false; // gate off, or the caller is an admin

  async function wake(m: 'hour' | 'indefinite') {
    setMode(m);
    setPhase('starting');
    setErr('');
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (ssoToken) headers.authorization = `Bearer ${ssoToken}`;
      const r = await fetch('/api/platform/wake', {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode: m, ssoToken: ssoToken || undefined }),
      });
      if (r.status === 403) {
        setErr('Only an admin can keep the platform online indefinitely. Use “for ' + hrs(leaseHours) + '”, or ask an admin.');
        setPhase('idle');
        return;
      }
      if (!r.ok) throw new Error(`Couldn't start the platform (${r.status}).`);
    } catch (e) {
      setErr(String((e as Error).message || e));
      setPhase('idle');
      return;
    }
    const started = Date.now();
    const poll = async () => {
      try {
        const s: PlatformStatus = await fetch('/api/platform/status').then((x) => x.json());
        if (s.online) {
          window.location.reload();
          return;
        }
      } catch {
        /* keep polling */
      }
      if (Date.now() - started > 180_000) {
        setErr('The platform is taking longer than expected. Give it another moment, then retry.');
        setPhase('idle');
        return;
      }
      setTimeout(poll, 4000);
    };
    setTimeout(poll, 4000);
  }

  return (
    <div className="off-wrap">
      <style>{CSS}</style>
      <div className="off-card">
        <div className="off-badge">● Offline</div>
        <h1>The Deal Room is asleep</h1>
        {phase === 'starting' ? (
          <>
            <p className="off-sub">
              Waking the platform{mode === 'indefinite' ? '' : ` for ${hrs(leaseHours)}`}… this takes about a minute.
            </p>
            <div className="off-spinner" aria-label="starting"><span /><span /><span /></div>
            <p className="off-note">You'll be dropped straight into the deal room once it's up.</p>
          </>
        ) : (
          <>
            <p className="off-sub">
              To keep costs near zero, the platform powers down when it's idle. Bring it back online to continue.
            </p>
            <div className="off-actions">
              <button className="off-btn primary" onClick={() => wake('hour')}>▶ Bring online for {hrs(leaseHours)}</button>
              {canIndefinite ? (
                <button className="off-btn ghost" onClick={() => wake('indefinite')}>Keep online indefinitely →</button>
              ) : null}
            </div>
            <p className="off-note">
              <strong>{hrs(leaseHours)}</strong> automatically powers back down when the time is up — ideal for a quick look.
              {canIndefinite ? (
                <><br /><strong>Indefinitely</strong> stays on until someone stops it (the admin shutdown path).</>
              ) : (
                <><br />Keeping it online <strong>indefinitely</strong> is an admin action.</>
              )}
            </p>
            {err ? <p className="off-err">{err}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}

// Slim banner shown at the top of the app while a temporary (auto-stopping) lease is
// active, so users know the clock is ticking and can extend it.
export function OnlineLeaseBanner({ status, onExtend }: { status: PlatformStatus; onExtend: () => void }) {
  const lease = status.lease;
  if (!lease || lease.mode !== 'temporary') return null;
  const mins = lease.minutesRemaining ?? null;
  return (
    <div className="lease-bar">
      <style>{BANNER_CSS}</style>
      <span className="lease-dot" />
      <span>
        Temporary session{mins != null ? ` — online for ~${mins} more min` : ''}. It will power down automatically.
      </span>
      <button className="lease-ext" onClick={onExtend}>Extend {status.leaseHours || 1}h</button>
    </div>
  );
}

const BANNER_CSS = `
.lease-bar { display: flex; align-items: center; gap: 8px; padding: 6px 16px; font-size: 12.5px; background: #b8860b1a; color: var(--fg); border-bottom: 1px solid #b8860b55; }
.lease-dot { width: 8px; height: 8px; border-radius: 50%; background: #b8860b; flex: 0 0 auto; animation: leasepulse 2s infinite ease-in-out; }
.lease-ext { margin-left: auto; border: 1px solid #b8860b; background: transparent; color: #b8860b; font: inherit; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 6px; cursor: pointer; }
.lease-ext:hover { background: #b8860b; color: #fff; }
@keyframes leasepulse { 0%,100% { opacity: .4; } 50% { opacity: 1; } }
`;

const CSS = `
.off-wrap { position: fixed; inset: 0; display: grid; place-items: center; padding: 24px; background: var(--bg, #0f1115); color: var(--fg, #e8eaed); font: 14px/1.55 "Segoe UI", system-ui, sans-serif; }
.off-card { max-width: 520px; width: 100%; background: var(--card, #1a1d24); border: 1px solid var(--border, #2a2e37); border-radius: 16px; padding: 32px 30px; box-shadow: 0 12px 40px rgba(0,0,0,.35); text-align: center; }
.off-badge { display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: .3px; color: #b23b3b; background: #b23b3b1a; border: 1px solid #b23b3b55; padding: 4px 12px; border-radius: 999px; margin-bottom: 14px; }
.off-card h1 { margin: 0 0 8px; font-size: 22px; }
.off-sub { margin: 0 0 20px; color: var(--muted, #9aa0aa); }
.off-actions { display: flex; flex-direction: column; gap: 10px; max-width: 340px; margin: 0 auto 16px; }
.off-btn { border-radius: 10px; padding: 12px 16px; font: inherit; font-weight: 600; cursor: pointer; border: 1px solid transparent; }
.off-btn.primary { background: var(--accent, #4f6bed); color: #fff; border-color: var(--accent, #4f6bed); font-size: 15px; }
.off-btn.primary:hover { filter: brightness(1.08); }
.off-btn.ghost { background: transparent; color: var(--fg, #e8eaed); border-color: var(--border, #2a2e37); }
.off-btn.ghost:hover { border-color: var(--accent, #4f6bed); color: var(--accent, #4f6bed); }
.off-note { margin: 4px 0 0; font-size: 12px; color: var(--muted, #9aa0aa); line-height: 1.6; }
.off-err { margin-top: 14px; color: #d9756b; font-size: 13px; }
.off-spinner { display: inline-flex; gap: 7px; margin: 6px 0 14px; }
.off-spinner span { width: 10px; height: 10px; border-radius: 50%; background: var(--accent, #4f6bed); animation: offb 1.2s infinite ease-in-out; }
.off-spinner span:nth-child(2) { animation-delay: .2s; }
.off-spinner span:nth-child(3) { animation-delay: .4s; }
@keyframes offb { 0%,80%,100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-5px); } }
`;

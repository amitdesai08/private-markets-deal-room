import { useEffect, useState } from 'react';
import type { Candidate, Cohort, PassReasons } from '../types';
import { api } from '../api';

type StageKey = 'O2' | 'O3' | 'O4';

interface Props {
  stage: StageKey;
  title: string;
  subtitle: string;
  advanceLabel: string;      // e.g. "Advance to Triage" | "⚡ PURSUE"
  advanceClass?: string;     // extra class for the advance button
  agent: string;             // orchestration agent name (for the batch line)
  onChanged: () => void;     // refresh funnel/roster after an action
}

const BAND_LABEL: Record<string, string> = { strong: 'strong fit', moderate: 'moderate fit', weak: 'weak fit', excluded: 'excluded' };

// A cohort desk — the actionable list of candidates at one funnel stage. Each
// candidate can be Advanced (to the next step), Passed (with reason) or Parked
// (with reason). O2 shows the agent's knockout recommendation; O3/O4 rank by fit.
export function CohortDesk({ stage, title, subtitle, advanceLabel, advanceClass, agent, onChanged }: Props) {
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [reasons, setReasons] = useState<PassReasons | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; kind: 'pass' | 'park' } | null>(null);

  async function refresh() {
    setCohort(await api.cohort(stage));
  }
  useEffect(() => {
    refresh();
    api.passReasons().then(setReasons).catch(() => {});
  }, [stage]);

  async function act(c: Candidate, action: string, reason?: string) {
    setBusy(c.id);
    try {
      if (stage === 'O2') await api.screenCandidate(c.id, action, reason);
      else if (stage === 'O3') await api.triageCandidate(c.id, action, reason);
      else await api.gateCandidate(c.id, action, reason);
      setMenu(null);
      await refresh();
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  if (!cohort) return <div className="panel"><div className="pb"><div className="finding empty">Loading cohort…</div></div></div>;

  const passPool = reasons?.pass?.[stage] || [];
  const parkPool = reasons?.park || [];

  return (
    <div className="panel cohort-panel">
      <div className="ph">
        <span className="ic">▤</span>
        <h3>{title}</h3>
        <span className="sub" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11.5, textTransform: 'none', letterSpacing: 0 }}>
          {cohort.candidates.length} active · {agent}
        </span>
      </div>
      <div className="pb">
        <div className="cohort-note">{subtitle}</div>

        {cohort.candidates.length === 0 && (
          <div className="finding empty">No candidates awaiting this step. They arrive as the previous stage advances them.</div>
        )}

        <div className="cohort-list">
          {cohort.candidates.map((c) => (
            <div className={`cohort-row ${c.band}`} key={c.id}>
              {typeof c.rank === 'number' ? (
                <div className="co-rank" title="Relative rank in this cohort">#{c.rank}</div>
              ) : (
                <div className={`co-score ${c.band}`}>{c.score}</div>
              )}

              <div className="co-main">
                <div className="co-name">
                  {c.company}
                  <span className={`co-band ${c.band}`}>{BAND_LABEL[c.band]}</span>
                  {typeof c.rank === 'number' && <span className="co-scoretag">{c.score}</span>}
                </div>
                <div className="co-meta">{c.sector} · {c.region} · €{c.dealSize}M · {c.ownership}</div>
                <div className="co-fin">
                  <span>rev €{c.revenue}M</span><span>EBITDA €{c.ebitda}M</span>
                  <span>{c.ebitdaMargin}% margin</span><span>{c.growth >= 0 ? '+' : ''}{c.growth}% growth</span>
                </div>

                {stage === 'O2' && (
                  <div className={`co-rec ${c.screenRec.action}`}>
                    <b>Agent:</b> {c.screenRec.action === 'advance'
                      ? 'clears the hard knockouts — advance'
                      : `flag — ${c.screenRec.knockouts.map((k) => k.detail).join('; ')}`}
                  </div>
                )}
              </div>

              <div className="co-actions">
                {menu && menu.id === c.id ? (
                  <div className="co-reason">
                    <span className="co-reason-h">{menu.kind === 'pass' ? 'Pass — reason' : 'Park — reason'}</span>
                    <select id={`rsn-${c.id}`} defaultValue="" className="co-reason-sel">
                      <option value="" disabled>Select a reason…</option>
                      {(menu.kind === 'pass' ? passPool : parkPool).map((r) => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </select>
                    <div className="co-reason-btns">
                      <button className="btn tiny" onClick={() => setMenu(null)} disabled={busy === c.id}>Cancel</button>
                      <button
                        className={`btn tiny ${menu.kind === 'pass' ? 'danger' : 'warn'}`}
                        disabled={busy === c.id}
                        onClick={() => {
                          const sel = document.getElementById(`rsn-${c.id}`) as HTMLSelectElement | null;
                          if (!sel || !sel.value) return;
                          act(c, menu.kind === 'pass' ? 'pass' : 'park', sel.value);
                        }}
                      >
                        {busy === c.id ? '…' : `Confirm ${menu.kind}`}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button className={`btn co-adv ${advanceClass || 'primary'}`} disabled={busy === c.id} onClick={() => act(c, 'advance')}>
                      {advanceLabel}
                    </button>
                    <button className="btn co-pass" disabled={busy === c.id} onClick={() => setMenu({ id: c.id, kind: 'pass' })}>Pass</button>
                    <button className="btn co-park" disabled={busy === c.id} onClick={() => setMenu({ id: c.id, kind: 'park' })}>Park</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

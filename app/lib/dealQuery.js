// Filtering, search and sort for the deal list.
//
// Every query parameter was ignored. `?stage=D3`, `?q=legal`, `?sort=daysToIC`,
// `?lane=legal&status=not_started`, `?limit=3` all returned the same rows, so the
// question an analyst actually asks — "which of my deals has Legal DD not started?" —
// cost eleven requests and a hand-built table. The answer is one request now.
//
// Filtering happens AFTER the caller's access scope has been applied, never before, so a
// query can only ever narrow what someone may already see. A filter is not a way in.

const norm = (s) => String(s ?? '').toLowerCase().trim();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// The fields a free-text search reads. Deliberately includes the thesis: an analyst
// searching "retention" is looking for the deal whose thesis mentions it, not for a
// company called Retention.
const searchable = (d) => [
  d.company, d.sector, d.subSector, d.hq, d.stageName, d.stage, d.status, d.thesis,
  ...(d.tags || []),
].map(norm).join(' \u0001 ');

const PHASE = { o: 'origination', d: 'diligence', e: 'execution', v: 'value' };

function matchesStage(d, want) {
  const w = norm(want);
  if (!w) return true;
  const stage = norm(d.stage);
  const name = norm(d.stageName);
  // A bare letter is the phase ("d" = everything in diligence), a letter+digit is the
  // exact step, anything else is matched against the stage's name in words — because
  // "diligence" is what a person types and "D3" is what the record stores.
  if (/^[odev]$/.test(w)) return stage.startsWith(w);
  if (/^[odev]\d$/.test(w)) return stage === w;
  if (PHASE[w[0]] && w === PHASE[w[0]]) return stage.startsWith(w[0]);
  return name.includes(w);
}

function matchesLane(d, lane, laneStatus) {
  if (!lane && !laneStatus) return true;
  const lanes = Array.isArray(d.workstreams) ? d.workstreams : [];
  // A deal whose detail is masked has no workstreams to match, so it cannot satisfy a
  // lane filter. It is excluded rather than silently treated as a match.
  return lanes.some((w) => (!lane || norm(w.lane) === norm(lane) || norm(w.laneLabel) === norm(lane))
    && (!laneStatus || norm(w.status || 'not_started') === norm(laneStatus)));
}

function matchesIc(d, want) {
  const w = norm(want);
  if (!w) return true;
  const n = num(d.daysToIC);
  if (w === 'none') return n === null;
  if (n === null) return false;
  if (w === 'overdue' || w === 'past') return n < 0;
  const days = /^(\d+)d?$/.exec(w);
  if (days) return n >= 0 && n <= Number(days[1]);
  return true;
}

const SORTS = {
  ic: (a, b) => (num(a.daysToIC) ?? 1e9) - (num(b.daysToIC) ?? 1e9),
  size: (a, b) => (num(b.dealSize) ?? -1) - (num(a.dealSize) ?? -1),
  readiness: (a, b) => (num(b.readiness) ?? -1) - (num(a.readiness) ?? -1),
  company: (a, b) => norm(a.company).localeCompare(norm(b.company)),
  stage: (a, b) => norm(a.stage).localeCompare(norm(b.stage)),
};

export const SORT_KEYS = Object.keys(SORTS);

// Returns the rows plus what was asked for and what it cost, so a list can say "12 of 19"
// rather than showing twelve and calling itself complete.
export function queryDeals(rows, params = {}) {
  const all = Array.isArray(rows) ? rows : [];
  const q = norm(params.q || params.query);
  const stage = params.stage;
  const status = norm(params.status);
  const lane = params.lane;
  const laneStatus = params.laneStatus || params.lane_status;
  const ic = params.ic;
  const sector = norm(params.sector);

  let out = all.filter((d) => (!q || searchable(d).includes(q))
    && matchesStage(d, stage)
    && (!status || norm(d.status) === status)
    && (!sector || norm(d.sector).includes(sector))
    && matchesLane(d, lane, laneStatus)
    && matchesIc(d, ic));

  const rawSort = String(params.sort || '').trim();
  const desc = rawSort.startsWith('-');
  const key = norm(desc ? rawSort.slice(1) : rawSort);
  const applied = SORTS[key] ? key : null;
  if (applied) {
    out = out.slice().sort(SORTS[applied]);
    if (desc) out.reverse();
  }

  const matched = out.length;
  const offset = Math.max(0, num(params.offset) ?? 0);
  const limit = num(params.limit);
  if (offset) out = out.slice(offset);
  if (limit !== null && limit >= 0) out = out.slice(0, limit);

  return {
    deals: out,
    total: all.length,
    matched,
    shown: out.length,
    // Named so a caller can echo it back to the reader: "12 of 19 deals · Legal DD not
    // started". A count with no statement of what produced it is not an explanation.
    filtered: !!(q || stage || status || lane || laneStatus || ic || sector),
    sort: applied ? `${desc ? '-' : ''}${applied}` : null,
  };
}

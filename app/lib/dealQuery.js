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

// Sort keys are named after the fields they sort, because `?sort=daysToIC` is what
// anyone reading the payload will send. It was the one sort a deal professional actually
// wants — what is closest to committee — and it was the one that silently did nothing.
//
// One rule for direction: plain is ascending, `-` is descending, on every field. Each
// comparator used to carry its own idea of "most interesting first", so `dealSize` and
// `readiness` came back descending while `daysToIC` and `company` came back ascending,
// and `-dealSize` therefore meant ascending. You had to run all five to learn which way
// each one pointed.
const SORTS = {
  daysToIC: (a, b) => (num(a.daysToIC) ?? 1e9) - (num(b.daysToIC) ?? 1e9),
  dealSize: (a, b) => (num(a.dealSize) ?? -1) - (num(b.dealSize) ?? -1),
  readiness: (a, b) => (num(a.readiness) ?? -1) - (num(b.readiness) ?? -1),
  company: (a, b) => norm(a.company).localeCompare(norm(b.company)),
  stage: (a, b) => norm(a.stage).localeCompare(norm(b.stage)),
};
const SORT_ALIAS = { ic: 'daysToIC', size: 'dealSize', daystoic: 'daysToIC', dealsize: 'dealSize' };

export const SORT_KEYS = Object.keys(SORTS);

const resolveSort = (key) => SORTS[key] ? key : SORT_ALIAS[norm(key)] || null;

// What is wrong with the request, in the words of someone who has to fix it. Silent
// coercion is the most expensive failure an API has: given a parameter called `ic` beside
// `stage` and `status`, a reasonable engineer sends `ic=ready`, gets every row back with a
// 200, and ships it believing it filtered.
// Every parameter this route understands. Anything else is refused by name: after the
// API learned to 400 on a bad VALUE, silently ignoring an unknown KEY is worse than
// before — `?assignedTo=me` returned the whole book with a 200, and a bookmarked URL that
// looks filtered and is not is a trap.
export const DEAL_QUERY_KEYS = new Set([
  'q', 'query', 'stage', 'status', 'sector', 'lane', 'laneStatus', 'lane_status',
  'ic', 'icWithinDays', 'assignedTo', 'sort', 'limit', 'offset', 'cb',
]);

export function validateDealQuery(params = {}, rows = null) {
  const errors = [];
  for (const key of Object.keys(params)) {
    if (!DEAL_QUERY_KEYS.has(key)) errors.push(`${key} is not a filter this list understands — the ones it does are: ${[...DEAL_QUERY_KEYS].filter((k) => k !== 'cb').join(', ')}`);
  }
  const ic = params.icWithinDays ?? params.ic;
  if (ic !== undefined && ic !== '' && !/^(overdue|past|none|\d+d?)$/i.test(String(ic).trim())) {
    errors.push(`icWithinDays must be a whole number of days, or one of: overdue, none — got "${ic}"`);
  }
  if (params.sort && !resolveSort(String(params.sort).replace(/^-/, ''))) {
    errors.push(`sort must be one of: ${SORT_KEYS.join(', ')} (prefix with - to reverse; plain is ascending) — got "${params.sort}"`);
  }
  for (const key of ['limit', 'offset']) {
    const v = params[key];
    if (v === undefined || v === '') continue;
    if (!/^\d+$/.test(String(v).trim())) errors.push(`${key} must be a whole number that is zero or more — got "${v}"`);
  }
  // Half the filters used to fail silently: ?status=bogus, ?lane=bogus and
  // ?laneStatus=not-started all answered 200 with an empty array. An empty result that
  // means "you typed it wrong" is indistinguishable from one that means "no such deals",
  // and the vocabulary is nowhere in the payload — laneStatus is not_started, with an
  // underscore, which nobody guesses. Checked against what this caller can actually see.
  if (Array.isArray(rows)) {
    const known = (pick) => {
      const s = new Set();
      for (const d of rows) for (const v of [].concat(pick(d) ?? [])) if (v) s.add(norm(v));
      return s;
    };
    const check = (key, values, hint) => {
      const want = norm(params[key]);
      if (!want || values.has(want)) return;
      errors.push(`${key} must be one of: ${[...values].sort().join(', ') || '(nothing on your deals)'} — got "${params[key]}"${hint ? ` (${hint})` : ''}`);
    };
    check('status', known((d) => d.status));
    check('sector', known((d) => d.sector));
    check('lane', known((d) => (d.workstreams || []).map((w) => w.lane)));
    check('laneStatus', known((d) => (d.workstreams || []).map((w) => w.status || 'not_started')));
    const stageWant = norm(params.stage);
    if (stageWant && !/^[odev]\d?$/.test(stageWant)) {
      const names = known((d) => d.stageName);
      const phases = new Set(Object.values(PHASE));
      if (![...names].some((n) => n.includes(stageWant)) && !phases.has(stageWant)) {
        errors.push(`stage must be a phase (${[...phases].join(', ')}), a step code, or part of a stage name — got "${params.stage}"`);
      }
    }
  }
  return errors;
}

// Returns the rows plus what was asked for and what it cost, so a list can say "12 of 19"
// rather than showing twelve and calling itself complete.
// What is on ONE person, from the deal's own record. "What is on me today" was the
// analyst's first question of the day and the product had no way to express it: every
// `why` on the attention list named somebody else, and the only way to guess was to read
// nine deals by hand.
export function myItemsFor(deal, me) {
  if (!me) return [];
  const out = [];
  for (const w of deal.workstreams || []) {
    const owner = w.owner || LANE_OWNER_FOR[String(w.lane || '').toLowerCase()] || null;
    if (owner !== me && String(w.owner || '') !== me) continue;
    const status = String(w.status || 'not_started');
    if (status === 'complete' || status === 'closed_at_ic') continue;
    out.push({
      id: `${deal.id}:${w.lane}`,
      dealId: deal.id,
      kind: 'workstream',
      lane: w.lane,
      label: w.laneLabel || w.lane,
      status,
      blocking: status === 'not_started' || (w.progress ?? 0) < 100,
      dueDate: w.dueDate || null,
      source: 'deal record',
    });
  }
  return out;
}

// Kept local so this module does not import the label layer. It only decides ownership
// where the record leaves a lane unowned.
const LANE_OWNER_FOR = {
  financial: 'fund-cfo', tax: 'fund-cfo', legal: 'legal-gc', commercial: 'retail-md',
  techai: 'ai-md', tech: 'ai-md', operations: 'supply-md', operational: 'supply-md',
  hr: 'operating-partner', esg: 'operating-partner',
};

// "On me" means something OUTSTANDING on me. Ownership comes from the workstreams, never
// from leadAnalyst — that field carries the same default on eighteen of nineteen deals, so
// filtering on it returned the whole book and called it mine. And a deal whose lane I have
// finished is a deal I worked, not one asking for me today.
const isMine = (d, me) => myItemsFor(d, me).length > 0;

export function queryDeals(rows, params = {}, me = null) {
  const all = Array.isArray(rows) ? rows : [];
  const q = norm(params.q || params.query);
  const stage = params.stage;
  const status = norm(params.status);
  const lane = params.lane;
  const laneStatus = params.laneStatus || params.lane_status;
  const ic = params.icWithinDays ?? params.ic;
  const sector = norm(params.sector);
  const assigned = params.assignedTo ? (norm(params.assignedTo) === 'me' ? me : norm(params.assignedTo)) : null;

  let out = all.filter((d) => (!q || searchable(d).includes(q))
    && matchesStage(d, stage)
    && (!status || norm(d.status) === status)
    && (!sector || norm(d.sector).includes(sector))
    && (!assigned || isMine(d, assigned))
    && matchesLane(d, lane, laneStatus)
    && matchesIc(d, ic));

  const rawSort = String(params.sort || '').trim();
  const desc = rawSort.startsWith('-');
  const applied = resolveSort(desc ? rawSort.slice(1) : rawSort);
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

// What you may filter by, with live counts, for THIS caller. Without it there is no way
// to learn the vocabulary: the values are not in any payload, there is no schema route,
// and the tab gave up and hard-coded a chip list that has since drifted from the data.
// Facets let the chips build themselves from what is actually there.
export function dealFacets(rows) {
  const all = Array.isArray(rows) ? rows : [];
  const tally = (pick) => {
    const m = new Map();
    for (const d of all) {
      const v = pick(d);
      for (const one of Array.isArray(v) ? v : [v]) {
        if (one === null || one === undefined || one === '') continue;
        m.set(one, (m.get(one) || 0) + 1);
      }
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
  };
  const phase = (d) => {
    const s = String(d.stage || '').toUpperCase();
    return PHASE[s[0]?.toLowerCase()] || null;
  };
  return {
    phase: tally(phase).map((f) => ({ ...f, label: f.value[0].toUpperCase() + f.value.slice(1) })),
    // Tallied by the stage's NAME, not its code. Four codes share the name "Diligence &
    // Approval", so a facet keyed on the code offered four identical-looking choices, and
    // the only thing that told them apart was the internal code a reader never sees.
    stage: tally((d) => d.stageName || d.stage),
    status: tally((d) => d.status),
    sector: tally((d) => d.sector),
    lane: tally((d) => (d.workstreams || []).map((w) => w.lane)),
    laneStatus: tally((d) => (d.workstreams || []).map((w) => w.status || 'not_started')),
    sort: SORT_KEYS,
    icWithinDays: 'a whole number of days, or "overdue", or "none"',
  };
}

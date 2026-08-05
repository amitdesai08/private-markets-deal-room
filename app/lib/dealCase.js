// ===========================================================================
//  THE CASE — what a committee member reads cold, composed from the record
// ===========================================================================
// An IC member opened a deal an hour before the committee sat and found the memo's
// recommendation section stored as `{status: "empty", content: ""}` and value creation
// as an empty string. Their words: "I am asked to approve $240M against a thesis
// paragraph." The papers are written by people and most of them had not been; but the
// record already holds the ask, the returns, the register and the readiness board, and
// declining to put them in one place because a human has not typed a memo is a filing
// convention, not an answer.
//
// So this composes the case from what is on file. It is NOT the analyst's memo and never
// claims to be — `composed` is true and the note says where it came from. Every figure
// carries its basis, including the uncomfortable ones: where no EBITDA has been recorded
// it says so and names the screening default it used, because a committee voting on a
// multiple is entitled to know the denominator was assumed.
import { buildReturnsModel, buildRiskRegister, canonicalFigures } from './diligence.js';
import { computeICReadiness } from './icReadiness.js';
import { money as fmtMoney, symbolFor } from './money.js';

const SEVERITY_RANK = { stopper: 0, reprice: 1, condition: 2, monitor: 3 };

// How the number got onto the page, in words a committee member can act on. "derived"
// on its own is a label; it does not tell a reader whether to trust the multiple.
function figureBasis(kind, canon, deal) {
  const cur = canon.currency;
  if (kind === 'ev') {
    return deal.dealSize
      ? 'Recorded on the deal as the enterprise value being pursued.'
      : 'No enterprise value is recorded on the deal; this is the screening default.';
  }
  if (kind === 'ebitda') {
    if (canon.ebitdaSource === 'recorded') return 'Recorded on the deal from diligence.';
    if (canon.ebitdaSource === 'implied by the recorded entry multiple') {
      return `Not recorded. Implied by dividing the ${cur}${canon.ev}M enterprise value by the ${canon.entryMultiple}x multiple the record states.`;
    }
    return `Not recorded. This is 12% of enterprise value — the screening default the model falls back to when no EBITDA is on file. The multiple below rests on it.`;
  }
  if (kind === 'multiple') {
    return canon.entryMultipleSource === 'recorded'
      ? 'Stated on the deal record.'
      : `Derived: ${cur}${canon.ev}M enterprise value over ${cur}${canon.ebitda}M EBITDA.`;
  }
  if (kind === 'revenue') {
    return canon.revenueRecorded ? 'Recorded on the deal from diligence.' : 'Not recorded. Screening estimate at 1.2x enterprise value.';
  }
  return null;
}

// The three things that could kill it, in the order a committee should hear them:
// deal-stoppers first, then anything that moves the price, then closing conditions.
// Monitors are excluded — a committee that is asked to weigh five monitors alongside a
// stopper has been given a list, not a case.
function againstIt(register) {
  return (register.risks || [])
    .filter((r) => r.severity !== 'monitor')
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))
    .slice(0, 3)
    .map((r) => ({
      risk: r.risk,
      severity: r.severity,
      severityLabel: r.severityLabel,
      likelihood: r.likelihood || null,
      workstream: r.workstream || null,
      owner: r.owner || null,
      mitigation: r.mitigation || null,
    }));
}

// What the committee is actually being asked to authorise, as one sentence plus the
// numbers behind it. A vote is on an amount, and the amount was on a different page.
function theAsk(canon, returns, deal) {
  const m = (v) => fmtMoney(v, symbolFor(deal));
  const base = (returns.scenarios || []).find((s) => /base/i.test(s.name)) || null;
  if (!base) return null;
  return {
    headline: `Authorise up to ${m(base.entryEV)} enterprise value at ${canon.entryMultiple}x, funded with a ${m(base.equityIn)} equity cheque and ${m(base.debt)} of debt at ${canon.leverage}.`,
    enterpriseValue: base.entryEV,
    equityCheque: base.equityIn,
    debt: base.debt,
    leverage: canon.leverage,
    currency: canon.currency,
  };
}

// The case FOR the deal, each point tied to a figure rather than an adjective. Where
// the record holds no evidence for a point, the point is not made.
function forIt(deal, canon, returns) {
  const m = (v) => fmtMoney(v, symbolFor(deal));
  const base = (returns.scenarios || []).find((s) => /base/i.test(s.name));
  const down = (returns.scenarios || []).find((s) => /down/i.test(s.name));
  const out = [];
  if (base) {
    out.push({
      point: `Base case returns ${base.moic}x on ${base.irr}% IRR over ${canon.holdYears} years`,
      basis: `${m(base.equityIn)} in, ${m(base.equityOut)} out. ${returns.meetsHurdle ? `Clears the fund hurdle of ${returns.hurdle.irr}% / ${returns.hurdle.moic}x.` : `Does not clear the fund hurdle of ${returns.hurdle.irr}% / ${returns.hurdle.moic}x.`}`,
    });
  }
  if (down) {
    out.push({
      point: `Downside holds at ${down.moic}x / ${down.irr}% IRR`,
      basis: `Modelled on a lower exit EBITDA of ${m(down.exitEbitda)} and a larger ${m(down.equityIn)} equity cheque.`,
    });
  }
  const growth = Number.isFinite(deal.growth) ? deal.growth : null;
  const growthKf = (deal.keyFigures || []).find((k) => /growth|cagr|nrr/i.test(k.label));
  if (growth || growthKf) {
    out.push({
      point: `Growth underwritten at ${growth ?? String(growthKf.value)}`,
      basis: growthKf ? `${growthKf.label} of ${growthKf.value}, recorded from ${growthKf.source || 'the deal record'}.` : 'Recorded on the deal record.',
    });
  }
  if (deal.thesis) out.push({ point: 'The thesis on file', basis: String(deal.thesis).trim() });
  return out;
}

export function buildDealCase(deal) {
  const canon = canonicalFigures(deal);
  if (!canon) return null;
  const returns = buildReturnsModel(deal);
  const register = buildRiskRegister(deal);
  const board = computeICReadiness(deal);
  const v = board.verdict || {};
  const risks = againstIt(register);

  // The call. Not a view — an arithmetic reading of the record, stated as such, so the
  // committee knows it is being told what the numbers say and not what anyone thinks.
  const call = register.counts.stopper ? 'DECLINE'
    : !returns.meetsHurdle ? 'DO NOT PROCEED ON THESE TERMS'
      : (v.conditionsTotal || 0) ? 'PROCEED, SUBJECT TO CONDITIONS'
        : 'PROCEED';
  const because = register.counts.stopper
    ? `${register.counts.stopper} deal-stopper on the register.`
    : !returns.meetsHurdle
      ? returns.headline
      : (v.conditionsTotal || 0)
        ? `Returns clear the hurdle; ${v.conditionsTotal} condition${v.conditionsTotal === 1 ? '' : 's'} to satisfy before signing.`
        : 'Returns clear the hurdle and the register carries nothing outstanding.';

  // What the committee is NOT being given. A reader who cannot see the gap will assume
  // there isn't one, and the papers most often missing are the ones a vote depends on.
  const written = (deal.memoSections || []).filter((s) => s.status && s.status !== 'empty').length;
  const notOnRecord = [];
  if (!(deal.memoSections || []).length) notOnRecord.push('No IC memo sections have been opened on this deal.');
  else if (written < (deal.memoSections || []).length) notOnRecord.push(`${(deal.memoSections || []).length - written} of ${(deal.memoSections || []).length} memo sections are unwritten.`);
  if (canon.ebitdaSource === 'derived') notOnRecord.push('No EBITDA has been recorded from diligence; the entry multiple rests on a screening default.');
  if (returns.provision) notOnRecord.push(returns.provision.note);
  for (const b of (board.blockingWorkstreams || [])) notOnRecord.push(`${b.label}: ${b.reasons.join('; ')}.`);

  return {
    kind: 'deal-case',
    dealId: deal.id,
    company: deal.company,
    sector: deal.sector,
    // Said plainly and first, because the one thing this must never be mistaken for is
    // a paper somebody signed.
    composed: true,
    composedNote: 'Composed from the deal record — the returns model, the risk register and the committee-readiness board. It is not the analyst\'s memo and nobody has approved it.',
    readiness: { state: v.state || null, headline: v.headline || null, gating: v.gating || [] },
    recommendation: { call, because },
    ask: theAsk(canon, returns, deal),
    forIt: forIt(deal, canon, returns),
    againstIt: risks,
    figures: [
      { label: 'Enterprise value', value: `${canon.currency}${canon.ev}M`, basis: figureBasis('ev', canon, deal) },
      { label: 'LTM EBITDA', value: `${canon.currency}${canon.ebitda}M`, basis: figureBasis('ebitda', canon, deal) },
      { label: 'Entry multiple', value: `${canon.entryMultiple}x`, basis: figureBasis('multiple', canon, deal) },
      { label: 'Revenue', value: `${canon.currency}${canon.revenue}M`, basis: figureBasis('revenue', canon, deal) },
      { label: 'Leverage', value: canon.leverage, basis: 'Modelled at the financeable ceiling for the sector.' },
    ],
    conditions: (register.risks || []).filter((r) => r.severity === 'condition').map((r) => ({ condition: r.risk, owner: r.owner || null, workstream: r.workstream || null })),
    notOnRecord,
    // Where a reader goes to check any of it, rather than taking the composition on
    // trust. Every one of these is a page in the product, not a citation to nowhere.
    checkAgainst: [
      { label: 'Returns, plan & risk', path: 'returns' },
      { label: 'Risk register', path: 'risk-register' },
      { label: 'Committee readiness', path: 'ic-readiness' },
      { label: 'Data room', path: 'documents' },
    ],
  };
}

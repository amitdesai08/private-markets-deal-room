// Sourcing-framework scoring: the Fund Mandate GATES, Screens RANK.
//
// gateCompany   — hard pass/fail against the fund mandate (LPA constraints).
// scoreScreen   — 0-100 mandate-fit of a company against one screen.
// scoreTargets  — gate every company, then score the survivors against the
//                 selected screens (keeping each company's best-matching screen).
// validateScreen — enforce that a screen may only NARROW its theme & fund.

import { money, symbolFor } from './money.js';

const WEIGHTS = {
  sector: 15,
  region: 15,
  ev: 15,
  ownership: 10,
  keywords: 10,
  revenue: 10,
  ebitda: 10,
  margin: 8,
  growth: 7
};

export function gateCompany(company, fund) {
  const reasons = [];
  const sym = symbolFor(company);
  if (fund.sectorsExcluded?.includes(company.sector)) {
    reasons.push(`Excluded sector under the LPA (${company.sector})`);
  }
  if (fund.sectorsPermitted?.length && !fund.sectorsPermitted.includes(company.sector)) {
    reasons.push(`Sector outside the fund mandate (${company.sector})`);
  }
  if (fund.geographies?.length) {
    // A US-wide mandate (geographies include "United States") admits any US
    // company regardless of the specific sub-region label the source used
    // (e.g. "California" vs "West / California", "US", "Texas"). Only gate on
    // geography when the company clearly isn't in a permitted region/country.
    const usWide = fund.geographies.some((g) => /united states|^us$|u\.s\.?/i.test(g));
    const isUS = /united states|^us$|u\.s\.?|usa/i.test(`${company.country || ''} ${company.region || ''}`);
    const inRegion = fund.geographies.includes(company.region);
    if (!inRegion && !(usWide && isUS)) {
      reasons.push(`Geography outside the fund mandate (${company.region})`);
    }
  }
  if (company.dealSize < fund.evMin) {
    reasons.push(`EV ${money(company.dealSize, sym)} below the mandate floor (${money(fund.evMin, sym)})`);
  }
  if (company.dealSize > fund.evMax) {
    reasons.push(`EV ${money(company.dealSize, sym)} above the mandate cap (${money(fund.evMax, sym)})`);
  }
  return { passes: reasons.length === 0, reasons };
}

function bandScore(value, lo, hi, weight) {
  if (lo == null && hi == null) return weight;
  const low = lo ?? 0;
  const high = hi ?? Infinity;
  if (value >= low && value <= high) return weight;
  const dist = value < low ? (low - value) / (low || 1) : (value - high) / (high || 1);
  return dist <= 0.2 ? Math.round(weight * 0.5) : 0;
}

// POINTS WERE AWARDED FOR TESTS THE SCREEN NEVER SET.
//
// `minScore` returned full weight when the screen carried no threshold, and the ownership
// and region tests did the same. On a screen that sets few criteria that produced a row
// showing six green ticks — "Revenue above the floor 10/10 met", "EBITDA above the floor
// 10/10 met" — against six blank fields on the same payload. Nothing had been tested and
// the score said everything had passed.
//
// A test the screen does not set is NOT TESTED: it earns nothing and is taken out of the
// denominator, so the score is a percentage of the criteria that actually ran. A test the
// screen does set but the company has no figure for earns nothing and says so.
const NOT_TESTED = { applies: false, points: 0, hasInput: true };

function minScore(value, min, weight) {
  if (min == null) return NOT_TESTED;
  if (value == null) return { applies: true, points: 0, hasInput: false };
  if (value >= min) return { applies: true, points: weight, hasInput: true };
  if (value >= min * 0.8) return { applies: true, points: Math.round(weight * 0.5), hasInput: true };
  return { applies: true, points: 0, hasInput: true };
}

const flat = (applies, points, hasInput = true) => ({ applies, points, hasInput });

export function scoreScreen(company, screen) {
  const parts = {};
  parts.sector = !screen.sector
    ? NOT_TESTED
    : company.sector == null
      ? flat(true, 0, false)
      : flat(true, screen.sector === company.sector ? WEIGHTS.sector : 0);
  parts.region = !screen.regions?.length
    ? NOT_TESTED
    : company.region == null
      ? flat(true, 0, false)
      : flat(true, screen.regions.includes(company.region) ? WEIGHTS.region : 0);
  parts.ev = screen.evMin == null && screen.evMax == null
    ? NOT_TESTED
    : company.dealSize == null
      ? flat(true, 0, false)
      : flat(true, bandScore(company.dealSize, screen.evMin, screen.evMax, WEIGHTS.ev));
  parts.ownership = !screen.ownership?.length
    ? NOT_TESTED
    : company.ownership == null
      ? flat(true, 0, false)
      : flat(true, screen.ownership.includes(company.ownership) ? WEIGHTS.ownership : 0);

  if (screen.keywords?.length) {
    const overlap = screen.keywords.filter((k) => (company.keywords || []).includes(k)).length;
    const denom = Math.min(screen.keywords.length, 3);
    parts.keywords = flat(true, Math.round(WEIGHTS.keywords * Math.min(1, overlap / denom)));
  } else {
    parts.keywords = NOT_TESTED;
  }

  parts.revenue = minScore(company.revenue, screen.revenueMin, WEIGHTS.revenue);
  parts.ebitda = minScore(company.ebitda, screen.ebitdaMin, WEIGHTS.ebitda);
  parts.margin = minScore(company.ebitdaMargin, screen.ebitdaMarginMin, WEIGHTS.margin);
  parts.growth = minScore(company.growth, screen.growthMin, WEIGHTS.growth);

  let earned = 0;
  let available = 0;
  for (const [key, p] of Object.entries(parts)) {
    if (!p.applies) continue;
    earned += p.points;
    available += WEIGHTS[key] ?? 0;
  }
  // Scored out of the criteria that ran, so a sparse screen cannot flatter a candidate
  // and a thorough one cannot punish it. No applicable test at all means nothing has
  // been assessed — which is a zero, not a pass.
  const score = available ? Math.round((earned / available) * 100) : 0;
  return { score, parts, earned, available };
}

// The score was printed as a bare number beside a band pill, and nothing on the page or
// behind it said what produced it — so "91" and "87" looked like judgement rather than
// arithmetic. The weights and the tests were always there; only the explanation was
// missing. These rows add to the score shown.
const PART_LABELS = {
  sector: 'Sector in the screen',
  region: 'Region in the screen',
  ev: 'Enterprise value inside the band',
  ownership: 'Ownership type wanted',
  keywords: 'Thesis keywords matched',
  revenue: 'Revenue above the floor',
  ebitda: 'EBITDA above the floor',
  margin: 'Margin above the floor',
  growth: 'Growth above the floor',
};

export function explainScreenScore(company, screen) {
  const { score, parts, earned, available } = scoreScreen(company, screen);
  const components = Object.entries(parts).map(([key, p]) => {
    const outOf = WEIGHTS[key] ?? 0;
    return {
      key,
      label: PART_LABELS[key] || key,
      points: p.points,
      outOf,
      applies: p.applies,
      hasInput: p.hasInput,
      met: p.applies && p.hasInput && p.points >= outOf,
      partial: p.applies && p.hasInput && p.points > 0 && p.points < outOf,
      // What the row says instead of a fraction when there is no fraction to show.
      note: !p.applies
        ? 'This screen sets no criterion here, so nothing was tested and nothing was awarded.'
        : !p.hasInput
          ? 'The figure this test needs is not recorded for this company, so the test could not be run and scores nothing.'
          : null,
    };
  });
  const notTested = components.filter((c) => !c.applies).length;
  const noInput = components.filter((c) => c.applies && !c.hasInput).length;
  return {
    score,
    earned,
    available,
    components,
    basis: [
      `Scored against the "${screen.name}" screen. It sets ${9 - notTested} of the 9 criteria, worth ${available} points between them; this company earned ${earned}, which is ${score}%.`,
      notTested ? `${notTested} criteri${notTested === 1 ? 'on is' : 'a are'} not set by this screen and were not scored either way.` : null,
      noInput ? `${noInput} criteri${noInput === 1 ? 'on' : 'a'} could not be tested because the figure is not on this company's record, and scored nothing.` : null,
      'Region is one weighted test here, not a gate — a company outside the screen\'s preferred regions still scores on everything else. Geography outside the FUND\'s mandate is a different thing and stops a candidate before it is scored at all.',
    ].filter(Boolean).join(' '),
  };
}

export function scoreTargets(companies, selectedScreens, fund) {
  return companies
    .map((company) => {
      const gate = gateCompany(company, fund);
      if (!gate.passes) {
        return {
          id: company.id,
          name: company.name,
          sector: company.sector,
          region: company.region,
          country: company.country,
          dealSize: company.dealSize,
          ownership: company.ownership,
          sources: company.sources || ['news'],
          justDiscovered: !!company.justDiscovered,
          gated: true,
          gateReasons: gate.reasons,
          score: 0,
          band: 'excluded',
          matchedScreen: null,
          parts: null
        };
      }
      let best = { score: 0, screen: null, parts: null };
      for (const s of selectedScreens) {
        const { score, parts } = scoreScreen(company, s);
        if (score > best.score) best = { score, screen: { id: s.id, name: s.name }, parts, screenObj: s };
      }
      const explained = best.screenObj ? explainScreenScore(company, best.screenObj) : null;
      return {
        id: company.id,
        name: company.name,
        sector: company.sector,
        region: company.region,
        country: company.country,
        dealSize: company.dealSize,
        ownership: company.ownership,
        sources: company.sources || ['news'],
        justDiscovered: !!company.justDiscovered,
        gated: false,
        gateReasons: [],
        score: best.score,
        band: best.score >= 75 ? 'strong' : best.score >= 45 ? 'moderate' : 'weak',
        matchedScreen: best.screen,
        // `parts` used to be a plain {test: points} map. It now carries whether the test
        // ran at all, so anything reading it as a number would silently read an object;
        // keep the numeric map here and put the full explanation alongside it.
        parts: best.parts
          ? Object.fromEntries(Object.entries(best.parts).map(([k, p]) => [k, p.points]))
          : null,
        scoreComponents: explained?.components || [],
        scoreBasis: explained?.basis || null
      };
    })
    .sort((a, b) => {
      if (a.gated !== b.gated) return a.gated ? 1 : -1; // excluded to the bottom
      return b.score - a.score;
    });
}

// Enforce that a screen may only NARROW its theme (soft) and the fund (hard).
export function validateScreen(screen, theme, fund) {
  const errors = [];
  const warnings = [];
  const sym = symbolFor(fund);

  // Hard — fund mandate
  if (screen.sector && fund.sectorsExcluded?.includes(screen.sector)) {
    errors.push(`Sector “${screen.sector}” is on the fund’s LPA exclusion list.`);
  }
  if (screen.sector && fund.sectorsPermitted?.length && !fund.sectorsPermitted.includes(screen.sector)) {
    errors.push(`Sector “${screen.sector}” is outside the fund mandate’s permitted sectors.`);
  }
  for (const r of screen.regions || []) {
    if (fund.geographies?.length && !fund.geographies.includes(r)) {
      errors.push(`Geography “${r}” is outside the fund mandate.`);
    }
  }
  if (screen.evMin != null && screen.evMin < fund.evMin) {
    errors.push(`EV floor ${money(screen.evMin, sym)} is below the fund mandate floor of ${money(fund.evMin, sym)}.`);
  }
  if (screen.evMax != null && screen.evMax > fund.evMax) {
    errors.push(`EV ceiling ${money(screen.evMax, sym)} exceeds the fund mandate cap of ${money(fund.evMax, sym)}.`);
  }

  // Soft — parent theme
  if (theme) {
    if (screen.sector && theme.sector && screen.sector !== theme.sector) {
      warnings.push(`Sector “${screen.sector}” differs from the parent theme’s sector (“${theme.sector}”).`);
    }
    for (const r of screen.regions || []) {
      if (theme.geographyFocus?.length && !theme.geographyFocus.includes(r)) {
        warnings.push(`Geography “${r}” is outside the theme’s focus (${theme.geographyFocus.join(', ')}).`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

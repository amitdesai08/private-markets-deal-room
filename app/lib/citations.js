import { buildRiskRegister } from './diligence.js';
// Source-citation validation for IC materials.
//
// An Investment Committee memo is only defensible if every number in it traces to
// a source fact or document. This validates the IC materials on the deal record —
// the key figures (source facts), the IC memo sections (prose), and the derived IC
// ask — and flags any numeric claim that does not map to a sourced fact or a cited
// document, plus any key figure carried without a source attribution.
//
// It is deliberately conservative: it looks at money ($…M/B), percentages (…%) and
// multiples (…x) — the figures that actually drive an IC decision — rather than
// every integer (years, counts) so the flags are high-signal, not noise.

const MONEY = /\$\s?\d[\d,]*\.?\d*\s?(?:bn|billion|b|million|mm|m|k)?/gi;
const PCT = /\d[\d,]*\.?\d*\s?%/g;
const MULT = /\d+\.?\d*\s?x(?![a-z])/gi;

// Canonicalize a figure string so "$240M", "$ 240 m" and "240M" all compare equal.
function normNum(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[$,\s]/g, '')
    .replace(/billion/g, 'b').replace(/million|mm/g, 'm');
}

function extractFigures(text) {
  const out = [];
  if (!text) return out;
  for (const re of [MONEY, PCT, MULT]) {
    const m = String(text).match(re);
    if (m) out.push(...m.map((s) => s.trim()));
  }
  // de-dupe by canonical form, keep first surface form
  const seen = new Set();
  return out.filter((f) => {
    const k = normNum(f);
    if (!k || k === 'x' || k === '%' || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// A key figure is a "source fact" only if it carries a source attribution.
function figureSourced(f) {
  return !!(f && f.source && String(f.source).trim());
}

// Is the base financial data (revenue / EBITDA) sourced? The derived IC ask
// (EV, entry multiple, returns) is only as defensible as the figures it is built on.
function baseFinancialsSourced(deal) {
  const kf = deal.keyFigures || [];
  const rev = kf.find((f) => /revenue/i.test(f.label));
  const ebitda = kf.find((f) => /ebitda(?! margin)/i.test(f.label));
  const missing = [];
  if (!rev || !figureSourced(rev)) missing.push('Revenue');
  if (!ebitda || !figureSourced(ebitda)) missing.push('EBITDA');
  return { sourced: missing.length === 0, missing };
}

const UNDILIGENCED_SOURCE = /^(screen|screening|teaser|cim|broker model|desk|desk research|derived|estimate)$/i
  || null;
// Anything the seller or a third party produced, however it is spelled on the record.
const SELLER_SOURCE = /teaser|information memorandum|\bcim\b|broker|analyst|research|management accounts?|vendor pack/i;
const DRAFT_SOURCE = /\bdraft\b|\bpreliminary\b|\bindicative\b/i;

// Reasons the sourcing check can pass and the figures still not be relied on.
export function sourcingCaveats(deal, { entryTies = null, ebitdaDerived = false } = {}) {
  const out = [];
  // A diligence document cannot be the source of a figure on a deal where no
  // workstream has produced anything and the papers desk holds no such document.
  const anyWorked = (deal?.workstreams || []).some((w) => (w.findings || []).length || (w.contributions || []).length);
  if (!anyWorked) {
    const kf = (deal?.keyFigures || []).find((k) => /ebitda(?! margin)/i.test(k.label));
    const src = String(kf?.source || '').trim();
    // A paper IS on the record where the record names one, however thin. The caveat
    // that belongs on it is that nobody has worked on it, not that it does not exist.
    const named = (deal?.documents || []).some((doc) => /quality of earnings/i.test(String(doc.name || doc.title || '')));
    const draftNamed = /draft|preliminary/i.test(src);
    if (src && !named && !draftNamed && /quality of earnings|qoe|diligence|dd\b/i.test(src)) {
      out.push(`the EBITDA is attributed to ${/qoe|quality of earnings/i.test(src) ? 'a quality-of-earnings report' : src.toLowerCase()} on a deal where no workstream has produced anything and no such paper is on the record`);
    }
  }
  if (entryTies === false) out.push('the stated entry multiple and the funded enterprise value are struck on different numbers');
  if (ebitdaDerived) out.push('the EBITDA under the multiple is a screening default, not a diligenced figure');
  else {
    const kf = (deal?.keyFigures || []).find((k) => /ebitda(?! margin)/i.test(k.label));
    if (!kf) out.push('the EBITDA under the multiple is a screening default, not a diligenced figure');
    else {
      const src = String(kf.source || '').trim();
      if (src && (UNDILIGENCED_SOURCE.test(src) || SELLER_SOURCE.test(src))) {
        out.push(`the EBITDA under the multiple is sourced "${src}", which is not diligence`);
      } else if (src && DRAFT_SOURCE.test(src)) {
        // The record spells this "QoE draft", and lower-casing a fixture token gave a
        // partner "comes from qoe draft" in the middle of an English sentence.
        const named = /qoe|quality of earnings/i.test(src)
          ? 'a draft quality-of-earnings report'
          : `a ${src.toLowerCase().replace(/\bqoe\b/g, 'quality-of-earnings')} that is marked ${/preliminary/i.test(src) ? 'preliminary' : /indicative/i.test(src) ? 'indicative' : 'draft'}`;
        out.push(`the EBITDA under the multiple comes from ${named}, which is not a completed result`);
      }
    }
  }
  // A SOURCE IS NOT AGREEMENT, AND THE PRODUCT WAS DISPUTING ITS OWN FIGURE.
  //
  // Lumen's audit returned 100 out of 100 and "All numeric claims trace to a source fact
  // or cited document" — in the same card as an LTM EBITDA of $17M, and two cards above
  // its own open register row reading "on a ratable basis LTM EBITDA is $3.2M lower than
  // the model carries", graded Price-adjuster. A trust score of 100% on a number the
  // record itself says is 19% wrong is the one number on the page a partner will test.
  // Having a citation is necessary; not being contradicted is also necessary.
  try {
    const reg = buildRiskRegister(deal);
    const priced = (reg?.risks || []).filter((r) => r.severity === 'reprice');
    for (const r of priced) {
      const text = String(r.risk || '');
      if (!/ebitda|revenue|margin|multiple|price/i.test(text)) continue;
      // The row's first sentence keeps its full stop, and the caveat list is joined into
      // a sentence that supplies its own -- so the flagship deal printed "...than the
      // model carries.. 9 of 9 claims tested...". Strip the borrowed stop.
      // The register row can be long, and quoting its first sentence whole produced a
      // five-hundred-character audit summary with nested em-dashes, set at 11.5px. Take
      // the row's opening clause, not its opening sentence.
      const sentence = text.split(/(?<=\.)\s/)[0].replace(/\.\s*$/, '');
      // Quote it whole where it fits; where it does not, name the row and let the reader
      // open the register, rather than printing a clause that stops mid-thought.
      const clause = sentence.split(/\s+—\s+|;\s+/)[0].trim();
      out.push(sentence.length <= 150
        ? `an open repricing item on the register disputes a figure the audit has scored — ${sentence}`
        : clause.length <= 150
          ? `an open repricing item on the register disputes a figure the audit has scored: ${clause}. The rest of that row is on the risk register`
          : 'an open repricing item on the register disputes a figure the audit has scored, in the words the workstream recorded it in on the risk register');
      break;
    }
  } catch { /* the register is optional context; its absence is not a caveat */ }
  return out;
}

export function validateCitations(deal) {
  const keyFigures = (deal.keyFigures || []).map((f) => ({
    label: f.label, value: f.value, source: f.source || null, confidence: f.confidence || null, sourced: figureSourced(f)
  }));
  const unsourcedFigures = keyFigures.filter((f) => !f.sourced);

  // Source ledger: the canonical values that ARE backed by a sourced key figure,
  // plus the deal's documents (a claim in a section citing a document is sourced).
  const ledger = new Set(keyFigures.filter((f) => f.sourced).map((f) => normNum(f.value)).filter(Boolean));
  const documents = (deal.documents || []).map((d) => d.name);

  // Scan the IC memo sections for numeric claims and map each to a source.
  const claims = [];
  for (const m of deal.memoSections || []) {
    if (!m.content || m.status === 'empty') continue;
    const cited = (m.citations || []).length > 0;
    for (const fig of extractFigures(m.content)) {
      const inLedger = ledger.has(normNum(fig));
      const via = inLedger ? 'key-figure' : cited ? 'section-citation' : null;
      claims.push({ section: m.title, figure: fig, sourced: !!via, via });
    }
  }

  const unsourcedClaims = claims.filter((c) => !c.sourced);
  const total = claims.length;
  const base = baseFinancialsSourced(deal);

  // One object used to report score 100, clean false, "IC ask derived from unsourced
  // Revenue & EBITDA", and zero unsourced anything — because the score counted only memo
  // claims while `clean` also counted the key figures and the IC ask's base. Whichever of
  // those a badge happened to render decided whether the reader trusted the pack. The
  // score now measures exactly what `clean` measures, and 100 is reserved for clean.
  const checks = total + keyFigures.length + 1;
  const failed = unsourcedClaims.length + unsourcedFigures.length + (base.sourced ? 0 : 1);
  const clean = failed === 0;
  // An unsourced base is not one failure among many. Revenue and EBITDA are the
  // denominator of the enterprise value, the entry multiple, the equity cheque and the
  // IRR, so a pack whose base is unsourced scored 83 out of 100 while its own summary
  // said "IC ask derived from unsourced Revenue & EBITDA". A committee member reading 83
  // concludes the sourcing is broadly fine. Nothing above an unsourced base is sourced.
  //
  // And a deal with no memo written has nothing to audit: scoring that 100 told a
  // presenter "you checked one number and gave yourself a hundred" on a page full of
  // figures. It is not assessed, and says so.
  const assessed = total > 0 || keyFigures.length > 0;
  const score = !assessed ? null
    : clean ? 100
    : !base.sourced ? Math.min(40, Math.round((100 * (checks - failed)) / Math.max(1, checks)))
    : Math.min(99, Math.round((100 * (checks - failed)) / Math.max(1, checks)));

  // A source label is not diligence. Where the figures cannot be relied on, this module
  // must not publish a clean score either -- the case tab already refuses to.
  const caveats = sourcingCaveats(deal);
  return {
    score: caveats.length || (total + 1 + keyFigures.length) <= 1 ? null : score,
    caveats,
    assessed,
    scoreNote: assessed ? null : 'Nothing to check yet — no memo sections and no key figures are on the record for this deal.',
    // The base figures are CLAIMS, and leaving them out of the counters produced an object
    // that argued with itself: sourcedClaims 2 of 2, unsourcedClaims 0, unsourcedFigures 0,
    // scored 40 for being unsourced. Whichever number a badge rendered was wrong about the
    // other three.
    totalClaims: total + 1 + keyFigures.length,
    sourcedClaims: (total - unsourcedClaims.length) + (base.sourced ? 1 : 0) + keyFigures.filter((k) => k.sourced).length,
    unsourcedClaims: base.sourced ? unsourcedClaims : [...unsourcedClaims, { figure: base.missing.join(' & '), section: 'IC ask — base financials' }],
    keyFigures,
    unsourcedFigures,
    documents,
    icAsk: {
      derivedFrom: 'Revenue + EBITDA (returns engine)',
      baseSourced: base.sourced,
      missingBase: base.missing
    },
    clean: clean && !caveats.length && (total + 1 + keyFigures.length) > 1,
    // THE SUMMARY GAVE BOTH ANSWERS AT ONCE.
    //
    // "Every claim tested traces to a source, and an open repricing item ... No score."
    // — a reader asking whether the page is sourced got yes and no in one sentence. A
    // caveat is not a footnote on a pass; it is the answer. Lead with it.
    // THE SUMMARY GAVE BOTH ANSWERS AT ONCE.
    //
    // "Every claim tested traces to a source, and an open repricing item ... No score."
    // — a reader asking whether the page is sourced got yes and no in one sentence. A
    // caveat is not a footnote on a pass; it is the answer, so it leads.
    summary: (() => {
      const testable = total + 1 + keyFigures.length;
      const sourced = (total - unsourcedClaims.length) + (base.sourced ? 1 : 0) + keyFigures.filter((k) => k.sourced).length;
      const unsourced = testable - sourced;
      if (caveats.length) {
        const lead = `No score — ${caveats.join('; and ')}`.replace(/\s+$/, '');
        // An elided caveat already ends in an ellipsis and a quoted row may already end
        // in a stop; either way the sentence gets exactly one terminator.
        const stopped = /[.…?!]$/.test(lead) ? lead : `${lead}.`;
        return unsourced === 0
          ? `${stopped} Every claim tested does carry a source; that is not the same as being able to rely on the figure.`
          : `${stopped} Separately, ${unsourced} of the ${testable} claim${testable === 1 ? '' : 's'} tested ${unsourced === 1 ? 'does not trace' : 'do not trace'} to a source at all.`;
      }
      if (testable <= 1) return 'Only one claim was tested — too few to say anything about the page. No score.';
      return buildSummary(total, unsourcedClaims.length, unsourcedFigures.length, base);
    })()
  };
}

function buildSummary(total, unsourcedClaims, unsourcedFigures, base) {
  const parts = [];
  if (unsourcedFigures) parts.push(`${unsourcedFigures} key figure(s) carried without a source`);
  if (unsourcedClaims) parts.push(`${unsourcedClaims}/${total} memo figure(s) not traceable to a source`);
  if (!base.sourced) parts.push(`IC ask derived from unsourced ${base.missing.join(' & ')}`);
  if (!parts.length) return 'All numeric claims trace to a source fact or cited document.';
  return parts.join('; ') + '.';
}

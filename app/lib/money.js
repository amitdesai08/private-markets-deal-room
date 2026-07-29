// Shared currency-aware money formatting for every deal artifact. A candidate,
// deal, screen or fund carries its own reporting currency, so no artifact ever
// hard-codes $ for a €/£ record. This is the single source of truth for money
// formatting across screening, scoring, diligence and the document generators.

export const CURSYM = { USD: '$', EUR: '€', GBP: '£' };

// Resolve a currency symbol from any object that carries a `currency` field
// (candidate, deal, screen or fund). Defaults to '$' when unknown.
export const symbolFor = (o) => CURSYM[o && o.currency] || '$';

// Compact money formatter: 1200 -> "$1.2B", 655 -> "£655M" (with sym='£').
export const money = (m, sym = '$') =>
  (m == null ? '—' : m >= 1000 ? `${sym}${(m / 1000).toFixed(1)}B` : `${sym}${Math.round(m)}M`);

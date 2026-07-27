// Geographic regions + region GROUPS — the data-sovereignty / territory axis of
// deal access. A deal belongs to one region; a user's VISIBLE regions are derived
// from the Entra security groups they belong to (see userPolicy.regionsForIdentity):
//
//   • Base region groups (DealRoom-Region-<key>) grant one region.
//   • A "grouped region" (e.g. West Coast) maps to SEVERAL base regions, so a
//     regional manager over a territory sees every deal in it.
//   • A user in NO region group is unrestricted (MDs / partners / admins see all) —
//     region scoping only ever NARROWS, and admins bypass it entirely.
//
// The region→group object-id mapping is admin-configurable at runtime (accessConfig
// regionGroups) and/or seeded from env REGION_GROUP_<KEY>_ID; this module only owns
// the region taxonomy and the hq→region inference for un-tagged deals.

export const REGIONS = [
  { id: 'northeast', label: 'Northeast' },
  { id: 'southeast', label: 'Southeast' },
  { id: 'midwest', label: 'Midwest' },
  { id: 'southcentral', label: 'South Central' },
  { id: 'northwest', label: 'Northwest' },
  { id: 'southwest', label: 'Southwest' },
  { id: 'international', label: 'International' },
];

export const REGION_IDS = REGIONS.map((r) => r.id);
export const regionLabel = (id) => (REGIONS.find((r) => r.id === id) || {}).label || id;

// Grouped regions (territories) — one manager over several base regions.
export const REGION_GROUPS = [
  { id: 'west-coast', label: 'West Coast', regions: ['northwest', 'southwest'] },
  { id: 'eastern', label: 'Eastern Seaboard', regions: ['northeast', 'southeast'] },
];
export const regionGroupById = Object.fromEntries(REGION_GROUPS.map((g) => [g.id, g]));

// Expand a scope key (a base region OR a grouped-region id) into base regions.
export function expandRegionScope(key) {
  const k = String(key || '').toLowerCase();
  if (regionGroupById[k]) return regionGroupById[k].regions.slice();
  return REGION_IDS.includes(k) ? [k] : [];
}

// Keyword → region inference for deals that carry only an hq / jurisdiction string.
// Deterministic so a deal's region is stable across reads. US-centric with an
// international fallback for non-US HQs.
const HQ_RULES = [
  [/\b(new york|ny|boston|massachusetts|ma|connecticut|new jersey|nj|northeast|pennsylvania|philadelphia)\b/i, 'northeast'],
  [/\b(florida|fl|georgia|ga|atlanta|carolina|nc|sc|tennessee|southeast|miami|virginia)\b/i, 'southeast'],
  [/\b(illinois|chicago|ohio|michigan|midwest|indiana|wisconsin|minnesota|missouri|kansas city)\b/i, 'midwest'],
  [/\b(texas|tx|houston|dallas|austin|oklahoma|louisiana|south central|arkansas)\b/i, 'southcentral'],
  [/\b(washington|seattle|oregon|portland|idaho|montana|northwest|pacific northwest)\b/i, 'northwest'],
  [/\b(california|ca|san francisco|los angeles|west|arizona|nevada|colorado|denver|utah|southwest|mountain)\b/i, 'southwest'],
];

// Resolve a deal's region: explicit deal.region wins, else a known-company hint,
// else infer from hq/jurisdiction, else 'international' for a clearly non-US HQ,
// else '' (unassigned = visible to all — no territory restriction).
export function regionForDeal(deal) {
  if (!deal) return '';
  const explicit = String(deal.region || '').toLowerCase();
  if (explicit && REGION_IDS.includes(explicit)) return explicit;
  const company = String(deal.company || '');
  for (const [re, id] of COMPANY_RULES) if (re.test(company)) return id;
  const hq = `${deal.hq || ''} ${deal.jurisdiction || ''}`;
  for (const [re, id] of HQ_RULES) if (re.test(hq)) return id;
  if (/\b(sweden|stockholm|london|uk|united kingdom|swiss|switzerland|germany|france|europe|singapore|canada|japan|australia|ireland|dublin|netherlands|spain|italy|norway|denmark|finland)\b/i.test(hq)) return 'international';
  return '';
}

// Demo-data region hints for the seeded/served deals whose hq is generic ('United
// States'), so the territory model shows a clean spread. Additive only.
const COMPANY_RULES = [
  [/sound united|allbirds|national cinemedia/i, 'southwest'],
  [/xbp global/i, 'southcentral'],
  [/voyager therapeutics|intercept pharmaceuticals/i, 'northeast'],
  [/project onyx|specialty-chemicals/i, 'midwest'],
  [/helvetia|meridian|aurora software|project sterling|nordic grocery/i, 'international'],
];

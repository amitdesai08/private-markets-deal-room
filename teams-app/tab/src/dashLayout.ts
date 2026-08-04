// What the dashboard is built from, and which parts a person has chosen to keep.
//
// The page carries eight distinct sections. Which of them earn their screen space is
// not a question the product can answer for everyone: someone who owns a diligence
// workstream lives in the attention queue and never opens the origination funnel; an
// IC chair wants the opposite; a partner about to present to an LP wants the headline
// numbers and very little else. So the arrangement is a preference, and the preference
// belongs to the person.
//
// Two decisions worth defending:
//
// It records what is HIDDEN, not what is shown. Storing the visible list looks
// equivalent and is not: the day a ninth section ships, everyone who had ever opened
// the customise panel would have a stored list that does not mention it, and the new
// work would be invisible to exactly the people who use the page most. Recording the
// hidden ones means anything new appears for everybody, and a leftover key from a
// section that no longer exists is simply ignored.
//
// It is kept per persona. In this product one person moves between profiles, and each
// profile is a different job with a different page worth looking at. Keying the
// arrangement to the profile means switching profile switches the arrangement instead
// of inheriting the last one.
//
// Stored in the browser, the same way the light/dark choice already is. This is a
// display preference, not a fact about the deal — losing it costs a person ten seconds
// and it is never worth an error.

export type ModuleKey =
  | 'briefing' | 'followups' | 'attention' | 'kpis'
  | 'phases' | 'funnel' | 'deals' | 'market' | 'agenda';

export type DashModule = {
  key: ModuleKey;
  label: string;
  // Said plainly, because a list of bare names is a quiz. The person choosing has to
  // know what they are turning off before they turn it off.
  note: string;
  column: 'left' | 'right' | 'full';
};

export const DASH_MODULES: DashModule[] = [
  { key: 'briefing', label: 'Portfolio briefing', note: 'What changed across your deals, written from the record and cited.', column: 'left' },
  { key: 'followups', label: 'Untracked follow-ups', note: 'Promises made in deal channels that never became a task.', column: 'left' },
  { key: 'attention', label: 'What needs my attention', note: 'Your deals ranked worst-first, each with the reason it is there.', column: 'right' },
  // The product knew the committee sat in four days and which deals were ready for it,
  // and there was nothing anywhere that put those two facts in the same place. A
  // partner preparing for Thursday had to open deals one at a time and keep the answer
  // in her head.
  { key: 'agenda', label: 'Next IC agenda', note: 'The deals due at the next committee, in date order, with what each still owes.', column: 'right' },
  { key: 'kpis', label: 'Headline numbers', note: 'Live deals, pipeline value, average IC readiness and the next IC.', column: 'right' },
  { key: 'phases', label: 'Deals by stage', note: 'Where the live capital sits across diligence, execution and exit.', column: 'full' },
  { key: 'funnel', label: 'Origination funnel', note: 'Sourced, screened and qualified counts for the fund.', column: 'full' },
  { key: 'deals', label: 'Pipeline deals', note: 'Every deal you can see, as cards you can open or compare.', column: 'full' },
  { key: 'market', label: 'Market intelligence', note: 'Comparable deals, IC voting precedents and benchmark findings.', column: 'full' },
];

const STORE_KEY = 'dr.dashboard.hidden';
// Which profile this browser was last used as. The page renders before the profile
// list has come back from the server, and without this the first paint would show
// every section and then take two of them away a second later — which reads as a
// fault, not a preference. Remembering the last one means the page opens in the shape
// the person left it.
const LAST_KEY = 'dr.dashboard.who';
const KNOWN = new Set<string>(DASH_MODULES.map((m) => m.key));

function lastWho(): string {
  try {
    return localStorage.getItem(LAST_KEY) || 'me';
  } catch {
    return 'me';
  }
}

const whoKey = (who?: string) => (who && who.trim()) || lastWho();

/** Note the profile currently in use, so the next visit opens in its arrangement. */
export function rememberWho(who?: string): void {
  try {
    if (who && who.trim()) localStorage.setItem(LAST_KEY, who.trim());
  } catch {
    /* ignore */
  }
}

type Store = Record<string, string[]>;

function readStore(): Store {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

/** The sections this persona has turned off. Anything unrecognised is dropped. */
export function readHidden(who?: string): ModuleKey[] {
  const list = readStore()[whoKey(who)];
  return Array.isArray(list) ? (list.filter((k) => KNOWN.has(k)) as ModuleKey[]) : [];
}

/** Record the choice. Failing to store a preference must never cost the page. */
export function writeHidden(who: string | undefined, hidden: ModuleKey[]): void {
  try {
    const store = readStore();
    const key = whoKey(who);
    const keep = hidden.filter((k) => KNOWN.has(k));
    if (keep.length) store[key] = keep; else delete store[key];
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

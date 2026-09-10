// Where a phrase is spoken, from the engine's own per-word timestamps.
//
// Cues live in the scene manifests (`cues` alongside `say`), not in a lookup table here:
// a cue is a phrase from a particular line of narration, so it belongs with that line, and
// every track has its own script. Keeping them together is what stops a cue quietly
// outliving the sentence it was written for.
//
// Word timings come from narrate.mjs, which harvests them from Azure Speech's wordBoundary
// events. See `harvestWords` there for the anomalies that stream contains.

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

// Returns { start, end } in seconds relative to the clip, or null when the wording is not
// present. Null rather than an approximation on purpose: a phrase that has drifted out of
// the script should fall back to appearing early, never mistime the highlight against a
// sentence it no longer belongs to.
export function findPhrase(words, phrase) {
  const spoken = (words || []).filter((w) => w && w.kind !== 'punct');
  const target = String(phrase || '').split(/\s+/).map(norm).filter(Boolean);
  if (!spoken.length || !target.length) return null;

  for (let i = 0; i + target.length <= spoken.length; i++) {
    let ok = true;
    for (let j = 0; j < target.length; j++) {
      if (norm(spoken[i + j].text) !== target[j]) { ok = false; break; }
    }
    if (!ok) continue;
    const first = spoken[i];
    const last = spoken[i + target.length - 1];
    const end = last.end ?? (last.start + (last.dur || 0));
    return { start: first.start, end };
  }
  return null;
}

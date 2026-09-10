// Turns a narrated manifest into the plan capture.mjs films against.
//
//   node demo/export-capture-plan.mjs --scenes scenes.mjs --manifest scenes.json
//
// Capture needs three things it cannot work out for itself: how long each scene runs, when
// each highlight is due, and which of them are worth moving the pointer to. All three come
// from the narration, so they can only be computed after narrate.mjs has voiced it and
// written the per-word timings.
//
// Run order matters: capture -> narrate -> this -> capture --aim. The first capture exists
// to produce a manifest to narrate; the second is the one that is kept. Skipping this step
// is not loud about it — every scene silently falls back to an eight-second default, which
// is how a fifty-five-second line ends up over an eight-second clip.

import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOLD_AFTER_NARRATION, LEAD_IN_SILENCE } from './lib/timing.mjs';
import { findPhrase } from './lib/cues.mjs';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'build');
const FFPROBE = process.env.DEMO_FFPROBE || 'ffprobe';

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : fallback;
};

const SCENES_MODULE = arg('--scenes', 'scenes.mjs');
const MANIFEST = arg('--manifest', 'scenes.json');
const OUT_FILE = arg('--out', 'capture-plan.json');

async function seconds(file) {
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', `"${file}"`], { shell: true });
  return Number(String(stdout).trim());
}

// A spotlight that names its own text is already telling us what the narrator says about it.
// `text:Daily briefing` frames the panel the words "daily briefing" introduce, so the box can
// land on the phrase instead of at an arbitrary second. Selectors that name markup rather
// than words (`nav.maintabs`, `.vdr-grid`) carry no phrase and get no cue — a scene can
// always state one explicitly with `cues`.
function phraseFromSpec(spec) {
  const s = String(spec || '');
  if (s.startsWith('text:')) return s.slice(5);
  if (s.startsWith('exact:')) return s.slice(6);
  if (s.startsWith('in:')) {
    const at = s.indexOf('@');
    return at > -1 ? s.slice(at + 1) : null;
  }
  return null;
}

async function main() {
  const { SCENES } = await import(`./${SCENES_MODULE}`);
  const manifest = JSON.parse(await readFile(path.join(OUT, MANIFEST), 'utf8'));
  const byId = new Map(manifest.scenes.map((s) => [s.id, s]));

  const plan = {
    viewport: { width: 1920, height: 1080, scale: 2 },
    aims: {},
    durations: {},
    cues: {},
    points: {},
  };

  let cued = 0, missed = 0, unvoiced = 0;

  for (const scene of SCENES) {
    const m = byId.get(scene.id);
    if (!m?.audio) {
      console.log(`  ! ${scene.id}: no narration yet — run narrate.mjs first`);
      unvoiced++;
      continue;
    }

    // The clip has to cover the whole segment the video will build: the beat of silence
    // before the line, the line, and the beat after it. Anything shorter is padded with a
    // frozen frame, which is the thing recording a clip was meant to stop.
    const spoken = await seconds(path.join(OUT, m.audio));
    plan.durations[scene.id] = Number((LEAD_IN_SILENCE + spoken + HOLD_AFTER_NARRATION).toFixed(2));

    const specs = Array.isArray(scene.spotlight) ? scene.spotlight
      : scene.spotlight ? [scene.spotlight] : [];
    if (!specs.length) continue;

    const words = m.words
      ? JSON.parse(await readFile(path.join(OUT, m.words), 'utf8'))
      : [];

    // Positional: cue i belongs to spotlight i. An unresolved phrase holds its place as
    // null rather than collapsing the list, or every later cue would re-aim onto the wrong
    // region — working choreography pointed at nothing.
    const cues = specs.map((spec, i) => {
      // An explicit null means "this region gets no cue" — a scene can show something the
      // line never mentions. Only an ABSENT entry falls back to deriving one from the
      // selector, or saying "no cue" would be indistinguishable from not having said
      // anything, and would warn about a phrase nobody claimed was spoken.
      const stated = scene.cues ? scene.cues[i] : undefined;
      const phrase = stated === undefined ? phraseFromSpec(spec) : stated;
      if (!phrase) return null;
      const hit = findPhrase(words, phrase);
      if (!hit) {
        console.log(`  ! ${scene.id}: "${phrase}" is not spoken in this scene — highlight ${i} falls back`);
        missed++;
        return null;
      }
      cued++;
      return Number((LEAD_IN_SILENCE + hit.start).toFixed(2));
    });

    if (cues.some((c) => c !== null)) plan.cues[scene.id] = cues;
    // The pointer is a hand, not a laser pointer following the narration. It only moves
    // where a scene says so, which is why this is opt-in per scene rather than derived.
    if (scene.pointAt?.length) plan.points[scene.id] = scene.pointAt;
  }

  await writeFile(path.join(HERE, OUT_FILE), JSON.stringify(plan, null, 2), 'utf8');

  const total = Object.values(plan.durations).reduce((a, b) => a + b, 0);
  console.log(`\n${Object.keys(plan.durations).length} scenes, ${Math.round(total / 60)} min of narration`);
  console.log(`${cued} highlights timed to a spoken phrase, ${missed} fell back`);
  console.log(`${Object.keys(plan.points).length} scenes move the pointer`);
  if (unvoiced) console.log(`${unvoiced} scenes have no narration yet`);
  console.log(`wrote ${OUT_FILE}`);
}

main();

// Drives the real product through every scene and writes one screenshot each.
//
//   node demo/capture.mjs            all scenes
//   node demo/capture.mjs 13 14      only those scene indexes
//   DEMO_HEADED=1 node demo/capture.mjs   watch it happen
//
// Also captures an EXTERNAL target — a resource the user built themselves (a Foundry
// deployment, an ADF pipeline, any other Azure UI), when the manifest exports a `TARGET`
// with `kind: 'external'`. See ../.github/skills/demo-production/references/scene-schema.md
// for the manifest shape; the short version: no seat, no demo-mode auth — a human signs in
// once in the opened browser and this reuses that session on later runs.
//
// Output: demo/build/shots/<id>.png and demo/build/scenes.json.

import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/cdp.mjs';
import { tabToken } from './lib/token.mjs';
import { waitForEnter } from './lib/prompt.mjs';

const execFileAsync = promisify(execFile);

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : fallback;
};
// The runbook visits screens the walkthrough never does, and keeps them in its own manifest.
const SCENES_MODULE = arg('--scenes', 'scenes.mjs');
const MANIFEST = arg('--manifest', 'scenes.json');
const { BASE, SCENES, ACTS, TARGET = { kind: 'dealroom' } } = await import(`./${SCENES_MODULE}`);
// Every existing manifest omits TARGET, so this is 'dealroom' for all of them — nothing
// below changes their behavior. Only a manifest that explicitly opts in with
// `export const TARGET = { kind: 'external', ... }` takes the external code paths.
const EXTERNAL = TARGET.kind === 'external';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'build');
const SHOTS = path.join(OUT, 'shots');
const CLIPS = path.join(OUT, 'clips');

// `--video` records each scene as it is driven, instead of only screenshotting the result.
// Two CDP behaviours shape this: frames arrive only when the page actually CHANGES, so a
// clip's frame count reflects activity rather than elapsed time; and the OS cursor is not
// captured, so the pointer path is written out as data for the video build to draw.
const VIDEO = process.argv.includes('--video');
// `--teams` films the app where a user actually meets it: inside the Teams web client, in
// the channel it belongs to. The app is then a cross-origin frame, so script goes to that
// frame's own session while input and the camera stay on the page that hosts it.
const HOSTED = process.argv.includes('--teams');
const TEAMS_URL = arg('--teams-url', 'https://teams.microsoft.com/');
// Which channel and tab to open. Overridable because the names are the customer's, not ours.
const TEAMS_CHANNEL = arg('--channel', 'Deal Hub');
const TEAMS_TAB = arg('--tab', 'Deal Room');
// Mouse events are dispatched in PAGE coordinates; the app reports rects in its own frame.
let OFFSET = { x: 0, y: 0 };
// Optional map of scene id -> [{x,y,w,h}] naming exactly where the finished video will draw
// its highlight. The recorded hover is aimed there instead of at the middle of whatever the
// scene's spotlight selector resolves to, so the pointer and the highlight agree on screen
// rather than landing on two different things.
const AIM_FILE = arg('--aim', '');
const PLAN = AIM_FILE
  ? JSON.parse(await readFile(path.join(HERE, AIM_FILE), 'utf8'))
  : {};
const AIMS = PLAN.aims || {};
// scene id -> the second each aim rect's phrase is spoken, indexed alongside AIMS.
const CUES = PLAN.cues || {};
// scene id -> which of those cues the pointer takes part in. A highlight marks what is being
// talked about; the pointer is a hand, and it only goes where a hand would. Everything not
// listed here is highlighted without the cursor moving at all.
const POINTS = PLAN.points || {};

// Those rects are in the viewport they were measured in, so recording in a different one
// silently aims at the wrong place and hands the build a clip it has to stretch. Take the
// size from the plan unless told otherwise. Hosted, the window is ours to choose, so it asks
// for the video's own 16:9 and settles for the largest that fits the screen.
let WIDTH = Number(process.env.DEMO_WIDTH || PLAN.viewport?.width || (HOSTED ? 1920 : 1440));
let HEIGHT = Number(process.env.DEMO_HEIGHT || PLAN.viewport?.height || (HOSTED ? 1080 : 900));
const SCALE = Number(process.env.DEMO_SCALE || PLAN.viewport?.scale || 2);// How long each scene will be on screen. Recording only the setup steps leaves the video
// build holding a frozen frame for the rest of the scene, which is what makes a recorded
// demo still read as screenshots — measured at 10% of frames changing, with a 23s dead
// stretch. With a duration the capture keeps working the screen for the whole scene.
const DURATIONS = PLAN.durations || {};
// A beat of stillness at each end of a clip, so a cut never lands mid-motion.
const SETTLE_MS = 700;
// Requested at the CSS size while the page renders on a SCALE-times-larger surface, so
// Chrome downsamples and the JPEG is supersampled rather than native. Built on demand
// because a hosted run does not know the size until the window is open.
const screencast = () => ({
  format: 'jpeg', quality: 95, everyNthFrame: 1, maxWidth: WIDTH, maxHeight: HEIGHT,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (s) => JSON.stringify(String(s));

// Cubic ease-out: quick off the mark, settling onto the target, the way a hand moves.
const ease = (k) => 1 - (1 - k) ** 3;
const rnd = (a, b) => a + Math.random() * (b - a);

// Dispatches a real mouse path, so the app's own hover and focus states fire, and records
// where the pointer was at each moment for the overlay to follow.
//
// Nothing alive moves the same way twice. Every glide used to be 22 steps, 22ms apart, on
// the same curve, landing exactly on centre — which reads as a tween, because it is one. So
// the duration follows the distance, a long throw overshoots and is pulled back, the
// landing is near the target rather than on its centre, and the step timing wanders.
//
// `budgetMs` exists because a step costs a round-trip, and that round-trip is far dearer
// when the app is a frame inside Teams than when it is the page: the same 34-step glide that
// took under a second standalone can take several, which is enough to push a scene past the
// narration it has to fit. Out of time, it stops stepping — but it always lands, because the
// caller carries the end point forward and measures the next highlight from it.
async function glide(s, from, to, track, clock, budgetMs = Infinity) {
  const target = { x: Math.round(to.x + rnd(-7, 7)), y: Math.round(to.y + rnd(-5, 5)) };
  const dist = Math.hypot(target.x - from.x, target.y - from.y);
  if (dist < 2) return from;

  const startedAt = Date.now();
  const spent = () => Date.now() - startedAt;
  const n = Math.max(10, Math.min(34, Math.round(9 + dist / 42)));
  const over = dist > 220 ? rnd(0.03, 0.07) : 0;
  const settle = over ? Math.max(3, Math.round(n * 0.25)) : 0;
  const main = Math.max(1, n - settle);
  const peak = {
    x: from.x + (target.x - from.x) * (1 + over),
    y: from.y + (target.y - from.y) * (1 + over),
  };

  const step = async (a, b, k) => {
    const x = Math.round(a.x + (b.x - a.x) * k);
    const y = Math.round(a.y + (b.y - a.y) * k);
    await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + OFFSET.x, y: y + OFFSET.y, buttons: 0 });
    track.push({ t: clock(), x, y });
    await sleep(rnd(13, 24));
  };

  for (let i = 1; i <= main && spent() < budgetMs; i++) await step(from, peak, ease(i / main));
  for (let i = 1; i <= settle && spent() < budgetMs; i++) await step(peak, target, ease(i / settle));
  await s.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: target.x + OFFSET.x, y: target.y + OFFSET.y, buttons: 0,
  });
  track.push({ t: clock(), x: target.x, y: target.y });
  return target;
}

async function scrollTo(s, top) {
  await s.eval(`(() => { const sc = window.__demo.scroller(); sc.scrollTo({ top: ${top}, behavior: 'smooth' }); return true; })()`)
    .catch(() => {});
  await sleep(700);
}

// Runs a scene's steps with the camera rolling, moving the pointer to each control before
// using it so the click reads as intent rather than something the page did to itself.
//
// Waiting is cut, not filmed. Asking the assistant a real question took 60s, of which 43s
// was a spinner — compressed to fit the scene that was still 19s of nothing and left the
// answer 4s on screen. An edited demo cuts the wait, so this stops recording once the beat
// that shows the app is working has been seen, and resumes when the answer is there.
const WAIT_BEAT_MS = 1500;

async function perform(s, steps, from, track, clock, state, camera, focus) {
  let at = from;
  for (const step of steps) {
    const [verb, arg] = Object.entries(step)[0];
    const spec = verb === 'clickText' ? { expr: `window.__demo.clickable(${js(arg)})`, click: true }
      : verb === 'click' ? { expr: `window.__demo.resolve(${js(arg)}, false)`, click: true }
      : verb === 'type' && arg.selector ? { expr: `document.querySelector(${js(arg.selector)})` }
      : null;

    if (spec) {
      const r = await s.eval(`window.__demo.rect(${spec.expr})`).catch(() => null);
      if (r && r.w > 0 && r.y > 0 && r.y < HEIGHT) {
        at = await glide(s, at, {
          x: Math.round(r.x + r.w / 2),
          y: Math.round(r.y + r.h / 2),
        }, track, clock, 2200);
        // What the pointer is actually engaging, at the moment it engages it.
        focus?.push({ t: clock(), x: r.x, y: r.y, w: r.w, h: r.h });
        if (spec.click) track.push({ t: clock(), x: at.x, y: at.y, click: true });
        await sleep(260);
      }
    }

    if (camera && (verb === 'waitJs' || verb === 'waitText')) {
      await sleep(WAIT_BEAT_MS);
      await camera.off();
      await runStep(s, step, state);
      await camera.on();
      continue;
    }
    await runStep(s, step, state);
  }
  return at;
}

// A hand rests. It moves when there is something to point at, lands, and stays there.
//
// Everything else this used to do was motion invented to fill time: a tour of the page
// hovering whatever would repaint, a few pixels of "drift" every second so the pointer
// looked alive, and a settle-back glide to use up the remainder. Each was defensible on its
// own and together they read as a cursor wandering for no reason, because that is what it
// was. The only movement left is movement the narration asks for.
//
// A scene with no cue simply rests. That is not a gap to be filled — a still pointer over a
// screen being explained is what a person actually does.
async function choreograph(s, aims, from, targetMs, track, clock, focus, schedule, pointAt, origin = 0) {
  const started = Date.now();
  // Cue times come from the narration and are measured from the START OF THE CLIP, so they
  // are read off the clip's clock. Measuring from this function's own start instead put every
  // highlight late by however long the scene's setup took on camera — 12s on the seat switch,
  // 11s on the assistant, both landing after the narration had moved on.
  const elapsed = () => clock() - origin;
  // The budget is this function's own, though: it is what remains of the scene to fill.
  const left = () => targetMs - (Date.now() - started);
  const centre = (r) => ({
    x: Math.round(r.x + Math.min(r.w / 2, 160)),
    y: Math.round(r.y + Math.min(r.h / 2, 90)),
  });
  const onScreen = (p) => p.x > 4 && p.y > 4 && p.x < WIDTH - 4 && p.y < HEIGHT - 4;

  // Positional, never compacted: cue i addresses aim i. Filtering the list instead would
  // renumber every region after an unusable one and quietly re-aim the cues that follow.
  const usable = (r) => r && typeof r.x === 'number' && onScreen(centre(r));
  const named = aims.map((r) => (usable(r) ? r : null));
  const points = named.map((r) => (r ? centre(r) : null));
  const mark = (i) => { const r = named[i]; if (r) focus?.push({ t: clock(), x: r.x, y: r.y, w: r.w, h: r.h }); };
  // Already on the thing being discussed: pointing at it again is a twitch, not a gesture.
  const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

  // The scheduled path: each region, at the second its phrase is spoken.
  const plan = (schedule || [])
    .map((at, i) => ({ at, i }))
    .filter((c) => c.at !== null && c.at !== undefined && points[c.i])
    .sort((a, b) => a.at - b.at);
  const moves = new Set(pointAt || []);

  let at = from;

  if (!plan.length) {
    // Nothing to point at. Move out of the way once, low and to the left where the app puts
    // no content worth reading, and then hold still for the rest of the scene.
    const vp = await s.eval('({ w: window.innerWidth, h: window.innerHeight })')
      .catch(() => ({ w: WIDTH, h: HEIGHT }));
    const park = { x: Math.round(vp.w * 0.07), y: Math.round(vp.h * 0.9) };
    if (Math.hypot(park.x - at.x, park.y - at.y) > 40) {
      at = await glide(s, at, park, track, clock, Math.min(1600, Math.max(400, left() - 500)));
    }
    while (left() > 200) await sleep(150);
    return at;
  }

  let lastMark = -Infinity;
  for (const cue of plan) {
    // Arrive just before the phrase, the way a presenter moves ahead of their own words.
    const lead = Math.max(0, cue.at - 0.45);
    // A scene whose setup runs on camera can overrun its own early cues — the seat switch
    // takes 12s and both of its cues fall inside that. Those still have to land in sequence:
    // released together they stack, and two highlights appear at once instead of one moving
    // to the next as the sentence does.
    const due = Math.max(lead, lastMark + 1.5);
    while (elapsed() < due && left() > 800) await sleep(80);
    if (left() < 600) break;
    // The hand moves only for the cues that are about touching or singling something out.
    // The rest are marked where they are, so the highlight lands without the cursor chasing
    // it across the screen for a point that does not need a hand.
    if (moves.has(cue.i) && !inside(at, named[cue.i])) {
      at = await glide(s, at, points[cue.i], track, clock, Math.min(2000, Math.max(500, left() - 500)));
    }
    mark(cue.i);
    lastMark = elapsed();
  }
  // Whatever is left belongs to the narration, not the pointer.
  while (left() > 200) await sleep(150);
  return at;
}

// Frame durations come from real arrival times; the encoder resamples to constant 30fps,
// which holds the last picture through the stretches where nothing changed.
//
// The clip is re-based to `origin` — the moment the scene starts being performed. The
// recording clock starts earlier, before the setup steps, and those can take a minute on a
// slow screen; left in, that dead time lands in the clip and drags the pointer track with
// it. The frame showing at `origin` is kept as the opening picture, so re-basing trims the
// setup without opening on a blank screen.
//
// Every frame is then held for its REAL gap. Frames arrive only when the page changes, so a
// scene the presenter talks over without touching is genuinely two frames — and it still has
// to last as long as the sentence being spoken over it. Capping the hold was what collapsed
// a 29s scene into 2.6s. Because nothing is capped, clip time EQUALS wall time, so the
// pointer track needs no remapping — subtracting `base` is the whole conversion.
async function encodeClip(id, frames, endAt, origin = 0) {
  const base = origin;
  // A frame acknowledged after the scene's end marker is not part of the scene; keeping one
  // stretches the clip past its narration by however late it landed.
  const within = frames.filter((f) => f.at <= endAt);
  const usable = within.length ? within : frames.slice(0, 1);
  // The last frame at or before `origin` is what is on screen when the scene begins. On a
  // scene nothing repaints during, that is the ONLY frame, and it is held for the full
  // duration. Basing on it instead would pull the preceding setup back into the clip.
  const first = Math.max(0, usable.findLastIndex((f) => f.at <= base));
  const kept = usable.slice(first);
  const work = path.join(CLIPS, `_${id}`);
  await rm(work, { recursive: true, force: true }).catch(() => {});
  await mkdir(work, { recursive: true });

  const lines = [];
  const held = [];
  let clipT = 0;
  for (const [i, f] of kept.entries()) {
    const name = `f${String(i).padStart(5, '0')}.jpg`;
    await writeFile(path.join(work, name), Buffer.from(f.data, 'base64'));
    const at = Math.max(0, f.at - base);
    const next = kept[i + 1] ? Math.max(at, kept[i + 1].at - base) : Math.max(endAt - base, at + 0.4);
    const shown = Math.max(0.016, next - at);
    clipT += shown;
    held.push(shown);
    lines.push(`file '${name}'`, `duration ${shown.toFixed(3)}`);
  }
  // The last frame is repeated so the concat demuxer does not drop it — but a trailing entry
  // with no `duration` inherits the previous one, which on a sparse clip means silently
  // appending its whole final hold a second time. 03-home-briefing encoded 38.6s against a
  // 29.7s timeline for exactly this reason. The repeat is kept; its duration is stated.
  lines.push(`file 'f${String(kept.length - 1).padStart(5, '0')}.jpg'`, 'duration 0.040');
  await writeFile(path.join(work, 'list.txt'), lines.join('\n'), 'utf8');

  // This is an intermediate the build re-encodes, so keep it near-transparent: quality lost
  // here cannot be recovered later, and UI text is the first thing to smear.
  //
  // The concat demuxer cannot be trusted with the long tail. Measured directly: a list of
  // [0.04, 0.27, 0.05, 8.18] encoded as 0.68s — the changing frames were honoured and the
  // final hold was dropped — while a list of four equal 2s durations encoded correctly. So
  // the hold is not asked of it: the last frame is cloned to fill, and `-t` fixes the exact
  // length. Correct whatever the demuxer does with the tail.
  const out = path.join(CLIPS, `${id}.mp4`);
  const target = clipT.toFixed(3);
  await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
    '-i', `"${path.join(work, 'list.txt')}"`,
    '-vf', `"tpad=stop_mode=clone:stop_duration=${target},fps=30"`, '-t', target,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
    `"${out}"`], { shell: true, maxBuffer: 1 << 26 });
  await rm(work, { recursive: true, force: true }).catch(() => {});
  // The encoded file is the only thing the build measures, so trust it over the timeline it
  // was handed: a concat list whose durations do not survive encoding produces a clip that
  // silently disagrees with its narration, and the first visible symptom is a scene the
  // build plays fast for reasons nothing reports.
  const actual = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', `"${out}"`], { shell: true })
    .then((r) => Number(String(r.stdout).trim())).catch(() => NaN);
  if (Number.isFinite(actual) && Math.abs(actual - clipT) > 1) {
    console.log(`    ${id}: encoded ${actual.toFixed(1)}s but timeline was ${clipT.toFixed(1)}s`
      + ` (${kept.length} frames) durations=[${held.map((d) => d.toFixed(2)).join(', ')}]`);
  }
  return { out, base, seconds: Number.isFinite(actual) ? actual : clipT };
}


// Helpers that live in the page. Text matching is how a person finds things on a screen,
// and it survives a CSS refactor in a way that a generated class name does not.
const HELPERS = `
window.__demo = {
  // The deal detail page scrolls inside its own '.drawer-body' pane rather than the
  // document — older builds scrolled 'main.main', and pages without either (Home, All
  // deals) scroll the document itself. Prefer whichever candidate actually overflows,
  // so a markup change elsewhere doesn't silently turn scrollTo/scrollTop into a no-op.
  scroller() {
    const candidates = [
      document.querySelector('.drawer-body'),
      document.querySelector('main.main'),
      document.scrollingElement,
    ].filter(Boolean);
    return candidates.find((el) => el.scrollHeight > el.clientHeight + 4) || document.scrollingElement;
  },
  visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden';
  },
  // The smallest element whose own text matches — avoids matching <body>.
  byText(needle, tags) {
    const want = String(needle).toLowerCase();
    const sel = tags || 'button,a,h1,h2,h3,h4,div,span,td,li,label,p,strong';
    const hits = [...document.querySelectorAll(sel)].filter((e) => {
      if (!window.__demo.visible(e)) return false;
      const t = (e.innerText || '').trim().toLowerCase();
      return t.includes(want);
    });
    if (!hits.length) return null;
    hits.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
    return hits[0];
  },
  clickable(needle) {
    const want = String(needle).toLowerCase();
    const els = [...document.querySelectorAll('button,a,[role=button],[role=tab],select,input')];
    const exact = els.filter((e) => window.__demo.visible(e)
      && (e.innerText || e.value || '').trim().toLowerCase() === want);
    if (exact.length) return exact[0];
    const loose = els.filter((e) => window.__demo.visible(e)
      && (e.innerText || e.value || '').trim().toLowerCase().includes(want));
    loose.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
    return loose[0] || null;
  },
  rect(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  },
  // How far this screen can actually scroll, and where it currently sits. Short pages
  // report a max of ~0, and asking them to scroll produces no repaint at all, which is how
  // a scene ends up as a frozen picture.
  // A heading is where the text matches, but the panel is what the narrator is talking
  // about, so grow the match up to the card it belongs to. The card is bounded by the
  // scroll container; anything taller than about two screens is a column of cards rather
  // than one of them. Testing area instead traps tall panels, which is how "What needs my
  // attention" ended up spotlighting its own title bar.
  panel(el) {
    const stop = window.__demo.scroller();
    const vh = window.innerHeight;
    let best = el, n = el;
    for (let i = 0; i < 10 && n && n.parentElement; i++) {
      n = n.parentElement;
      if (n === stop || n === document.body || n === document.documentElement) break;
      const r = n.getBoundingClientRect();
      if (r.height > vh * 1.8) break;
      if (r.height > best.getBoundingClientRect().height) best = n;
    }
    return best;
  },
  resolve(spec, grow) {
    if (!spec) return null;
    const s = String(spec);
    // 'in:selector@text' names the one element matching the selector whose text contains
    // that text, taken exactly as-is. It is the only way to point at a specific item in a
    // list whose rows are identical in markup: a plain selector hits the first row, and a
    // 'text:' spec grows past the row to the whole list.
    if (s.startsWith('in:')) {
      const at = s.indexOf('@');
      if (at < 0) return null;
      const sel = s.slice(3, at);
      const want = s.slice(at + 1).toLowerCase();
      return [...document.querySelectorAll(sel)]
        .find((e) => window.__demo.visible(e) && (e.innerText || '').toLowerCase().includes(want)) || null;
    }
    // 'exact:some words' is the smallest element carrying that text, taken as-is. 'text:'
    // grows to the card the text sits in, which is right for a section and far too big for a
    // chip or a badge — and growth is what stops a scene pointing at two things in one card.
    if (s.startsWith('exact:')) return window.__demo.byText(s.slice(6));
    if (!s.startsWith('text:')) return document.querySelector(s);
    const el = window.__demo.byText(s.slice(5));
    if (!el) return null;
    // A click points at the control itself; a spotlight frames the panel around it.
    return grow ? window.__demo.panel(el) : el;
  },};
true;
`;

// Teams routes on the client, so no URL opens a channel tab. What does exist is the same UI a
// person clicks: the channel in the rail, then the tab above the conversation. Driven in the
// TOP document, because this is Teams' own chrome rather than the app.
//
// Best effort by design. Teams' markup is not ours and will change; when it does the caller
// falls back to asking, which is exactly where this started.
async function openHostedTab(s, channel, tab) {
  const clickByText = async (label, roles) => s.send('Runtime.evaluate', {
    expression: `(() => {
      const want = ${js(label)}.toLowerCase();
      const sel = ${js(roles)};
      // Exact text only: 'Deal Room' also appears inside 'Deal Room Report', and a loose
      // match would open the wrong tab and still look like it worked.
      const hit = [...document.querySelectorAll(sel)].find((e) => {
        if ((e.innerText || '').trim().toLowerCase() !== want) return false;
        const r = e.getBoundingClientRect();
        return r.width > 4 && r.height > 4;
      });
      if (!hit) return false;
      (hit.closest('a,button,[role=link],[role=tab],[role=treeitem]') || hit).click();
      return true;
    })()`,
    returnByValue: true,
  }).then((r) => r.result?.value === true).catch(() => false);

  const until = Date.now() + 90000;
  const tryClick = async (label, roles) => {
    while (Date.now() < until) {
      if (await clickByText(label, roles)) return true;
      await sleep(1000);
    }
    return false;
  };

  if (!await tryClick(channel, 'a,button,[role=link],[role=treeitem],span,div')) return false;
  await sleep(2500);
  if (!await tryClick(tab, 'a,button,[role=tab],[role=link],span,div')) return false;
  return true;
}

// The app's own document, once Teams has built the frame for it. Polled rather than read
// once: the frame exists before the app inside it has rendered anything to recognise.
async function findAppSession(s, timeoutMs) {
  const MARK = `(() => ({ href: location.href, ok: !!(document.querySelector('main.main')`
    + ` || document.querySelector('.dealsview') || document.querySelector('.drawer-body')) }))()`;
  const until = Date.now() + timeoutMs;
  for (;;) {
    for (const t of s.targets().filter((t) => t.type === 'iframe')) {
      await s.enableTarget(t.sessionId);
      const r = await s.eval(MARK, { sessionId: t.sessionId }).catch(() => null);
      if (r?.ok) return t.sessionId;
    }
    if (Date.now() > until) return null;
    await sleep(1500);
  }
}

async function inject(s) { await s.eval(HELPERS); }

// Where the app frame sits in the Teams page. Read again for every scene rather than once at
// startup: anything Teams shows or hides at the top of the window moves the app, and an
// offset taken before that happens puts every pointer and highlight out by its height.
async function measureHost(s) {
  return s.send('Runtime.evaluate', {
    expression: `(() => { for (const f of document.querySelectorAll('iframe')) {`
      + ` const b = f.getBoundingClientRect();`
      + ` if (b.width > 200 && b.height > 200) return { x: Math.round(b.x), y: Math.round(b.y),`
      + ` w: Math.round(b.width), h: Math.round(b.height) }; } return null; })()`,
    returnByValue: true,
  }).then((r) => r.result?.value).catch(() => null);
}

// Teams' own prompts are not part of the product being shown, and a banner across the top of
// every scene reads as an unfinished demo. Scoped to the banner it recognises rather than
// clicking anything that looks dismissable, which could close the channel itself.
async function dismissHostChrome(s) {
  const r = await s.send('Runtime.evaluate', {
    expression: `(() => {
      const wanted = /stay in the know|desktop notifications|get the (teams )?app|download the app/i;
      // Ancestors nest, so the same button matches through each one — collected first and
      // clicked once, or a single banner reads as eight dismissals and a different day's
      // markup could mean eight different buttons.
      const seen = new Set();
      for (const el of document.querySelectorAll('div,section,aside')) {
        if (el.children.length > 12) continue;
        if (!wanted.test(el.textContent || '')) continue;
        for (const b of el.querySelectorAll('button')) {
          const label = (b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '');
          if (/dismiss|close|not now|maybe later|no thanks/i.test(label)) seen.add(b);
        }
      }
      const out = [];
      for (const b of seen) {
        out.push(((b.getAttribute('aria-label') || b.textContent || '').trim()).slice(0, 40));
        b.click();
      }
      return out;
    })()`,
    returnByValue: true,
  }).then((x) => x.result?.value).catch(() => null);
  return Array.isArray(r) ? r : [];
}

// Route the app to a hash. Hosted, the app is a frame inside Teams and a page-level
// navigation would take the whole client away — so the route is set in the app's own
// document, which also keeps the seat as the real signed-in one rather than a query param.
async function gotoApp(s, hash, state, { waitForApp = true } = {}) {
  if (HOSTED) {
    await s.eval(`(() => { location.hash = ${js(hash || '#/overview')}; return true; })()`);
    await sleep(700);
    await inject(s);
  } else {
    await s.navigate(`${BASE}/?dr_as=${state.seat}${hash}`);
    await inject(s);
  }
  if (waitForApp) {
    await s.waitFor(`!document.body.innerText.includes('Loading your deals')`,
      { timeout: 90000, label: 'app load' });
  }
}

async function settle(s) {
  // Let the fonts land and any in-flight fetch paint before the shutter.
  await s.eval(`document.fonts ? document.fonts.ready.then(() => true) : true`).catch(() => {});
  await sleep(500);
}

// These steps assume the Deal Room's own demo-mode URL scheme, seat switcher, deal list and
// "viewing as" banner — none of which exist on an external target's own UI. Thrown early and
// clearly, the same way an unknown verb is, rather than silently doing nothing useful.
const DEALROOM_ONLY_STEPS = new Set(['selectSeat', 'openDeal', 'dismissBanner', 'gotoConfidential', 'closeOverlay']);

async function runStep(s, step, state) {
  const [verb, arg] = Object.entries(step)[0];
  if (EXTERNAL && DEALROOM_ONLY_STEPS.has(verb)) {
    throw new Error(`'${verb}' is Deal Room-only and not available when TARGET.kind is 'external' — use goto/wait/waitText/scrollTo/scrollTop/clickText/click instead`);
  }

  switch (verb) {
    case 'goto':
      if (EXTERNAL) {
        // An absolute URL is used as-is; anything else is a path against TARGET.baseUrl —
        // there is no demo-mode seat query param to add, because there is no demo mode.
        await s.navigate(/^https?:\/\//.test(arg) ? arg : `${TARGET.baseUrl}${arg}`);
        await inject(s);
      } else {
        await gotoApp(s, arg, state);
      }
      break;

    case 'wait':
      await sleep(arg);
      break;

    // Types a character at a time into a real field. `Input.insertText` raises the same
    // input events a keyboard does, so a controlled React field updates and its send button
    // enables — pasting the value straight into the DOM does neither.
    case 'type': {
      const found = await s.eval(`(() => {
        const el = ${arg.selector ? `document.querySelector(${js(arg.selector)})` : 'document.querySelector("textarea, input[type=text]")'};
        if (!el) return false;
        el.focus();
        return true;
      })()`);
      if (!found) throw new Error(`type: nothing matched ${arg.selector || 'a text field'}`);
      for (const ch of String(arg.text)) {
        await s.send('Input.insertText', { text: ch });
        // Human cadence. Uniform delays read as a machine filling in a form.
        await sleep(38 + Math.round(Math.random() * 50));
      }
      break;
    }

    case 'press': {
      const keys = { Enter: 13, Escape: 27, Tab: 9 };
      const code = keys[arg];
      if (!code) throw new Error(`press: unsupported key '${arg}'`);
      for (const type of ['keyDown', 'keyUp']) {
        await s.send('Input.dispatchKeyEvent', {
          type, key: arg, code: arg, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code,
        });
      }
      break;
    }

    case 'waitText':
      await s.waitFor(`document.body.innerText.includes(${js(arg)})`, { timeout: 60000, label: `text ${arg}` });
      break;

    // Waits on the page's own state rather than a guessed number of seconds — an answer that
    // streams in takes as long as it takes, and a fixed wait either cuts it off or stalls.
    case 'waitJs':
      await s.waitFor(arg, { timeout: 90000, label: 'condition' });
      break;

    case 'scrollTop':
      await s.eval(`(() => { const sc = window.__demo.scroller(); sc.scrollTop = ${Number(arg)}; return true; })()`);
      await sleep(700);
      break;

    case 'scrollTo':
      await s.waitFor(`!!window.__demo.byText(${js(arg)})`, { timeout: 30000, label: `panel ${arg}` });
      await s.eval(`(() => {
        const el = window.__demo.byText(${js(arg)});
        const sc = window.__demo.scroller();
        const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
        sc.scrollTo({ top: Math.max(0, top - 24), behavior: 'instant' });
        return true;
      })()`);
      await sleep(900);
      break;

    case 'clickText': {
      await s.waitFor(`!!window.__demo.clickable(${js(arg)})`, { timeout: 30000, label: `control ${arg}` });
      const r = await s.eval(`(() => {
        const el = window.__demo.clickable(${js(arg)});
        const rect = window.__demo.rect(el);
        el.click();
        return rect;
      })()`);
      state.lastClick = r;
      await sleep(900);
      break;
    }

    case 'click': {
      const r = await s.eval(`(() => {
        const el = document.querySelector(${js(arg)});
        if (!el) return null;
        const rect = window.__demo.rect(el);
        el.click();
        return rect;
      })()`);
      state.lastClick = r;
      await sleep(900);
      break;
    }

    case 'openDeal': {
      // Current UI makes the company name itself the row's button; older builds had a
      // separate "Open deal" button per row instead — accept either as "the list is ready".
      await s.waitFor(
        `(document.body.innerText.includes('Open deal') || [...document.querySelectorAll('button')].some((b) => (b.innerText || '').trim().includes(${js(arg)})))`,
        { timeout: 45000, label: 'deals list' },
      );
      const how = await s.eval(`(() => {
        const name = ${js(arg)};
        // Current UI: the company name itself is the row's button. Older builds used a
        // separate "Open deal" button per row instead — try that first since it is more
        // exact (an exact-text button match, not a substring), then fall back to it.
        const nameBtn = [...document.querySelectorAll('button')]
          .filter((b) => (b.innerText || '').trim().includes(name))
          .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
        if (nameBtn) { nameBtn.scrollIntoView({ block: 'center' }); nameBtn.click(); return 'ok'; }
        const row = [...document.querySelectorAll('div,tr,li,section,article')]
          .filter((e) => (e.innerText || '').includes(name)
            && [...e.querySelectorAll('button')].some((b) => /open deal/i.test(b.innerText)))
          .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
        if (!row) return 'no row for ' + name;
        const btn = [...row.querySelectorAll('button')].find((b) => /open deal/i.test(b.innerText));
        btn.scrollIntoView({ block: 'center' });
        btn.click();
        return 'ok';
      })()`);
      if (how !== 'ok') throw new Error(how);
      await s.waitFor(`/\\/deal\\//.test(location.hash)`, { timeout: 30000, label: `deal ${arg} to open` });
      await sleep(3500);
      await inject(s);
      // Remember where a confidential deal lives so a later seat can be refused from it.
      state.lastDealUrl = await s.eval('location.hash');
      break;
    }

    case 'clearHighlight': {
      // Ends the current highlight at an exact moment. The seat selector's TEXT changes the
      // instant the value is set, while its LAYOUT only shifts when the badge re-renders — so
      // the name reads Chidi while the box is still sized and placed for Eleanor. Better a
      // brief gap than a box around the wrong thing.
      if (state.clock) state.focus?.push({ t: state.clock(), clear: true });
      break;
    }

    case 'waitMoved': {
      // The repaint expressed as the only condition that actually matters: the thing about to
      // be re-measured has changed shape. Text-based signals are guesses about which words
      // survive a re-render — 'Deal Sponsor' turned out to persist — and a fixed wait leaves
      // the previous highlight sitting over the new picture.
      const before = state.lastRect && state.lastRect[arg];
      if (!before) break;
      await s.waitFor(
        `(() => { const r = window.__demo.rect(window.__demo.resolve(${js(arg)}, true));`
        + ` return !!r && (Math.abs(r.x - ${before.x}) > 4 || Math.abs(r.w - ${before.w}) > 4); })()`,
        { timeout: 15000, interval: 50, label: `${arg} to move` },
      ).catch(() => console.log(`    ! ${arg} never moved — highlight may lag the change`));
      break;
    }

    case 'highlight': {
      // Marks a region without moving the pointer. A control whose contents change also
      // changes SHAPE — the seat selector is one width reading "Eleanor Shellstrop" and
      // another reading "Chidi Anagonye" — so one rect cannot fit both states. Each state
      // gets its own, measured while it is the one on screen.
      if (!state.clock) break;
      const r = await s.eval(`window.__demo.rect(window.__demo.resolve(${js(arg)}, true))`)
        .catch(() => null);
      if (!r || typeof r.x !== 'number') {
        console.log(`    ! highlight ${arg} did not resolve`);
        break;
      }
      state.focus?.push({ t: state.clock(), x: r.x, y: r.y, w: r.w, h: r.h });
      state.lastRect = { ...(state.lastRect || {}), [arg]: r };
      break;
    }

    case 'point': {
      // A gesture DURING setup. The choreography only starts once the steps are done, so a
      // change the narration attributes to a control — the seat switch — could never be
      // pointed at before it happened. This records the travel and the highlight at the
      // moment the step runs, which is what makes the swap read as caused rather than found.
      if (!state.track || !state.clock) break;
      const r = await s.eval(`window.__demo.rect(window.__demo.resolve(${js(arg)}, true))`)
        .catch(() => null);
      if (!r || typeof r.x !== 'number') {
        console.log(`    ! point ${arg} did not resolve`);
        break;
      }
      const target = {
        x: Math.round(r.x + Math.min(r.w / 2, 160)),
        y: Math.round(r.y + Math.min(r.h / 2, 90)),
      };
      state.pointer = await glide(s, state.pointer || target, target, state.track, state.clock, 2000);
      state.focus?.push({ t: state.clock(), x: r.x, y: r.y, w: r.w, h: r.h });
      state.lastRect = { ...(state.lastRect || {}), [arg]: r };
      await sleep(250);
      break;
    }

    case 'selectSeat': {
      // Accepts `{ seat, settle }` so a scene that waits on a real condition afterwards can
      // skip the blanket settle. The 3s default stays for every caller that does not.
      const seat = typeof arg === 'object' && arg ? arg.seat : arg;
      const settle = typeof arg === 'object' && arg && arg.settle != null ? arg.settle : 3000;
      state.seat = seat;
      await s.eval(`(() => {
        const sel = document.querySelector('select.viewas');
        if (!sel) return false;
        const opt = [...sel.options].find((o) => o.value === ${js(seat)})
          || [...sel.options].find((o) => o.value.toLowerCase().includes(${js(seat)}));
        if (!opt) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter.call(sel, opt.value);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      await sleep(settle);
      break;
    }

    case 'closeOverlay':
      await gotoApp(s, '#/overview', state);
      break;

    case 'gotoConfidential': {
      if (!state.lastDealUrl) throw new Error('no confidential deal URL was captured earlier');
      await gotoApp(s, state.lastDealUrl, state, { waitForApp: false });
      break;
    }

    // The demo banner is worth reading once and then it is furniture. Act 7 keeps it,
    // because there the point is that the seat changed.
    case 'dismissBanner':
      await s.eval(`(() => {
        const bar = [...document.querySelectorAll('div,section')]
          .filter((e) => (e.innerText || '').startsWith('Now viewing as'))
          .sort((a, b) => a.innerText.length - b.innerText.length)[0];
        const x = bar && [...bar.querySelectorAll('button')].find((b) => b.innerText.trim() === '\u00d7');
        if (x) x.click();
        return true;
      })()`);
      await sleep(500);
      break;

    default:
      throw new Error(`unknown step: ${verb}`);
  }
}

async function main() {
  const only = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
  const list = only.length ? only.map((i) => SCENES[i]).filter(Boolean) : SCENES;

  // A partial run is for fixing one broken scene, so it must not throw away the rest.
  let previous = [];
  if (only.length) {
    previous = await readFile(path.join(OUT, MANIFEST), 'utf8')
      .then((t) => JSON.parse(t).scenes).catch(() => []);
  } else if (MANIFEST === 'scenes.json') {
    // Clear the screenshots, but never build/audio — that costs a Speech call per scene
    // and does not change when a selector does.
    await rm(SHOTS, { recursive: true, force: true }).catch(() => {});
  }
  await mkdir(SHOTS, { recursive: true });
  if (VIDEO) await mkdir(CLIPS, { recursive: true });

  // External captures need a real, human sign-in — headless can never complete that, and
  // there is no demo-mode token to fall back on. A fresh profile every run would also mean
  // signing in again every run, so this one persists (git-ignored, never the app's own data).
  if (EXTERNAL && !process.env.DEMO_HEADED) {
    throw new Error("external captures require DEMO_HEADED=1 — headless can't complete a real sign-in. Re-run with DEMO_HEADED=1 set.");
  }
  const profileDir = HOSTED
    ? arg('--profile', path.join(HERE, '.teams-profile'))
    : EXTERNAL
      ? (TARGET.profileDir || path.join(HERE, '.external-profile', (TARGET.baseUrl || SCENES_MODULE).replace(/[^a-z0-9]+/gi, '-')))
      : null;

  const s = await launch({
    width: WIDTH, height: HEIGHT, scale: SCALE,
    headless: HOSTED ? false : !process.env.DEMO_HEADED,
    userDataDir: profileDir,
    // The Teams window is the frame the video will have, so it decides the size, not us.
    overrideMetrics: !HOSTED,
  });
  // Must be armed before Teams builds the tab, or its frame is never offered.
  if (HOSTED) await s.watchFrames();

  if (!EXTERNAL && !HOSTED) {
    // The tab refuses anonymous callers, so prove an identity before driving it. Without a
    // token the seat headers are ignored and every scene captures the signed-out state.
    const token = await tabToken();
    if (token) {
      await s.setHeaders({ Authorization: `Bearer ${token}` });
      console.log('  authenticated as the demo automation service principal');
    } else {
      console.log('  WARNING: no token — continuing unauthenticated, which needs DEMO_OPEN_SIGN_IN');
    }
  }

  const state = { seat: 'partner', lastDealUrl: null, lastClick: null };
  // Carried between scenes so the pointer continues rather than jumping to a new start.
  let pointer = { x: Math.round(WIDTH * 0.5), y: Math.round(HEIGHT * 0.72) };
  const manifest = [];

  try {
    if (HOSTED) {
      // Teams routes on the client, so the open channel is not in the URL and cannot be
      // deep-linked from here. The session is real and the sign-in is the user's own, so
      // they put the app on screen once and the capture takes it from there.
      await s.navigate(TEAMS_URL);
      // Sized BEFORE the tab is opened so the app lays out at the size it will be filmed at.
      // The video is 16:9; a window of any other shape would be cropped into it, and the crop
      // is anchored at the top, so it is the app pane that would lose its bottom.
      const fitted = await s.setViewportSize(WIDTH, HEIGHT);
      console.log(`  window fitted to ${fitted.w}x${fitted.h} (asked ${WIDTH}x${HEIGHT})`);

      // Open it ourselves if Teams' chrome allows; ask only when it does not.
      const navigated = await openHostedTab(s, TEAMS_CHANNEL, TEAMS_TAB);
      let appSession = navigated ? await findAppSession(s, 90000) : null;
      if (appSession) {
        console.log(`  opened ${TEAMS_CHANNEL} / ${TEAMS_TAB}`);
      } else {
        if (navigated) console.log(`  ${TEAMS_TAB} did not render after navigating — falling back`);
        await waitForEnter(`Open the ${TEAMS_CHANNEL} channel and its ${TEAMS_TAB} tab, let it render — then press Enter here.`);
        appSession = await findAppSession(s, 30000);
      }
      if (!appSession) {
        throw new Error('the Deal Room tab was not found in any hosted frame — is it open and rendered?');
      }

      const vp = await s.viewport();
      WIDTH = vp.w;
      HEIGHT = vp.h;
      pointer = { x: Math.round(WIDTH * 0.5), y: Math.round(HEIGHT * 0.72) };

      // From here every DOM expression addresses the app; input and the camera stay on the
      // Teams page, which is what makes the channel visible in the recording.
      s.useFrame(appSession);

      // Teams' own prompts are dismissed BEFORE anything is measured: a banner across the
      // top pushes the app frame down, and closing it afterwards moves the app while the
      // offset stays where the banner put it — every pointer and highlight then sits low by
      // the height of a bar nobody can see in the finished video.
      const dismissed = await dismissHostChrome(s);
      if (dismissed.length) console.log(`  dismissed Teams prompt: ${dismissed.join(', ')}`);
      await sleep(SETTLE_MS);

      // The tab is long-lived and keeps whatever seat the previous run left it on, while the
      // capture assumes it starts as the opening scene's. Assumed wrong, the whole first act
      // is recorded under the wrong identity and still reports `ok`. So it is set, not assumed.
      await inject(s);
      await runStep(s, { selectSeat: state.seat }, state);
      await settle(s);

      const host = await measureHost(s);
      if (!host) throw new Error('could not locate the hosting iframe in the Teams document');
      OFFSET = { x: host.x, y: host.y };
      console.log(`  Teams window ${WIDTH}x${HEIGHT}; app pane ${host.w}x${host.h} at ${host.x},${host.y}`);
    } else if (EXTERNAL) {
      // First run in a fresh profile: the human signs in themselves (see
      // external-resource-access.md — this is the interactive-credential path, never
      // scripted). A later run against the same profileDir usually finds the session
      // still valid and this becomes a formality — still worth the pause, since a silently
      // expired session would otherwise capture a sign-in page as if it were the product.
      if (TARGET.baseUrl) await s.navigate(TARGET.baseUrl);
      if (TARGET.skipSignInPause !== true) {
        await waitForEnter(`Sign in to ${TARGET.baseUrl || 'the target'} in the browser window that just opened.`);
      }
    } else {
      // Prime the session once so the first scene is not paying for a cold start.
      await s.navigate(`${BASE}/?dr_as=partner#/overview`);
      await inject(s);
      await s.waitFor(`document.body.innerText.includes('Daily briefing')`, { timeout: 120000, label: 'first load' });
    }

    for (const [i, scene] of list.entries()) {
      const label = `${String(i + 1).padStart(2, '0')}/${list.length} ${scene.id}`;
      const frames = [];
      const track = [];
      // Where the pointer actually engaged something, so a highlight can mark the
      // interaction rather than the sentence being spoken over it.
      const focus = [];
      let started = 0;
      let offFrame = null;
      // Time spent with the camera off, so frame arrivals and pointer samples share one
      // clock that skips it. Without this the track would drift by the length of the wait.
      let skipped = 0;
      const clock = () => (started ? (Date.now() - started - skipped) / 1000 : 0);
      let cutAt = 0;
      const camera = !VIDEO ? null : {
        async off() {
          cutAt = Date.now();
          await s.send('Page.stopScreencast').catch(() => {});
        },
        async on() {
          await s.send('Page.startScreencast', screencast()).catch(() => {});
          skipped += Date.now() - cutAt;
        },
      };
      try {
        // Normally the seat is changed before the camera rolls, because it is setup. Scenes
        // whose whole point is the change opt out and do it in `steps`, on camera.
        if (!EXTERNAL && scene.seat && scene.seat !== state.seat && !scene.seatOnCamera) {
          await runStep(s, { selectSeat: scene.seat }, state);
        }
        if (VIDEO) {
          started = Date.now();
          offFrame = s.on('Page.screencastFrame', async (p) => {
            frames.push({ at: clock(), data: p.data });
            try { await s.send('Page.screencastFrameAck', { sessionId: p.sessionId }); } catch { /* closing */ }
          });
          // The page is laid out on a SCALE-times-larger surface, so asking for frames at the
          // CSS size makes Chrome downsample for us — the JPEG is supersampled rather than
          // native, which is what keeps small UI text legible after the build re-encodes it.
          await s.send('Page.startScreencast', screencast());
          await sleep(SETTLE_MS);
        }
        // The camera is rolling from here. A scene whose whole point is a change — a seat being
        // switched, a list narrowing in response — has to begin BEFORE its steps run, or the
        // clip opens on the aftermath and the narration describes something already done.
        const armedClock = clock();
        await inject(s);
        // Steps can record a gesture of their own (see the `point` verb), which needs the
        // scene's track and clock. Only meaningful once the camera is rolling.
        state.track = track;
        state.focus = focus;
        state.clock = clock;
        state.pointer = pointer;
        for (const step of scene.steps || []) await runStep(s, step, state);
        pointer = state.pointer || pointer;
        if (!EXTERNAL && !scene.keepBanner) await runStep(s, { dismissBanner: true }, state);
        await inject(s);
        await settle(s);

        // With the scene's state reached, act on what it is actually about: travel to the
        // region the narration describes and click it, so the clip holds a real interaction
        // rather than a screenshot of the aftermath.
        let clip = null;
        // Anything `perform` does can navigate, so remember where the scene started and
        // put the app back afterwards. Scenes inherit each other's state — 03 only scrolls,
        // 17 only clicks — so a scene left on the wrong screen breaks every one after it.
        const startedAt = VIDEO ? await s.eval('location.hash').catch(() => null) : null;
        // Re-read where the app sits before this scene moves a pointer: a scene's own steps
        // can change the Teams layout, and a stale offset misplaces everything that follows.
        if (HOSTED) {
          const h = await measureHost(s);
          if (h && (h.x !== OFFSET.x || h.y !== OFFSET.y)) {
            console.log(`  app pane moved to ${h.x},${h.y}`);
            OFFSET = { x: h.x, y: h.y };
          }
        }
        // Where the finished clip begins. Everything before this is setup, and its length
        // varies with how slow the screen was that run — it must not reach the video. Scenes
        // that opt in keep their steps, because for them the steps ARE the content.
        const originClock = scene.seatOnCamera ? armedClock : clock();
        if (VIDEO) {
          // Steps run while the camera is rolling. This is the difference between recording
          // someone using the product and recording screens being pointed at: the question
          // is typed, sent, and the answer arrives on screen in its own time.
          pointer = await perform(s, scene.perform || [], pointer, track, clock, state, camera, focus);
          // A navigation throws away the injected helpers along with the old document.
          if (scene.perform?.length) {
            await inject(s);
            await settle(s);
          }
        }

        // Measured after `perform`, not before: a scene that opens something spends most of
        // its length on what it opened, and a rect read beforehand would frame the screen
        // the viewer has already left.
        const specs = Array.isArray(scene.spotlight) ? scene.spotlight
          : scene.spotlight ? [scene.spotlight] : [];
        // Cue timings are POSITIONAL — cue i belongs to spotlight i — so a selector that no
        // longer matches holds its place as null. Dropping it would slide every later cue
        // onto the wrong region, which looks like working choreography aimed at nothing.
        const spotlights = [];
        for (const [i, spec] of specs.entries()) {
          const r = await s.eval(`window.__demo.rect(window.__demo.resolve(${js(spec)}, true))`)
            .catch(() => null);
          if (!r || typeof r.x !== 'number') {
            console.log(`    ! ${scene.id}: spotlight ${i} (${spec}) did not resolve`);
            spotlights.push(null);
            continue;
          }
          spotlights.push(r);
        }
        const spotlight = spotlights.find((r) => r) || null;
        const click = scene.click
          ? await s.eval(`window.__demo.rect(window.__demo.resolve(${js(scene.click)}, false))`)
          : null;

        if (VIDEO) {
          const sceneMs = (DURATIONS[scene.id] || 8) * 1000;

          // Then work the screen for whatever the scene has left. Hover only — no press is
          // dispatched: `steps` and `perform` do the real clicking, whereas a click here
          // lands on whatever the highlight happens to frame.
          //
          // Hosted, the app lays out in a smaller pane, so the plan's rects — measured against
          // the standalone app — would frame the wrong things. The scene's own selectors are
          // resolved live instead. The cue TIMINGS still apply: they come from the narration,
          // not the layout, and each scene's selectors line up 1:1 with its cues.
          const rects = (HOSTED ? null : AIMS[scene.id])
            || (spotlights.length ? spotlights : spotlight ? [spotlight] : []);
          // Spent against the RECORDING clock, not the wall: a cut wait costs real seconds
          // that never reach the clip, and charging the scene for them ends the choreography
          // early and leaves the clip shorter than the narration it has to carry.
          const spentMs = (clock() - originClock) * 1000;
          const targetMs = Math.max(3000, sceneMs - spentMs);
          // Time spent before the choreography starts comes out of the scene, so a slow
          // `perform` or a costly spotlight lookup shows up as a clip that overruns its
          // narration and gets played fast to fit. Reported so it is attributable.
          if (spentMs > 2000) console.log(`    ${scene.id}: ${(spentMs / 1000).toFixed(1)}s spent before choreography`);
          const choreoStart = clock();
          pointer = await choreograph(s, rects, pointer, targetMs, track, clock, focus, CUES[scene.id], POINTS[scene.id], originClock);
          const choreoMs = (clock() - choreoStart) * 1000;

          await sleep(SETTLE_MS);
          const endAt = clock();
          // The clip is exactly this long, so when it does not match the narration the three
          // parts have to be shown separately — otherwise the only visible symptom is a scene
          // the build plays fast, with nothing to say which part overran.
          if (Math.abs((endAt - originClock) - sceneMs / 1000) > 2) {
            console.log(`    ${scene.id}: clip ${(endAt - originClock).toFixed(1)}s vs planned ${(sceneMs / 1000).toFixed(1)}s`
              + ` — setup ${(spentMs / 1000).toFixed(1)}s, choreography ${(choreoMs / 1000).toFixed(1)}s of ${(targetMs / 1000).toFixed(1)}s`);
          }
          await s.send('Page.stopScreencast');
          offFrame?.();
          offFrame = null;

          const endedAt = await s.eval('location.hash').catch(() => null);
          if (startedAt !== null && endedAt !== startedAt) {
            await runStep(s, { goto: startedAt }, state);
            await settle(s);
          }

          if (frames.length) {
            const enc = await encodeClip(scene.id, frames, endAt, originClock);
            // Clip time equals wall time, so this is just the offset to the clip's start.
            const toClip = (t) => Number(Math.min(Math.max(0, t - enc.base), enc.seconds).toFixed(3));
            // Both are recorded in the app's own coordinates, but the picture is the whole
            // page — so they are moved into it, the same way the mouse events already are.
            const rebased = track.map((p) => ({
              ...p, t: toClip(p.t), x: p.x + OFFSET.x, y: p.y + OFFSET.y,
            }));
            const focused = focus.map((f) => ({
              ...f, t: toClip(f.t), x: f.x + OFFSET.x, y: f.y + OFFSET.y,
            }));
            await writeFile(path.join(CLIPS, `${scene.id}.pointer.json`),
              JSON.stringify({ width: WIDTH, height: HEIGHT, track: rebased, focus: focused }, null, 2), 'utf8');
            clip = `clips/${scene.id}.mp4`;
          }
        }

        const file = `${scene.id}.png`;
        // A screenshot timeout must not throw away a clip that already encoded cleanly.
        const shot = await s.screenshot({ path: path.join(SHOTS, file) }).then(() => true).catch(() => false);

        // Rects are read from the app's document; the screenshot is of the whole page. The
        // choreography above deliberately used the app-space originals, so this is applied
        // only on the way out.
        const toPage = (r) => (r && typeof r.x === 'number'
          ? { ...r, x: r.x + OFFSET.x, y: r.y + OFFSET.y } : r);

        manifest.push({
          id: scene.id, act: scene.act, title: scene.title, seat: scene.seat,
          say: scene.say.replace(/\s+/g, ' ').trim(),
          image: `shots/${file}`, spotlight: toPage(spotlight),
          ...(spotlights.length > 1 ? { spotlights: spotlights.map(toPage) } : {}),
          ...(scene.cues ? { cues: scene.cues } : {}),
          ...(clip ? { video: clip, pointer: `clips/${scene.id}.pointer.json` } : {}),
          click: toPage(click),
        });
        console.log(`  ok  ${label}${clip ? `  (${frames.length} frames)` : ''}${shot ? '' : '  [no screenshot]'}`);
      } catch (e) {
        offFrame?.();
        console.log(`  FAIL ${label} — ${e.message}`);
        manifest.push({
          id: scene.id, act: scene.act, title: scene.title, seat: scene.seat,
          say: scene.say.replace(/\s+/g, ' ').trim(),
          image: null, error: e.message,
        });
      }
    }
  } finally {
    await s.close();
  }

  await writeFile(
    path.join(OUT, MANIFEST),
    JSON.stringify({
      capturedAt: new Date().toISOString(),
      base: EXTERNAL ? TARGET.baseUrl : BASE,
      viewport: { width: WIDTH, height: HEIGHT, scale: SCALE },
      acts: ACTS,
      // Keep the canonical scene order however few of them this run touched.
      scenes: SCENES.map((sc) => manifest.find((m) => m.id === sc.id)
        || previous.find((m) => m.id === sc.id))
        .filter(Boolean),
    }, null, 2),
    'utf8',
  );

  const bad = manifest.filter((m) => !m.image);
  console.log(`\ncaptured ${manifest.length - bad.length}/${manifest.length} scenes`);
  if (bad.length) {
    console.log('failed: ' + bad.map((b) => b.id).join(', '));
    process.exitCode = 1;
  }
}

main();

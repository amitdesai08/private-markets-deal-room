// Renders the walkthrough to an MP4, for the one kind of embedding GitHub permits.
//
//   node demo/build-video.mjs              the whole walkthrough
//   node demo/build-video.mjs --teaser     a short cut for the README
//
// GitHub's markdown sanitiser strips <audio>, <iframe>, <embed> and every <script>, so the
// interactive player can never run inside a README. It does keep <video src controls>, and
// raw.githubusercontent serves .mp4 as video/mp4 — so a narrated video committed to the
// repo plays inline on the front page. That is the whole reason this file exists.
//
// ffmpeg is not installed on the build machine and the npm registry is unreachable, so
// point DEMO_FFMPEG at a portable build if it is not on PATH:
//   winget install Gyan.FFmpeg
//   or unzip https://github.com/BtbN/FFmpeg-Builds/releases/latest and set DEMO_FFMPEG.

import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOLD_AFTER_NARRATION, LEAD_IN_SILENCE } from './lib/timing.mjs';
import { findPhrase } from './lib/cues.mjs';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'build');
const SEGS = path.join(OUT, 'segments');

const TEASER = process.argv.includes('--teaser');
// The scenes that carry the story on their own: the briefing, the panel people remember,
// a deal opened, and the access moment the demo exists for.
const TEASER_SCENES = ['00-open', '03-home-briefing', '07-home-followups', '13-deal-brief',
  '23-seat-analyst', '24-seat-analyst-onyx', '26-seat-admin-refused'];

const WIDTH = Number(process.env.DEMO_VIDEO_WIDTH || 1920);
const HEIGHT = Number(process.env.DEMO_VIDEO_HEIGHT || 1080);
// 26 was tuned for near-static screenshots. Recorded interaction is real motion, and at 26
// it smears — the reference we are matching carries roughly nine times the bitrate.
const CRF = Number(process.env.DEMO_VIDEO_CRF || 20);
// 30fps because the pointer moves: at the old 10fps a half-second glide was five frames and
// stuttered. The picture is otherwise static, so the extra frames cost very little.
const FPS = Number(process.env.DEMO_VIDEO_FPS || 30);
// How much a recording may be sped up to fit its scene. Past about this, typing stops
// reading as typing.
const MAX_RATE = Number(process.env.DEMO_VIDEO_MAX_RATE || 2.5);
// Draws nothing over the product: no highlight box, no title card. The reference we are
// matching has neither — a real screen recording cannot — and they are the strongest signal
// that a video was assembled rather than recorded.
const PLAIN = /^(1|true|yes|on)$/i.test(String(process.env.DEMO_VIDEO_PLAIN || ''));

// The title card flies in from off the left edge and settles as a lower-third, held long
// enough to read, then leaves the way it came. It is a single pre-rendered PNG (see
// build-title-cards.mjs) composited with `overlay`, whose x/y expressions genuinely track
// the timestamp — the earlier drawbox/drawtext title could not move at all, because `t` in a
// drawbox position is that filter's `thickness` option.
//
// Eased rather than linear: cubic ease-out on the way in, so it decelerates into place, and
// ease-in on the way out. A linear slide is what reads as cheap.
const TITLE_IN = 0.55;
const TITLE_HOLD = 2.9;
const TITLE_OUT = 0.45;

function titleCardOverlay(card) {
  const outStart = (TITLE_IN + TITLE_HOLD).toFixed(2);
  const gone = (TITLE_IN + TITLE_HOLD + TITLE_OUT).toFixed(2);
  const bleed = card.bleed || 0;
  const startX = -(card.w + 20);
  // Lower-third, anchored near the left edge: the conventional place for a chapter label,
  // and out of the way of the screen it is labelling. The PNG carries a transparent shadow
  // margin, so the visible card edge is `bleed` inside it.
  const restX = 64 - bleed;
  const y = Math.round(HEIGHT - 84 - (card.h - bleed));

  const easeIn = `(1-pow(1-clip(t/${TITLE_IN},0,1),3))`;
  const easeOut = `pow(clip((t-${outStart})/${TITLE_OUT},0,1),3)`;
  const x = `${startX}+${restX - startX}*${easeIn}+${startX - restX}*${easeOut}`;

  return { x, y, enable: `between(t,0,${gone})` };
}

// A pointer that travels to each region and arrives exactly as that region's highlight
// appears, so the frame reads as somebody working the interface rather than as a diagram
// with boxes drawn on it.
//
// This has to be an `overlay`, not a `drawbox`. Verified by rendering and reading pixels
// back: an overlay's x/y expressions genuinely track the timestamp (a marker moved from
// x=18 to x=298 between 0.1s and 2.9s, and honours `t`-minus-a-constant and `enable=` at the
// same time), whereas `t` inside a drawbox position is that filter's `thickness` option and
// cannot animate at all.
const CURSOR = path.join(OUT, 'cursor.png');
const CLICK_RING = path.join(OUT, 'click-ring.png');
const CURSOR_W = 20, CURSOR_H = 32;
const TRAVEL = 0.55;
// The press: the pointer dips a couple of pixels as it lands, the way a hand does.
const PRESS = 3;
const PRESS_HOLD = 0.12;

// Where in a region a person would actually click: the middle of a small control, but only
// a little way into a large panel — dead-centre of a full-height column looks aimless.
function cursorTarget(rect) {
  return {
    x: Math.round(rect.x + Math.min(rect.w * 0.5, 160)),
    y: Math.round(rect.y + Math.min(rect.h * 0.5, 90)),
  };
}

// One monotone sum-of-ramps per axis: the pointer rests, then eases to the next target and
// dips as it arrives. Ramps are added rather than branched because a nested if() is
// mis-evaluated here, and a sum of clip() ramps telescopes exactly to the final position.
function cursorPath(spots, from) {
  const stops = spots.map((s) => ({ at: Math.max(TRAVEL, s.start), to: cursorTarget(s.rect) }));
  if (!stops.length) return null;

  let ex = String(from.x);
  let ey = String(from.y);
  let prev = from;
  const clicks = [];
  for (const stop of stops) {
    const ramp = `clip((t-${(stop.at - TRAVEL).toFixed(2)})/${TRAVEL},0,1)`;
    ex += `+(${stop.to.x - prev.x})*${ramp}`;
    ey += `+(${stop.to.y - prev.y})*${ramp}`;
    // Down on arrival, back up a moment later — two ramps, so it stays a plain sum.
    const down = `clip((t-${stop.at.toFixed(2)})/0.06,0,1)`;
    const up = `clip((t-${(stop.at + PRESS_HOLD).toFixed(2)})/0.10,0,1)`;
    ex += `+${PRESS}*${down}-${PRESS}*${up}`;
    ey += `+${PRESS}*${down}-${PRESS}*${up}`;
    clicks.push({ at: stop.at, ...stop.to });
    prev = stop.to;
  }
  // The drawn tip sits ~2px in from the image's top-left corner.
  return { x: `(${ex})-2`, y: `(${ey})-2`, end: prev, clicks };
}

// A recorded scene brings its own pointer path: the coordinates the app actually received
// mouse events on, sampled through the whole scene. Used in preference to a synthetic path
// whenever a recording exists, because the app's own hover states are already on screen
// where the recorded pointer went — a drawn pointer somewhere else would contradict them.
//
// The samples arrive already on the clip's own clock. They used to need anchoring by their
// END to the clip's end, because the encoder capped held frames and compressed the idle
// stretches; that cap is gone, so clip time is wall time and shifting the track now would
// push every sample late — on a scene whose pointer settles early, late by the whole tail.
//
// They are still far too many: a ramp per sample built a filter expression so large ffmpeg
// refused it, so they are thinned to the ones that actually change direction or dwell, and
// thinned again, harder, until few enough remain. The ceiling is not arbitrary: ffmpeg's
// expression parser recurses once per summed term and gives up at about a hundred, reporting
// only "Failed to configure input pad", so the path is capped well below that.
const MAX_POINTS = 85;

function pointerFromTrack(track) {
  const raw = (track || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (raw.length < 2) return null;

  const thin = (move, gap) => {
    const out = [];
    for (const p of raw) {
      const at = p.t;
      if (at < 0) continue;
      const last = out[out.length - 1];
      const far = !last || Math.abs(p.x - last.x) + Math.abs(p.y - last.y) > move;
      const slow = !last || at - last.t > gap;
      if (far || slow || p.click) out.push({ ...p, t: at });
    }
    return out;
  };

  let pts = thin(24, 0.30);
  for (let move = 40, gap = 0.45; pts.length > MAX_POINTS && move < 400; move *= 1.5, gap *= 1.4) {
    pts = thin(move, gap);
  }
  if (pts.length < 2) return null;

  let ex = String(pts[0].x);
  let ey = String(pts[0].y);
  const clicks = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dur = Math.max(0.05, b.t - a.t);
    const ramp = `clip((t-${a.t.toFixed(2)})/${dur.toFixed(2)},0,1)`;
    if (b.x !== a.x) ex += `+(${b.x - a.x})*${ramp}`;
    if (b.y !== a.y) ey += `+(${b.y - a.y})*${ramp}`;
  }
  for (const p of pts) {
    if (p.click) clicks.push({ at: Math.max(0.05, p.t), x: p.x, y: p.y });
  }
  // The drawn tip sits ~2px in from the image's top-left corner.
  return { x: `(${ex})-2`, y: `(${ey})-2`, clicks, end: pts[pts.length - 1] };
}

// A ring that expands and fades from the click point. `scale` with eval=frame reads the
// timestamp, and `fade`'s alpha works on the overlay's own stream, so the ripple both grows
// and dissolves — verified by measuring a test render at 0.1s/0.5s/0.95s (31px bright ->
// 77px bright -> 124px faded).
const RIPPLE_FROM = 26;
const RIPPLE_TO = 96;
const RIPPLE_DUR = 0.5;

function clickRipple(click, input, tail, label) {
  const at = click.at.toFixed(2);
  const size = `${RIPPLE_FROM}+${RIPPLE_TO - RIPPLE_FROM}*clip((t-${at})/${RIPPLE_DUR},0,1)`;
  return [
    `[${input}:v]scale=w='${size}':h='${size}':eval=frame,`
      + `fade=t=in:st=${at}:d=0.05:alpha=1,`
      + `fade=t=out:st=${(click.at + 0.16).toFixed(2)}:d=0.34:alpha=1[${label}]`,
    `[${tail}][${label}]overlay=x='${click.x}-overlay_w/2':y='${click.y}-overlay_h/2':eval=frame[${label}o]`,
  ];
}

// Guides the eye to whatever the narration is describing on a dense screen, instead of
// leaving a viewer to hunt for it. Each entry is a rect plus the window it should be up
// for, already timed to the phrase that describes it (see SPOTLIGHT_CUES), so a scene can
// emphasise several things in turn rather than framing one region for its whole length.
//
// There is deliberately no travelling cursor. One was tried and could never have worked: a
// drawbox position cannot read the timestamp (its `t` is `thickness`), so the dot's whole
// path collapsed to a constant and it simply rested off-frame for every scene.
//
// Rects are clamped into the frame — several captured regions describe a panel that
// continues below the fold, and drawing those unclamped put a border edge off-screen.
function spotlightOverlay(spots) {
  if (!spots || !spots.length) return '';
  const INSET = 3;
  const parts = [];

  spots.forEach((spot) => {
    const x0 = Math.max(INSET, Math.round(spot.rect.x));
    const y0 = Math.max(INSET, Math.round(spot.rect.y));
    const x1 = Math.min(WIDTH - INSET, Math.round(spot.rect.x + spot.rect.w));
    const y1 = Math.min(HEIGHT - INSET, Math.round(spot.rect.y + spot.rect.h));
    const bw = x1 - x0;
    const bh = y1 - y0;
    // Wide-and-short is a real target, not a degenerate one: the seat control is 210x30, and
    // a 40px floor here dropped its box after `focusSpots` had already allowed it through.
    if (bw < 40 || bh < 16) return;

    parts.push(`drawbox=x=${x0}:y=${y0}:w=${bw}:h=${bh}:color=0xFFC83D@1:t=4:`
      + `enable='between(t,${spot.start.toFixed(2)},${spot.end.toFixed(2)})'`);
  });

  return parts.length ? `,${parts.join(',')}` : '';
}

// The window a highlight stays up for after the pointer engages something.
const FOCUS_DWELL = 2.6;

// Interaction-driven highlights: each entry is where the pointer actually engaged an
// element and when. Repeat visits to the same element extend the window it is already
// showing for rather than starting a new one, so the box does not blink on and off the
// thing the viewer is being shown.
function focusSpots(focus, rate, sceneSeconds) {
  const marks = (focus || []).filter(Boolean).map((f) => ({ ...f, at: f.t / (rate || 1) }));
  const real = (m) => !m.clear && m.w >= 40 && m.h >= 16;
  const out = [];
  for (const f of marks) {
    // Guards against a degenerate rect from a selector that half-resolved, not against small
    // ones: a dropdown or a badge is legitimately about 30px tall, and a 40px floor silently
    // dropped the highlight on the seat control at the moment it was being used.
    if (!real(f)) continue;
    const start = f.at;
    if (start > sceneSeconds - 0.4) continue;
    const last = out[out.length - 1];
    const same = last && Math.abs(last.rect.x - f.x) < 24 && Math.abs(last.rect.y - f.y) < 24
      && Math.abs(last.rect.w - f.w) < 24;
    if (same && start <= last.end + 1.2) { last.end = Math.min(sceneSeconds, start + FOCUS_DWELL); continue; }
    out.push({ rect: { x: f.x, y: f.y, w: f.w, h: f.h }, start, end: Math.min(sceneSeconds, start + FOCUS_DWELL) });
  }
  // A highlight moves; it does not multiply, and it does not outlive the thing it marks. Each
  // ends at the next one — or at an explicit clear, which is how a scene says "this is no
  // longer what is on screen" before the replacement can be measured.
  for (const s of out) {
    const next = marks.find((m) => m.at > s.start + 0.05 && (m.clear || real(m)));
    if (next) s.end = Math.min(s.end, next.at);
  }
  return out.filter((s) => s.end > s.start + 0.2);
}

// Turns a scene's captured rects and its cue phrases into the on-screen windows above.
// A region with no phrase (or a phrase the narration no longer contains) shows early
// rather than not at all, so a script edit can never silently drop a highlight.
function planSpotlights(scene, words, sceneSeconds) {  const rects = (scene.spotlights && scene.spotlights.length ? scene.spotlights
    : scene.spotlight ? [scene.spotlight] : []).filter(Boolean);
  if (!rects.length) return [];
  const cues = scene.cues || [];
  // Anything after the last word is the held pause before the cut, not explanation.
  const narrationEnd = sceneSeconds - HOLD_AFTER_NARRATION;

  const planned = rects.map((rect, i) => {
    const hit = cues[i] ? findPhrase(words, cues[i]) : null;
    if (cues[i] && !hit) {
      console.log(`  ! ${scene.id}: cue "${cues[i]}" is no longer spoken in this scene — `
        + 'its highlight falls back to appearing early. Re-anchor the cue in the scene file.');
    }
    const spoken = hit ? LEAD_IN_SILENCE + hit.start : LEAD_IN_SILENCE + 0.2 + i * 4;
    return { rect, start: Math.max(0.3, spoken - 0.35), end: narrationEnd + 0.3 };
  });

  // A region stays lit for as long as the narration is still on it: until the next region
  // is introduced, or to the end of the spoken line for the last one.
  planned.forEach((p, i) => {
    const next = planned[i + 1];
    p.end = Math.min(p.end, sceneSeconds - 0.2, next ? next.start - 0.25 : Infinity);
  });
  return planned.filter((p) => p.end > p.start + 0.4);
}

async function tool(name) {
  const fromEnv = process.env[`DEMO_${name.toUpperCase()}`];
  if (fromEnv) return fromEnv;
  const candidates = [
    name,
    path.join(process.env.TEMP || '/tmp', 'ffmpeg', 'ffmpeg-master-latest-win64-gpl', 'bin', `${name}.exe`),
  ];
  for (const c of candidates) {
    try { await run(c, ['-version'], { shell: true }); return c; } catch { /* next */ }
  }
  throw new Error(`${name} not found. Install it (winget install Gyan.FFmpeg) or set DEMO_${name.toUpperCase()}.`);
}

async function seconds(ffprobe, file) {
  const { stdout } = await run(ffprobe, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', `"${file}"`,
  ], { shell: true });
  const d = parseFloat(stdout.trim());
  if (!Number.isFinite(d)) throw new Error(`could not read a duration from ${file}`);
  return d;
}

async function main() {
  const ffmpeg = await tool('ffmpeg');
  const ffprobe = await tool('ffprobe');

  const arg = (flag, fallback) => {
    const i = process.argv.indexOf(flag);
    return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
      ? process.argv[i + 1] : fallback;
  };
  const manifestName = arg('--manifest', 'scenes.json');
  const outName = arg('--out', TEASER ? 'walkthrough-teaser.mp4' : 'walkthrough.mp4');

  const manifest = JSON.parse(await readFile(path.join(OUT, manifestName), 'utf8'));
  const scenes = manifest.scenes.filter((s) => s.image && s.audio
    && (!TEASER || TEASER_SCENES.includes(s.id)));
  if (!scenes.length) throw new Error('nothing to render — run capture.mjs and narrate.mjs first');

  // Missing simply means no animated titles this run; build-title-cards.mjs writes it.
  const titleIndex = await readFile(path.join(OUT, 'titles', 'index.json'), 'utf8')
    .then(JSON.parse).catch(() => ({}));
  const missing = scenes.filter((s) => !s.card && s.title && !titleIndex[s.id]);
  if (missing.length) {
    console.log(`  ! no title card for ${missing.length} scene(s) — run build-title-cards.mjs`);
  }

  // Spotlight rects and pointer tracks are viewport coordinates, drawn straight onto the
  // frame. If a clip was recorded in a different viewport than the rects were measured in,
  // every overlay lands somewhere else and the picture is stretched to fit — which is
  // exactly what happened when clips came back 1440x900 against 1920x1080 rects, and
  // nothing said so. Re-capture at the manifest's viewport rather than ship that again.
  const view = manifest.viewport || {};
  for (const s of scenes) {
    if (!s.pointer) continue;
    const p = JSON.parse(await readFile(path.join(OUT, s.pointer), 'utf8'));
    if (view.width && p.width && p.width !== view.width) {
      throw new Error(`${s.id}: recorded at ${p.width}x${p.height} but the manifest's rects `
        + `are ${view.width}x${view.height} — re-run capture with `
        + `--aim (it takes the viewport from the plan)`);
    }
  }

  await rm(SEGS, { recursive: true, force: true }).catch(() => {});
  await mkdir(SEGS, { recursive: true });

  let total = 0;
  const list = [];
  // Starts low and centre, roughly where a hand would leave it, then carries between scenes.
  let cursorAt = { x: Math.round(WIDTH * 0.5), y: Math.round(HEIGHT * 0.72) };

  for (const [n, scene] of scenes.entries()) {
    const seg = path.join(SEGS, `${String(n).padStart(2, '0')}-${scene.id}.mp4`);
    const dur = await seconds(ffprobe, path.join(OUT, scene.audio));
    // A beat of silence before the narration starts and another after it ends, so one
    // section doesn't run straight into the next across the cut.
    const hold = (LEAD_IN_SILENCE + dur + HOLD_AFTER_NARRATION).toFixed(2);
    total += Number(hold);

    const words = scene.words
      ? JSON.parse(await readFile(path.join(OUT, scene.words), 'utf8'))
      : [];

    // A recorded clip of the product being driven, when capture produced one; otherwise the
    // still screenshot. Both end up as a 1920x1080 source the overlays draw on.
    const clip = scene.video ? path.join(OUT, scene.video) : null;
    const pointerFile = scene.pointer
      ? JSON.parse(await readFile(path.join(OUT, scene.pointer), 'utf8'))
      : null;
    const track = pointerFile?.track || null;

    // Brand cards are already native 1920x1080 — scale only. App screenshots are 8:5
    // (1440x900), narrower than the 16:9 frame — scaled to cover the full width and
    // top-anchor cropped to height, so the frame is always a clean, full-bleed view of the
    // product with no white letterbox bars. Top-anchored (not centered) so the crop only
    // ever trims off the bottom of the page, never the header/nav that's always at the top.
    const fit = scene.card
      ? `scale=${WIDTH}:${HEIGHT}:flags=lanczos`
      : `scale=${WIDTH}:-1:flags=lanczos,crop=${WIDTH}:${HEIGHT}:0:0`;

    // Line the recording up with the script: hold its first frame until the narration
    // reaches the point the interaction makes, then let it play, then hold the last frame
    // for the rest of the scene. Without the lead pad the virtual user would click while
    // the narration was still introducing the screen.
    let shift = 0;
    let source = fit;
    let clipSeconds = 0;
    let rate = 1;
    if (clip) {
      // The recording now runs the length of the scene, so it starts where the scene does
      // and the last frame is held for whatever is left over. A scene that asks a question
      // and waits for an answer overruns instead: truncating it would cut away the reply,
      // which is the only part worth showing, so the whole take is played faster to fit.
      const recorded = await seconds(ffprobe, clip);
      rate = Math.min(MAX_RATE, Math.max(1, recorded / Number(hold)));
      if (recorded / rate > Number(hold) + 0.05) {
        console.log(`    ! ${scene.id}: ${recorded.toFixed(1)}s of recording capped at ${MAX_RATE}x`
          + ` — the last ${(recorded / rate - Number(hold)).toFixed(1)}s will not be seen`);
      }
      clipSeconds = recorded / rate;
      const endPad = Math.max(0, Number(hold) - clipSeconds);
      source = `${fit}${rate > 1 ? `,setpts=PTS/${rate.toFixed(4)}` : ''}`
        + `,tpad=start_duration=0:start_mode=clone`
        + `:stop_duration=${endPad.toFixed(2)}:stop_mode=clone,fps=${FPS}`;
    }

    // The pointer carries over from where the previous scene left it, so it behaves like one
    // continuous session rather than teleporting to a new start position every cut.
    const paced = rate > 1 && track
      ? track.map((p) => ({ ...p, t: p.t / rate }))
      : track;

    // Highlights follow the interaction where the capture recorded one. A rect timed to a
    // spoken phrase marks what is being SAID; this marks what is being DONE, which is what
    // the box is for. Scenes with no recorded interaction keep the narration-timed rects.
    const spots = pointerFile?.focus?.length
      ? focusSpots(pointerFile.focus, rate, Number(hold))
      : planSpotlights(scene, words, Number(hold));

    const plan = scene.card ? null
      : (clip && paced ? pointerFromTrack(paced) : cursorPath(spots, cursorAt));
    const card = (scene.card || PLAIN) ? null : titleIndex[scene.id];
    if (plan?.end) cursorAt = plan.end;

    // Inputs are 0 image or clip, 1 audio, then the ripples, cursor and title PNGs.
    const extra = [];
    const chain = [`[0:v]${(scene.card || PLAIN) ? source : `${source}${spotlightOverlay(spots)}`}[bg]`];
    let tail = 'bg';

    // Ripples go under the pointer, so the pointer is never obscured by its own click.
    // Each ring is looped: as a single-frame input its scale/fade would only ever be
    // evaluated at t=0, and the ripple would sit there frozen.
    for (const [i, click] of (plan?.clicks || []).entries()) {
      extra.push(['-loop', '1', '-i', `"${CLICK_RING}"`]);
      const [mk, ov] = clickRipple(click, extra.length + 1, tail, `r${i}`);
      chain.push(mk, ov);
      tail = `r${i}o`;
    }
    if (plan) {
      extra.push(['-i', `"${CURSOR}"`]);
      const i = extra.length + 1;
      chain.push(`[${i}:v]scale=${CURSOR_W}:${CURSOR_H}[cur]`);
      chain.push(`[${tail}][cur]overlay=x='${plan.x}':y='${plan.y}'[wc]`);
      tail = 'wc';
    }
    if (card) {
      extra.push(['-i', `"${path.join(OUT, card.file)}"`]);
      const i = extra.length + 1;
      const t = titleCardOverlay(card);
      chain.push(`[${i}:v]scale=${card.w}:${card.h}[card]`);
      // Drawn after the pointer so the card is never sliced by it while it flies in.
      chain.push(`[${tail}][card]overlay=x='${t.x}':y=${t.y}:enable='${t.enable}'[wt]`);
      tail = 'wt';
    }
    chain.push(`[${tail}]format=yuv420p[v]`);
    const fc = chain.join(';');

    await run(ffmpeg, [
      '-y', '-loglevel', 'error',
      ...(clip
        ? ['-i', `"${clip}"`]
        : ['-loop', '1', '-framerate', String(FPS), '-i', `"${path.join(OUT, scene.image)}"`]),
      '-i', `"${path.join(OUT, scene.audio)}"`,
      ...extra.flat(),
      '-t', hold,
      '-filter_complex', `"${fc}"`,
      '-map', '"[v]"', '-map', '1:a',
      // Hold the picture before the voice starts, so the cut and the next line of narration
      // don't land on the same frame.
      '-af', `"adelay=${Math.round(LEAD_IN_SILENCE * 1000)}:all=1"`,
      '-c:v', 'libx264', '-preset', 'veryslow', '-crf', String(CRF),
      // Long keyframe intervals were cheap when only a drawn pointer moved. Now the product
      // itself is moving, so let the encoder put a keyframe on a cut.
      '-r', String(FPS), '-g', String(FPS * 5), '-keyint_min', String(FPS),
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
      '-movflags', '+faststart',
      `"${seg}"`,
    ], { shell: true, maxBuffer: 1 << 24 });

    list.push(`file '${seg.replace(/\\/g, '/')}'`);
    process.stdout.write(`  ${scene.id.padEnd(24)} ${hold.padStart(6)}s\n`);
  }

  const listFile = path.join(SEGS, 'list.txt');
  await writeFile(listFile, list.join('\n'), 'utf8');

  const outFile = path.join(OUT, outName);
  await run(ffmpeg, [
    '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
    '-i', `"${listFile}"`, '-c', 'copy', '-movflags', '+faststart', `"${outFile}"`,
  ], { shell: true, maxBuffer: 1 << 24 });

  await rm(SEGS, { recursive: true, force: true }).catch(() => {});

  const size = (await stat(outFile)).size;
  const mins = Math.floor(total / 60), secs = Math.round(total % 60);
  console.log(`\n${path.basename(outFile)} — ${scenes.length} scenes, ${mins}m ${secs}s, `
    + `${(size / 1024 / 1024).toFixed(1)} MB`);
  console.log(outFile);
}

main();

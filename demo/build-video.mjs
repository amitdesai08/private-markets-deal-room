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

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'build');
const SEGS = path.join(OUT, 'segments');

const TEASER = process.argv.includes('--teaser');
// The scenes that carry the story on their own: the briefing, the panel people remember,
// a deal opened, and the access moment the demo exists for.
const TEASER_SCENES = ['00-open', '03-home-briefing', '07-home-followups', '13-deal-brief',
  '23-seat-analyst', '24-seat-analyst-onyx', '26-seat-admin-refused'];

const WIDTH = Number(process.env.DEMO_VIDEO_WIDTH || 1440);
const CRF = Number(process.env.DEMO_VIDEO_CRF || 26);

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

  const manifest = JSON.parse(await readFile(path.join(OUT, 'scenes.json'), 'utf8'));
  const scenes = manifest.scenes.filter((s) => s.image && s.audio
    && (!TEASER || TEASER_SCENES.includes(s.id)));
  if (!scenes.length) throw new Error('nothing to render — run capture.mjs and narrate.mjs first');

  await rm(SEGS, { recursive: true, force: true }).catch(() => {});
  await mkdir(SEGS, { recursive: true });

  let total = 0;
  const list = [];

  for (const [n, scene] of scenes.entries()) {
    const seg = path.join(SEGS, `${String(n).padStart(2, '0')}-${scene.id}.mp4`);
    const dur = await seconds(ffprobe, path.join(OUT, scene.audio));
    // A held beat after the narration stops, so scenes do not cut on the speaker's last
    // syllable the way they do in the player, where a cursor covers the gap.
    const hold = (dur + 0.7).toFixed(2);
    total += Number(hold);

    await run(ffmpeg, [
      '-y', '-loglevel', 'error',
      '-loop', '1', '-framerate', '10', '-i', `"${path.join(OUT, scene.image)}"`,
      '-i', `"${path.join(OUT, scene.audio)}"`,
      '-t', hold,
      '-vf', `"scale=${WIDTH}:-2:flags=lanczos,format=yuv420p"`,
      '-c:v', 'libx264', '-preset', 'veryslow', '-crf', String(CRF), '-tune', 'stillimage',
      // The frame never changes within a scene, so a long keyframe interval costs nothing
      // to look at and saves most of the file. At a 2s GOP this was three times the size.
      '-r', '10', '-g', '600', '-keyint_min', '600', '-sc_threshold', '0',
      '-c:a', 'aac', '-b:a', '96k', '-ar', '44100', '-ac', '2',
      '-movflags', '+faststart',
      `"${seg}"`,
    ], { shell: true, maxBuffer: 1 << 24 });

    list.push(`file '${seg.replace(/\\/g, '/')}'`);
    process.stdout.write(`  ${scene.id.padEnd(24)} ${hold.padStart(6)}s\n`);
  }

  const listFile = path.join(SEGS, 'list.txt');
  await writeFile(listFile, list.join('\n'), 'utf8');

  const outFile = path.join(OUT, TEASER ? 'walkthrough-teaser.mp4' : 'walkthrough.mp4');
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

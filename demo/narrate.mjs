// Turns each scene's narration into an MP3 with Azure AI Speech.
//
//   node demo/narrate.mjs           synthesise anything missing
//   node demo/narrate.mjs --force   redo everything
//
// The Speech resource has local auth disabled — there is no key to leak and none is asked
// for. Authentication is an Entra token from the Azure CLI, presented in the form Speech
// wants: `aad#{resourceId}#{token}` against the regional endpoint. That needs the caller to
// hold **Cognitive Services Speech User** on the resource; a subscription Owner does not
// inherit data-plane access and will get a 401 until the role is granted (and it takes a
// few minutes to propagate).

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'build');
const AUDIO = path.join(OUT, 'audio');

const RESOURCE = process.env.SPEECH_RESOURCE || 'spch-dealhub-dev-p3tks';
const RESOURCE_GROUP = process.env.SPEECH_RG || 'rg-dealhub-ai-dev-swc';
const REGION = process.env.SPEECH_REGION || 'swedencentral';
// A neutral American voice, not a regional one — the walkthrough is for any English-
// speaking audience, and an accent is one more thing a viewer notices instead of the product.
const VOICE = process.env.DEMO_VOICE || 'en-US-AndrewNeural';
// Slightly above natural pace, but not the +6% this was — combined with a forced break on
// every sentence that read as rushed-then-braking rather than a person talking at a clip.
const RATE = process.env.DEMO_RATE || '+2%';
const STYLE = process.env.DEMO_STYLE || 'narration-professional';
const FORCE = process.argv.includes('--force');
// Cuts of the walkthrough carry their own manifest and their own narration.
const MANIFEST = (() => {
  const i = process.argv.indexOf('--manifest');
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : 'scenes.json';
})();

// Two encodings of every line. MP3 is the primary: it carries a duration, so the player can
// show progress and seek within a scene. But Chromium built without proprietary codecs —
// Electron, and therefore VS Code's own browser — cannot decode it, and worse, reports
// canPlayType('audio/mpeg') as "probably" before failing. So an Opus copy rides along as a
// fallback the player switches to when decoding actually fails.
const FORMATS = [
  { ext: 'mp3', spec: 'audio-24khz-96kbitrate-mono-mp3', kbps: 96, primary: true },
  { ext: 'webm', spec: 'webm-24khz-16bit-24kbps-mono-opus', kbps: 24, primary: false },
];

async function az(args) {
  const { stdout } = await run('az', args, { shell: true, maxBuffer: 1 << 22 });
  return stdout.trim();
}

/** The authorization header value Speech expects for Entra callers. */
async function speechAuth() {
  const resourceId = await az([
    'cognitiveservices', 'account', 'show',
    '-n', RESOURCE, '-g', RESOURCE_GROUP, '--query', 'id', '-o', 'tsv',
  ]);
  const token = JSON.parse(await az([
    'account', 'get-access-token', '--resource', 'https://cognitiveservices.azure.com', '-o', 'json',
  ])).accessToken;
  if (!resourceId || !token) throw new Error(`could not authenticate to ${RESOURCE}. Run 'az login' first.`);
  return `Bearer aad#${resourceId}#${token}`;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function ssml(text) {
  // A forced break after every period stacked on top of the voice's own sentence-final
  // pause, which is what read as hesitation - closer to a list being read aloud than a
  // person talking. The neural voice already paces sentence and clause boundaries on its
  // own; the only place it needs help is an em dash, which it otherwise runs straight
  // through as if the words either side were one clause.
  const shaped = esc(text)
    .replace(/\s+\u2014\s+/g, '<break time="120ms"/> ');
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" `
    + `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${VOICE.slice(0, 5)}">`
    + `<voice name="${VOICE}"><mstts:express-as style="${STYLE}">`
    + `<prosody rate="${RATE}">${shaped}</prosody>`
    + `</mstts:express-as></voice></speak>`;
}

async function synthesise(auth, text, outPath, spec) {
  const res = await fetch(`https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': spec,
      'User-Agent': 'deal-room-demo',
    },
    body: ssml(text),
  });
  if (!res.ok) {
    throw new Error(`speech ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
  return buf.length;
}

async function main() {
  const manifestPath = path.join(OUT, MANIFEST);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  await mkdir(AUDIO, { recursive: true });

  const auth = await speechAuth();
  let made = 0, kept = 0;

  for (const scene of manifest.scenes) {
    for (const f of FORMATS) {
      const file = `${scene.id}.${f.ext}`;
      const abs = path.join(AUDIO, file);
      const size = await stat(abs).then((st) => st.size).catch(() => 0);
      const key = f.primary ? 'audio' : 'audioAlt';

      if (size > 0 && !FORCE) {
        // Re-capturing rewrites the manifest, so restate these rather than leaving the
        // player without them.
        scene[key] = `audio/${file}`;
        if (f.primary) scene.seconds = Math.round((size * 8) / (f.kbps * 1000));
        kept++;
        continue;
      }
      const bytes = await synthesise(auth, scene.say, abs, f.spec);
      scene[key] = `audio/${file}`;
      if (f.primary) {
        scene.seconds = Math.round((bytes * 8) / (f.kbps * 1000));
        console.log(`  ${scene.id}  ${Math.round(bytes / 1024)}KB  ~${scene.seconds}s`);
      }
      made++;
    }
  }

  manifest.voice = VOICE;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  const total = manifest.scenes.reduce((a, s) => a + (s.seconds || 0), 0);
  console.log(`\n${made} synthesised, ${kept} already present`);
  console.log(`narration runs about ${Math.round(total / 60)} minutes in ${VOICE}`);
}

main();

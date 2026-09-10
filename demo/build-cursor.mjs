// Renders the video's pointer art, once, to build/cursor.png and build/click-ring.png.
//
//   node build-cursor.mjs [--force]
//
// Drawn as SVG in the same headless browser the capture step already uses, rather than
// shipping binary assets, so the shapes stay editable and there is no new dependency. Both
// are screenshotted with the page background overridden to fully transparent, which is what
// lets ffmpeg's overlay composite them onto a screenshot without a card around them.
//
// The ring is what makes the pointer read as *using* the product rather than floating over
// it: build-video.mjs grows and fades it at the moment of each click.

import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'build');

const ACCENT = '#FFC83D';

// Close to a real Windows pointer at 1080p. Bigger reads as a presentation prop.
const CURSOR_W = 17;
const CURSOR_H = 27;
// Rendered large, then scaled per frame by the filtergraph as the ripple expands.
const RING = 120;

// The standard arrow: a narrow head with a straight left edge, a notch, and an angled tail.
// Proportions matter more than size here — a wide or blunt head is what stops a drawn
// pointer looking like the real one. Thin outline so it stays crisp when scaled down.
const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 32" width="${CURSOR_W}" height="${CURSOR_H}">
  <defs>
    <filter id="s" x="-50%" y="-50%" width="220%" height="220%">
      <feDropShadow dx="0.6" dy="1" stdDeviation="0.9" flood-color="#000" flood-opacity="0.45"/>
    </filter>
  </defs>
  <path filter="url(#s)"
        d="M1.4,1.1 L1.4,24.4 L7.1,18.9 L10.6,26.9 L14.1,25.3 L10.7,17.6 L17.6,17.2 Z"
        fill="#ffffff" stroke="#141414" stroke-width="1.15"
        stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;

const RING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${RING}" height="${RING}">
  <circle cx="50" cy="50" r="34" fill="${ACCENT}" fill-opacity="0.16"
          stroke="${ACCENT}" stroke-opacity="0.95" stroke-width="7"/>
</svg>`;

// Both assets share one browser session, so the screenshot must be clipped to the artwork
// itself. Capturing the whole viewport instead silently pads the PNG with empty space, and
// the filtergraph then squashes that padded image into the pointer's size — which draws the
// arrow at a fraction of its intended scale, tucked into a corner.
async function shoot(session, svg, file) {
  const html = `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`;
  await session.navigate(`data:text/html;base64,${Buffer.from(html, 'utf8').toString('base64')}`);
  // Must come after navigation — navigating resets it, and without it the shot is opaque.
  await session.send('Emulation.setDefaultBackgroundColorOverride', {
    color: { r: 0, g: 0, b: 0, a: 0 },
  });
  const r = JSON.parse(await session.eval(`(() => {
    const b = document.querySelector('svg').getBoundingClientRect();
    return JSON.stringify({ x: b.x, y: b.y, w: b.width, h: b.height });
  })()`));
  const shot = await session.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 2 },
  });
  await writeFile(path.join(OUT, file), Buffer.from(shot.data, 'base64'));
  return r;
}

async function main() {
  const have = async (f) => stat(path.join(OUT, f)).then((s) => s.size > 0).catch(() => false);
  if (!process.argv.includes('--force') && await have('cursor.png') && await have('click-ring.png')) {
    console.log('    cursor art already present');
    return;
  }

  const session = await launch({ width: RING * 2, height: RING * 2, scale: 2, headless: true });
  try {
    const c = await shoot(session, CURSOR_SVG, 'cursor.png');
    const r = await shoot(session, RING_SVG, 'click-ring.png');
    console.log(`    cursor.png ${Math.round(c.w)}x${Math.round(c.h)}, `
      + `click-ring.png ${Math.round(r.w)}x${Math.round(r.h)} (both at 2x)`);
  } finally {
    await session.close();
  }
}

main();

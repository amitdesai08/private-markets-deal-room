// What does the Deal Room tab look like from the outside, when Teams is hosting it?
//
// Recording real signed-in users means driving the tab where its SSO token exists, and that
// is only inside the Teams host. The tab is then an iframe (probably nested), which changes
// two things the capture depends on: script has to run in that frame's own execution
// context, and every rect it reports is frame-relative while Input.dispatchMouseEvent wants
// page coordinates. Both need the real frame layout rather than a guess at it.
//
//   node probe-teams.mjs --profile C:\path\to\profile
//
// Opens Teams headed with that profile, waits while you navigate to the Deal Room tab, then
// prints the frame tree, the execution contexts, and the offset chain to the app frame.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/cdp.mjs';
import { waitForEnter } from './lib/prompt.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};

const PROFILE = arg('--profile', path.join(HERE, '.teams-profile'));
const START = arg('--url', 'https://teams.microsoft.com/');

// Run in every frame: who am I, and where are my own child frames on my screen?
const REPORT = `(() => {
  const r = [];
  for (const f of document.querySelectorAll('iframe,webview')) {
    const b = f.getBoundingClientRect();
    r.push({ src: f.src || f.getAttribute('data-src') || '', name: f.name || '',
             x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) });
  }
  const q = (s) => !!document.querySelector(s);
  return {
    href: location.href,
    size: [window.innerWidth, window.innerHeight],
    // Markers that identify the Deal Room tab itself rather than Teams chrome.
    dealRoom: { dealsview: q('.dealsview'), chatpanel: q('aside.chatpanel'), main: q('main.main'), drawer: q('.drawer-body') },
    frames: r,
  };
})()`;

const s = await launch({
  headless: false, userDataDir: PROFILE,
  // The window the user sized is the frame the video will have, so nothing here overrides it.
  overrideMetrics: false,
});
// Cross-origin frames are separate processes and appear only as attached targets. Started
// before navigating so the Deal Room frame is caught the moment Teams creates it.
await s.watchFrames();

console.log(`profile  ${PROFILE}`);
console.log(`opening  ${START}\n`);
await s.navigate(START);

// Measure at the shape the video actually has, or the offsets describe a layout that will
// never be filmed.
const fitted = await s.setViewportSize(
  Number(process.env.DEMO_WIDTH || 1920), Number(process.env.DEMO_HEIGHT || 1080),
);
console.log(`window fitted to ${fitted.w}x${fitted.h}\n`);

await waitForEnter('Sign in if asked, open the Deal Hub channel and its Deal Room tab, let it render — then press Enter here.');

const vp = await s.viewport();
console.log(`--- viewport ---\n  ${vp.w}x${vp.h} css px, dpr ${vp.dpr}\n`);

const tree = await s.send('Page.getFrameTree');
const flat = [];
(function walk(node, depth) {
  flat.push({ depth, id: node.frame.id, parentId: node.frame.parentId || null, url: node.frame.url });
  for (const c of node.childFrames || []) walk(c, depth + 1);
})(tree.frameTree, 0);

console.log('--- frame tree (this process only) ---');
for (const f of flat) console.log(`${'  '.repeat(f.depth)}${f.url.slice(0, 120)}`);

const targets = s.targets().filter((t) => t.type === 'iframe');
console.log('\n--- attached out-of-process frames ---');
if (!targets.length) console.log('  (none — the app frame is same-process, or the tab is not open)');
for (const t of targets) console.log(`  ${t.type.padEnd(8)} ${t.url.slice(0, 110)}`);

// Ask every reachable document whether it is the Deal Room.
console.log('\n--- per-frame report ---');
const found = [];
const ask = async (label, opts) => {
  let rep = null;
  try { rep = await s.eval(REPORT, opts); } catch (e) { return console.log(`  ${label}: ${e.message.slice(0, 80)}`); }
  if (!rep) return console.log(`  ${label}: no result`);
  const marks = Object.entries(rep.dealRoom).filter(([, v]) => v).map(([k]) => k).join(',') || '-';
  console.log(`  ${label} ${rep.size[0]}x${rep.size[1]}  dealRoom[${marks}]  ${rep.href.slice(0, 90)}`);
  for (const f of rep.frames) console.log(`        child iframe ${f.w}x${f.h} @ ${f.x},${f.y}  ${f.src.slice(0, 80)}`);
  if (Object.values(rep.dealRoom).some(Boolean)) found.push({ label, rep, opts });
  return rep;
};

const topRep = await ask('top     ', {});
for (const t of targets) {
  await s.enableTarget(t.sessionId);
  await ask(`oopif   `, { sessionId: t.sessionId });
}

if (!found.length) {
  console.log('\nNo frame reported Deal Room markers. Is the Deal Room tab open and rendered?');
} else {
  const app = found[0];
  console.log(`\n--- app frame ---`);
  console.log(`  ${app.rep.href}`);
  console.log(`  renders at ${app.rep.size[0]}x${app.rep.size[1]}`);
  // Input events are dispatched at the page level, so the app's own rects need the position
  // of the iframe hosting it added. Read straight off the top document rather than walking
  // the frame tree, which does not contain a cross-origin child at all.
  const host = (topRep?.frames || []).find((f) => {
    try { return f.src && new URL(f.src).origin === new URL(app.rep.href).origin; } catch { return false; }
  });
  if (!host) {
    console.log('  ! no iframe in the top document matches the app origin — offset unknown');
  } else {
    console.log(`  hosted at ${host.x},${host.y} (${host.w}x${host.h})`);
    console.log(`\n  PAGE OFFSET  x=${host.x}  y=${host.y}`);
    console.log('  (add this to every rect the app reports before dispatching a mouse event)');
  }
}

await waitForEnter('\nPress Enter to close the browser.');
await s.close();

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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/cdp.mjs';
import { tabToken } from './lib/token.mjs';
import { waitForEnter } from './lib/prompt.mjs';

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

const WIDTH = Number(process.env.DEMO_WIDTH || 1440);
const HEIGHT = Number(process.env.DEMO_HEIGHT || 900);
const SCALE = Number(process.env.DEMO_SCALE || 2);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (s) => JSON.stringify(String(s));

// Helpers that live in the page. Text matching is how a person finds things on a screen,
// and it survives a CSS refactor in a way that a generated class name does not.
const HELPERS = `
window.__demo = {
  scroller() { return document.querySelector('main.main') || document.scrollingElement; },
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
    if (!String(spec).startsWith('text:')) return document.querySelector(spec);
    const el = window.__demo.byText(String(spec).slice(5));
    if (!el) return null;
    // A click points at the control itself; a spotlight frames the panel around it.
    return grow ? window.__demo.panel(el) : el;
  },
};
true;
`;

async function inject(s) { await s.eval(HELPERS); }

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
        await s.navigate(`${BASE}/?dr_as=${state.seat}${arg}`);
        await inject(s);
        await s.waitFor(`!document.body.innerText.includes('Loading your deals')`, { timeout: 90000, label: 'app load' });
      }
      break;

    case 'wait':
      await sleep(arg);
      break;

    case 'waitText':
      await s.waitFor(`document.body.innerText.includes(${js(arg)})`, { timeout: 60000, label: `text ${arg}` });
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
      await s.waitFor(`document.body.innerText.includes('Open deal')`, { timeout: 45000, label: 'deals list' });
      const how = await s.eval(`(() => {
        const name = ${js(arg)};
        // Every row carries its own "Open deal" button. Clicking the company name does
        // nothing, and walking up from it lands on whichever ancestor happens to be
        // clickable — which is how this used to end up back on the list.
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

    case 'selectSeat': {
      state.seat = arg;
      await s.eval(`(() => {
        const sel = document.querySelector('select.viewas');
        if (!sel) return false;
        const opt = [...sel.options].find((o) => o.value === ${js(arg)})
          || [...sel.options].find((o) => o.value.toLowerCase().includes(${js(arg)}));
        if (!opt) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter.call(sel, opt.value);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      await sleep(3000);
      break;
    }

    case 'closeOverlay':
      await s.navigate(`${BASE}/?dr_as=${state.seat}#/overview`);
      await inject(s);
      await s.waitFor(`!document.body.innerText.includes('Loading your deals')`, { timeout: 60000, label: 'overview' });
      break;

    case 'gotoConfidential': {
      if (!state.lastDealUrl) throw new Error('no confidential deal URL was captured earlier');
      await s.navigate(`${BASE}/?dr_as=${state.seat}${state.lastDealUrl}`);
      await inject(s);
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

  // External captures need a real, human sign-in — headless can never complete that, and
  // there is no demo-mode token to fall back on. A fresh profile every run would also mean
  // signing in again every run, so this one persists (git-ignored, never the app's own data).
  if (EXTERNAL && !process.env.DEMO_HEADED) {
    throw new Error("external captures require DEMO_HEADED=1 — headless can't complete a real sign-in. Re-run with DEMO_HEADED=1 set.");
  }
  const profileDir = EXTERNAL
    ? (TARGET.profileDir || path.join(HERE, '.external-profile', (TARGET.baseUrl || SCENES_MODULE).replace(/[^a-z0-9]+/gi, '-')))
    : null;

  const s = await launch({
    width: WIDTH, height: HEIGHT, scale: SCALE,
    headless: !process.env.DEMO_HEADED,
    userDataDir: profileDir,
  });

  if (!EXTERNAL) {
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
  const manifest = [];

  try {
    if (EXTERNAL) {
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
      try {
        if (!EXTERNAL && scene.seat && scene.seat !== state.seat) {
          await runStep(s, { selectSeat: scene.seat }, state);
        }
        await inject(s);
        for (const step of scene.steps || []) await runStep(s, step, state);
        if (!EXTERNAL && !scene.keepBanner) await runStep(s, { dismissBanner: true }, state);
        await inject(s);
        await settle(s);

        const spotlight = scene.spotlight
          ? await s.eval(`window.__demo.rect(window.__demo.resolve(${js(scene.spotlight)}, true))`)
          : null;
        const click = scene.click
          ? await s.eval(`window.__demo.rect(window.__demo.resolve(${js(scene.click)}, false))`)
          : null;

        const file = `${scene.id}.png`;
        await s.screenshot({ path: path.join(SHOTS, file) });

        manifest.push({
          id: scene.id, act: scene.act, title: scene.title, seat: scene.seat,
          say: scene.say.replace(/\s+/g, ' ').trim(),
          image: `shots/${file}`, spotlight, click,
        });
        console.log(`  ok  ${label}`);
      } catch (e) {
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

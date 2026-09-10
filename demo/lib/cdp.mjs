// A very small Chrome DevTools Protocol client.
//
// The npm registry is not reachable from the build machine, so Playwright is not an
// option. Everything here runs on what Node 24 already has: fetch to read the debugger's
// target list, and the built-in WebSocket to speak CDP. That is the whole dependency list.

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BROWSERS = [
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findBrowser() {
  const { access } = await import('node:fs/promises');
  for (const b of BROWSERS) {
    try { await access(b); return b; } catch { /* next */ }
  }
  throw new Error('No Edge or Chrome found. Install one, or set DEMO_BROWSER to an executable.');
}

// Kill any browser still holding this profile directory. Matched on the command line so it
// only ever touches instances launched against this exact profile, never a real browser.
async function releaseProfile(profile) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" `
    + `| Where-Object { $_.CommandLine -like '*--user-data-dir=${profile.replace(/\\/g, '\\')}*' } `
    + `| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  try {
    await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true });
    await sleep(1200);
  } catch { /* nothing holding it, or no powershell — the launch will report the real problem */ }
}

export class Session {
  #ws; #id = 0; #pending = new Map(); #handlers = new Map();
  // Runtime.evaluate only ever reaches the top frame. An app hosted in an iframe — a Teams
  // tab, say — needs its own execution context, so they are tracked as they appear.
  #contexts = new Map();
  // A CROSS-ORIGIN iframe is worse than a separate context: Chrome gives it its own process,
  // so it never appears in this target's frame tree or Runtime events at all. It is reachable
  // only as an attached target with its own session id, tracked here by that id.
  #targets = new Map();
  // When the app under capture is hosted in such a frame, every DOM expression belongs to it
  // while input and screen capture still belong to the page. This is the former's address.
  #defaultSession = null;

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id != null) {
        const p = this.#pending.get(msg.id);
        if (!p) return;
        this.#pending.delete(msg.id);
        msg.error ? p.reject(new Error(`${msg.error.message} (${p.method})`)) : p.resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.executionContextCreated') {
        const c = msg.params.context;
        this.#contexts.set(c.id, {
          id: c.id, origin: c.origin, name: c.name,
          frameId: c.auxData?.frameId, isDefault: !!c.auxData?.isDefault,
        });
      } else if (msg.method === 'Runtime.executionContextDestroyed') {
        this.#contexts.delete(msg.params.executionContextId);
      } else if (msg.method === 'Runtime.executionContextsCleared') {
        this.#contexts.clear();
      } else if (msg.method === 'Target.attachedToTarget') {
        const { sessionId, targetInfo } = msg.params;
        this.#targets.set(sessionId, {
          sessionId, targetId: targetInfo.targetId, url: targetInfo.url, type: targetInfo.type,
        });
      } else if (msg.method === 'Target.detachedFromTarget') {
        this.#targets.delete(msg.params.sessionId);
      } else if (msg.method === 'Target.targetInfoChanged') {
        // A frame that navigates keeps its session; only the URL moves.
        for (const t of this.#targets.values()) {
          if (t.targetId === msg.params.targetInfo.targetId) t.url = msg.params.targetInfo.url;
        }
      }
      for (const h of this.#handlers.get(msg.method) || []) h(msg.params);
    });
  }

  /** Every live execution context. One per frame that has run script. */
  contexts() { return [...this.#contexts.values()]; }

  /** Every separately-processed frame currently attached, newest information first. */
  targets() { return [...this.#targets.values()]; }

  /**
   * Send every later `eval`/`waitFor` into this frame instead of the top document. Input and
   * screencast deliberately keep going to the page, which is what the camera sees.
   */
  useFrame(sessionId) { this.#defaultSession = sessionId; }

  /**
   * Attach to out-of-process frames as they appear. `flatten` multiplexes every attached
   * target down this one socket, tagged with a session id, so no second connection is needed.
   */
  async watchFrames() {
    await this.send('Target.setAutoAttach', {
      autoAttach: true, waitForDebuggerOnStart: false, flatten: true,
    });
  }

  /** Turn a target's own Runtime on, so expressions can be evaluated inside it. */
  async enableTarget(sessionId) {
    await this.send('Runtime.enable', {}, sessionId).catch(() => {});
    await this.send('Page.enable', {}, sessionId).catch(() => {});
  }

  send(method, params = {}, sessionId = null) {
    const id = ++this.#id;
    this.#ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, method });
      setTimeout(() => {
        if (!this.#pending.has(id)) return;
        this.#pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 120000);
    });
  }

  on(method, fn) {
    if (!this.#handlers.has(method)) this.#handlers.set(method, []);
    this.#handlers.get(method).push(fn);
    return () => {
      const a = this.#handlers.get(method);
      a.splice(a.indexOf(fn), 1);
    };
  }

  /** Run an expression in the page and return its value. Throws what the page throws. */
  async eval(expression, { awaitPromise = true, contextId = null, sessionId = null } = {}) {
    const r = await this.send('Runtime.evaluate', {
      expression, awaitPromise, returnByValue: true, userGesture: true,
      ...(contextId ? { contextId } : {}),
    }, sessionId ?? this.#defaultSession);
    if (r.exceptionDetails) {
      const e = r.exceptionDetails;
      throw new Error(`page error: ${e.exception?.description || e.text}`);
    }
    return r.result?.value;
  }

  /** Poll an expression until it is truthy. Returns the value it settled on. */
  async waitFor(expression, { timeout = 45000, interval = 250, label = expression, contextId = null, sessionId = null } = {}) {
    const until = Date.now() + timeout;
    let last;
    for (;;) {
      try { last = await this.eval(expression, { contextId, sessionId }); } catch { last = undefined; }
      if (last) return last;
      if (Date.now() > until) throw new Error(`timed out waiting for: ${label}`);
      await sleep(interval);
    }
  }

  async navigate(url) {
    const loaded = new Promise((resolve) => {
      const off = this.on('Page.loadEventFired', () => { off(); resolve(); });
      setTimeout(resolve, 30000);
    });
    await this.send('Page.navigate', { url });
    await loaded;
  }

  async screenshot({ path: outPath, quality } = {}) {    const r = await this.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false, ...(quality ? { quality } : {}),
    });
    const buf = Buffer.from(r.data, 'base64');
    if (outPath) {
      const { writeFile, mkdir } = await import('node:fs/promises');
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, buf);
    }
    return buf;
  }
}

export async function launch({
  width = 1440, height = 900, scale = 2, headless = true, userDataDir = null,
  // Headless has no window, so the page is whatever size it is told to be. A HEADED capture
  // is the opposite: the window is the frame, and overriding the metrics renders the page at
  // a size the window does not have. Pass false to let the real window decide.
  overrideMetrics = true, maximize = false,
} = {}) {
  const exe = process.env.DEMO_BROWSER || await findBrowser();
  // A caller-supplied profile is how an external capture keeps a real sign-in session
  // between runs — it is never deleted on close. The default temp profile (every existing
  // Deal Room manifest) is unchanged: fresh every run, always cleaned up.
  const persistent = !!userDataDir;
  const profile = persistent ? userDataDir : await mkdtemp(path.join(tmpdir(), 'dealroom-demo-'));
  if (persistent) await mkdir(profile, { recursive: true });
  // A profile directory backs exactly one browser instance. If a previous run died before
  // closing, its browser still holds this one and the new launch is handed off to it and
  // exits — so the debugger never opens, and the error says nothing about why.
  if (persistent && process.platform === 'win32') await releaseProfile(profile);
  const port = 9000 + Math.floor(Math.random() * 900);

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    // When the window is the authority, do not dictate its size either: with no flag Chrome
    // restores the bounds this profile was last left at, which is the size the user chose.
    ...(maximize ? ['--start-maximized'] : overrideMetrics ? [`--window-size=${width},${height}`] : []),
    '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-extensions', '--disable-background-networking',
    '--hide-scrollbars', '--force-device-scale-factor=1',
    'about:blank',
  ];
  if (headless) args.unshift('--headless=new');

  const proc = spawn(exe, args, { stdio: 'ignore', detached: false });

  // The debugger takes a moment to open its port.
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(250);
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch { /* not up yet */ }
  }
  if (!target) {
    proc.kill();
    throw new Error(`browser debugger never came up on port ${port}`);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
  });

  const s = new Session(ws);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await s.send('Network.enable');
  // Headless paints whatever it is told to, so this is where capture resolution is decided.
  if (overrideMetrics) {
    await s.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: scale, mobile: false,
    });
  }

  /** What the page is actually rendering at, which is not `width`/`height` when headed. */
  s.viewport = async () => {
    // Sent bare so it always measures the TOP window, even once a hosted frame is default.
    const r = await s.send('Runtime.evaluate', {
      expression: '({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio })',
      returnByValue: true,
    });
    return r.result?.value;
  };

  /**
   * Size the WINDOW so the page renders at exactly w x h. The browser's own chrome lives
   * inside the window, and how much it takes differs by platform and by which bars are
   * showing, so it is measured rather than assumed. If the screen cannot fit the request the
   * aspect ratio is kept and the size comes down, because the shape is what the video needs.
   */
  s.setViewportSize = async (w, h) => {
    const { windowId } = await s.send('Browser.getWindowForTarget');
    const avail = await s.send('Runtime.evaluate', {
      expression: '({ w: screen.availWidth, h: screen.availHeight })', returnByValue: true,
    }).then((r) => r.result?.value || { w, h });

    const setBounds = async (width, height) => {
      await s.send('Browser.setWindowBounds', {
        windowId, bounds: { windowState: 'normal', left: 0, top: 0, width, height },
      });
      await sleep(300);
    };

    // Fill the screen once purely to learn what the chrome costs.
    await setBounds(avail.w, avail.h);
    const full = await s.viewport();
    const chromeW = Math.max(0, avail.w - full.w);
    const chromeH = Math.max(0, avail.h - full.h);

    const scale = Math.min((avail.w - chromeW) / w, (avail.h - chromeH) / h, 1);
    const even = (n) => Math.floor(n / 2) * 2;
    const want = { w: even(w * scale), h: even(h * scale) };

    let width = want.w + chromeW;
    let height = want.h + chromeH;
    for (let i = 0; i < 4; i++) {
      await setBounds(width, height);
      const vp = await s.viewport();
      const dw = want.w - vp.w;
      const dh = want.h - vp.h;
      if (Math.abs(dw) <= 1 && Math.abs(dh) <= 1) break;
      width += dw;
      height += dh;
    }
    return s.viewport();
  };

  /** Attach headers to every request the page makes — how the capture authenticates. */
  s.setHeaders = (headers) => s.send('Network.setExtraHTTPHeaders', { headers });

  s.close = async () => {
    try { ws.close(); } catch { /* already gone */ }
    try { proc.kill(); } catch { /* already gone */ }
    await sleep(400);
    // A persistent profile carries the signed-in session forward to the next run.
    if (!persistent) await rm(profile, { recursive: true, force: true }).catch(() => {});
  };
  return s;
}

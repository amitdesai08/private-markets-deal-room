// Site proxy — serves the EXISTING Deal Room web UI (from the shared backend)
// through the Teams app origin, so the Channel Tab is the real dashboard with
// zero component duplication and a single data source. HTML responses get a
// small Teams bootstrap injected (theme sync + SSO notify); assets stream through.

import { config } from './config.js';

const BOOTSTRAP_TAGS =
  '\n<script src="https://res.cdn.office.net/teams-js/2.31.1/js/MicrosoftTeams.min.js"></script>' +
  '\n<script src="/teams-bootstrap.js"></script>\n';

export async function siteProxy(req, res) {
  const target = `${config.backend.url}${req.originalUrl}`;
  try {
    const upstream = await fetch(target, {
      headers: { accept: req.headers.accept || '*/*', 'user-agent': req.headers['user-agent'] || 'teams-app' },
    });
    const contentType = upstream.headers.get('content-type') || '';
    res.status(upstream.status);

    if (contentType.includes('text/html')) {
      let html = await upstream.text();
      html = html.includes('</head>')
        ? html.replace('</head>', `${BOOTSTRAP_TAGS}</head>`)
        : `${html}${BOOTSTRAP_TAGS}`;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.send(html);
    }

    upstream.headers.forEach((value, key) => {
      const lk = key.toLowerCase();
      if (lk !== 'content-encoding' && lk !== 'transfer-encoding' && lk !== 'content-length') {
        res.setHeader(key, value);
      }
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (e) {
    res.status(502).send('Shared backend unreachable');
  }
}

// The injected bootstrap: initialize Teams, map theme onto the Deal Room client's
// :root CSS variables, and signal the tab loaded successfully.
export const TEAMS_BOOTSTRAP_JS = `(function () {
  function applyTheme(theme) {
    var r = document.documentElement;
    r.setAttribute('data-teams-theme', theme || 'default');
    if (theme === 'dark') {
      r.style.setProperty('--bg', '#1f1f1f');
      r.style.setProperty('--fg', '#f3f3f3');
      r.style.setProperty('--panel', '#2b2b2b');
    } else if (theme === 'contrast') {
      r.style.setProperty('--bg', '#000000');
      r.style.setProperty('--fg', '#ffffff');
      r.style.setProperty('--panel', '#000000');
    }
  }
  try {
    if (window.microsoftTeams) {
      microsoftTeams.app.initialize()
        .then(function () { return microsoftTeams.app.getContext(); })
        .then(function (ctx) {
          applyTheme(ctx && ctx.app && ctx.app.theme);
          microsoftTeams.app.registerOnThemeChangeHandler(applyTheme);
          microsoftTeams.app.notifySuccess();
        })
        .catch(function () {});
    }
  } catch (e) {}
})();`;

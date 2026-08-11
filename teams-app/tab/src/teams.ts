import { app, authentication } from '@microsoft/teams-js';

export type TeamsInfo = { inTeams: boolean; theme: string; context?: unknown };

// Map the Teams theme onto a full set of CSS variables so the native tab restyles
// automatically for default / dark / high-contrast, matching Teams' own palette.
export function applyTheme(theme: string) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const dark = theme === 'dark';
  const contrast = theme === 'contrast';
  const t = (light: string, darkV: string, contrastV: string) => (contrast ? contrastV : dark ? darkV : light);

  root.style.setProperty('--bg', t('#f5f5f5', '#1f1f1f', '#000000'));
  root.style.setProperty('--surface', t('#ffffff', '#2b2b2b', '#000000'));
  root.style.setProperty('--card', t('#ffffff', '#292929', '#000000'));
  root.style.setProperty('--fg', t('#1f1f1f', '#f3f3f3', '#ffffff'));
  // Muted/secondary text — darkened (light) / brightened (dark) for a comfortable
  // WCAG-AA contrast margin against the surface.
  root.style.setProperty('--muted', t('#57606a', '#b7bfca', '#c8c8c8'));
  root.style.setProperty('--border', t('#d7dbe0', '#3d3d3d', '#ffffff'));
  root.style.setProperty('--accent', t('#5b5fc7', '#7f85f5', '#ffff01'));
  root.style.setProperty('--accent-fg', t('#ffffff', '#ffffff', '#000000'));
  root.style.setProperty('--hover', t('#f0f0f0', '#333333', '#1a1a1a'));
  root.style.setProperty('--bubble-user', t('#e8ebfa', '#3b3d5c', '#0f0f00'));
  root.style.setProperty('--bubble-agent', t('#ffffff', '#333333', '#000000'));
  root.style.setProperty('--input-bg', t('#ffffff', '#1f1f1f', '#000000'));
  root.style.setProperty('--chip', t('#eeeef7', '#33344a', '#0f0f00'));
  root.style.setProperty('--shadow', dark || contrast ? 'none' : '0 1px 2px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.06)');

  // Semantic status families. Every surface states meaning through these rather than
  // one-off hex, so "AI overlay" vs "authoritative status" reads the same everywhere
  // and stays legible in dark / high-contrast. Each family is a text colour plus a
  // tinted fill and a border, so a chip, a callout and a card share one vocabulary.
  const family = (name: string, light: string, darkV: string, contrastV: string, rgb: string) => {
    root.style.setProperty(`--${name}`, t(light, darkV, contrastV));
    root.style.setProperty(`--${name}-bg`, contrast ? 'transparent' : `rgba(${rgb}, ${dark ? 0.14 : 0.09})`);
    root.style.setProperty(`--${name}-br`, contrast ? t(light, darkV, contrastV) : `rgba(${rgb}, ${dark ? 0.38 : 0.3})`);
  };
  // AI / machine-generated. Deliberately a different hue from --accent so an AI
  // surface is never mistaken for an authoritative one.
  //
  // High contrast keeps the four families distinct rather than collapsing them all
  // to the accent yellow: if every status renders the same colour, a user relying on
  // the contrast theme loses the good/bad/AI distinction entirely. These four are all
  // drawn from the Windows high-contrast palette, so each still meets the theme's
  // contrast floor against the black background.
  family('ai', '#7c3aed', '#b79cff', '#1aebff', dark ? '140,110,255' : '124,58,237');
  family('warn', '#b8860b', '#e0b341', '#ffd700', dark ? '224,179,65' : '184,134,11');
  family('bad', '#b23b3b', '#ff9d9d', '#ff8c8c', dark ? '255,120,120' : '178,59,59');
  family('good', '#1b7f37', '#5fd68a', '#3ff23f', dark ? '95,214,138' : '27,127,55');
}

// User theme choice (light/dark) persists across sessions and, when set, overrides
// both the Teams host theme and the OS color-scheme preference.
const THEME_KEY = 'dealroom-theme';
function storedTheme(): string | null { try { return localStorage.getItem(THEME_KEY); } catch { return null; } }
function prefersDark(): boolean { try { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch { return false; } }

export function currentTheme(): string { return document.documentElement.dataset.theme || 'default'; }

export function setUserTheme(mode: string): void {
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* ignore */ }
  applyTheme(mode);
}

// Flip light <-> dark (leaves Teams high-contrast untouched), persist, return new mode.
export function toggleTheme(): string {
  const next = currentTheme() === 'dark' ? 'default' : 'dark';
  setUserTheme(next);
  return next;
}

// Whether the Teams host actually answered. Outside it there is no SSO token to wait for,
// and waiting the full cap for one is the difference between a deal link opening at once
// and appearing to hang.
let inTeamsHost: boolean | null = null;

export async function initTeams(): Promise<TeamsInfo> {
  const override = storedTheme();
  try {
    await app.initialize();
    const context = await app.getContext();
    const theme = override || context.app.theme || 'default';
    applyTheme(theme);
    // Teams host theme changes apply only when the user hasn't set an explicit override.
    app.registerOnThemeChangeHandler((tHeme) => { if (!storedTheme()) applyTheme(tHeme); });
    app.notifySuccess();
    inTeamsHost = true;
    return { inTeams: true, theme, context };
  } catch {
    // Outside Teams (web console): honour the saved choice, else the OS color scheme,
    // and keep following the OS until the user picks a theme explicitly.
    const initial = override || (prefersDark() ? 'dark' : 'default');
    applyTheme(initial);
    try {
      if (!override && window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => { if (!storedTheme()) applyTheme(e.matches ? 'dark' : 'default'); });
      }
    } catch { /* ignore */ }
    inTeamsHost = false;
    return { inTeams: false, theme: initial };
  }
}

// Teams SSO token (exchanged server-side via OBO). Null outside Teams / no SSO.
// Time-boxed: outside the Teams host getAuthToken never resolves, so we cap it
// so the tab never blocks its data loads on SSO.
//
// Outside Teams the answer is null and cannot become anything else, so it is answered at
// once rather than paying the cap. Two callers on mount used to pay it twice — eight
// seconds of dead air before a deal link would open. A real token is NOT cached: they
// expire, and a stale one fails at Graph rather than at the door.
let inFlight: Promise<string | null> | null = null;
export function getSsoToken(): Promise<string | null> {
  if (inTeamsHost === false) return Promise.resolve(null);
  if (!inFlight) {
    inFlight = Promise.race([
      Promise.resolve(authentication.getAuthToken()).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]).catch(() => null).finally(() => { inFlight = null; });
  }
  return inFlight;
}

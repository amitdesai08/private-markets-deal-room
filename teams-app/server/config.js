// Central configuration for the Teams app — the SINGLE place env is read.
//
// The Teams app owns NO data. It is a thin interface (SSO/OBO, tab hosting, bot)
// that forwards to the shared Deal Room backend (SHARED_BACKEND_URL). Demo mode
// (no SHARED_BACKEND_URL) still boots so the tab and manifest can be developed.

const env = process.env;

const str = (v, d = '') => (v === undefined || v === null ? d : String(v));
const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const trimUrl = (v, d = '') => str(v, d).replace(/\/$/, '');

export const config = Object.freeze({
  server: {
    port: int(env.PORT, 8090),
    appBaseUrl: trimUrl(env.APP_BASE_URL, ''),
  },
  // The single source of truth — every data read/write forwards here.
  backend: {
    url: trimUrl(env.SHARED_BACKEND_URL, ''),
    // Shared secret proving server-to-server calls to the orchestrator, so it can
    // trust the forwarded requestingUser identity + per-user OBO Graph token.
    botKey: str(env.BOT_BACKEND_KEY, ''),
  },
  entra: {
    tenantId: str(env.ENTRA_TENANT_ID, '').trim(),
    tabClientId: str(env.TEAMS_TAB_CLIENT_ID, '').trim(),
    tabClientSecret: str(env.TEAMS_TAB_CLIENT_SECRET, ''),
  },
  bot: {
    appId: str(env.BOT_APP_ID, '').trim(),
    appPassword: str(env.BOT_APP_PASSWORD, ''),
    appType: str(env.BOT_APP_TYPE, 'MultiTenant'),
    tenantId: str(env.ENTRA_TENANT_ID, '').trim(),
  },
  mcp: {
    host: str(env.MCP_HOST, '').trim(),
  },
  // Platform power control — lets the Teams app sleep/wake the orchestrator (the
  // data plane) to save cost. Uses the Teams app's managed identity (AZURE_CLIENT_ID)
  // against Azure Resource Manager. Disabled automatically when the target isn't set.
  platform: {
    enabled: env.PLATFORM_CONTROL === undefined ? true : /^true$/i.test(String(env.PLATFORM_CONTROL)),
    subscriptionId: str(env.AZURE_SUBSCRIPTION_ID, '').trim(),
    resourceGroup: str(env.ORCH_RESOURCE_GROUP, '').trim(),
    appName: str(env.ORCH_APP_NAME, '').trim(),
    clientId: str(env.AZURE_CLIENT_ID, '').trim(),
    leaseHours: int(env.PLATFORM_LEASE_HOURS, 1) > 0 ? int(env.PLATFORM_LEASE_HOURS, 1) : 1,
  },
});

export const isBackendLive = () => !!config.backend.url;
export const isBotConfigured = () => !!config.bot.appId && !!config.bot.appPassword;
export const isSsoConfigured = () =>
  !!config.entra.tenantId && !!config.entra.tabClientId && !!config.entra.tabClientSecret;
export const isDemoMode = () => !isBackendLive();

export function validateConfig({ log = console } = {}) {
  const notes = [];
  if (isDemoMode()) {
    log.info?.(
      '[teams-config] DEMO mode — SHARED_BACKEND_URL not set; the tab renders but ' +
        'data calls return a hint until the shared backend is wired.'
    );
  } else {
    log.info?.(`[teams-config] shared backend: ${config.backend.url}`);
  }
  if (!isSsoConfigured()) notes.push('SSO not configured (ENTRA_TENANT_ID / TEAMS_TAB_CLIENT_ID / secret) — per-user context disabled.');
  if (!isBotConfigured()) notes.push('Bot not configured (BOT_APP_ID / BOT_APP_PASSWORD) — Adaptive Card notifications disabled.');
  for (const n of notes) log.warn?.(`[teams-config] ${n}`);
  return { demoMode: isDemoMode(), sso: isSsoConfigured(), bot: isBotConfigured(), notes };
}

export default config;

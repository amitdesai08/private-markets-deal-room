// Identity-aware fetch for deal list/detail calls.
//
// The tab has no server session — identity flows to the orchestrator through the
// Teams server, which trusts a resolved identity (SSO token or demo "view as USER")
// only when it carries the shared bot key. So for deal reads we attach the caller's
// SSO token + the current demo/role selection as headers; the Teams server resolves
// them into a trusted identity before forwarding. Non-deal calls keep using plain
// fetch (they don't gate on need-to-know).

type AuthCtx = { as?: string; viewAsRole?: string; ssoToken?: string };

let ctx: AuthCtx = {};

export function setAuthContext(next: AuthCtx) {
  ctx = { ...ctx, ...next };
}

export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...(extra || {}) };
  if (ctx.as) h['x-dr-as'] = ctx.as;                     // demo "view as USER"
  if (ctx.viewAsRole) h['x-dr-view-as'] = ctx.viewAsRole; // hierarchy "view as ROLE"
  if (ctx.ssoToken) h['authorization'] = `Bearer ${ctx.ssoToken}`;
  return h;
}

// fetch() with the current identity headers attached.
export function af(url: string, opts: RequestInit = {}): Promise<Response> {
  const headers = { ...(opts.headers as Record<string, string> | undefined), ...authHeaders() };
  return fetch(url, { ...opts, headers });
}

// EVERY /api CALL CARRIES THE CALLER.
//
// The note at the top of this file said non-deal calls "don't gate on need-to-know", and
// that stopped being true the day the orchestrator started refusing callers it could not
// identify: forty-odd plain fetches — the whole of Stage1, most of App — went out with no
// persona on them. /api/home-desk answered 401 and the window sat on "Loading your deals…"
// forever, which reads as the personas not switching rather than as an access change.
//
// Deciding per call site is the thing that went stale. This decides once.
let installed = false;
export function installAuthFetch() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // Seed from the URL, because the first request goes out before App has read the roster
  // and chosen a profile — and ?dr_as= is already a deliberate instruction about who to be.
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('dr_as') || '';
    if (fromUrl && !ctx.as) ctx.as = fromUrl;
  } catch { /* no search params to read */ }
  const real = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    // Same-origin API calls only. Anything absolute is somebody else's service.
    if (!/^[a-z]+:\/\//i.test(url) && url.startsWith('/api')) {
      const merged = { ...(init || {}) };
      merged.headers = { ...(init?.headers as Record<string, string> | undefined), ...authHeaders() };
      return real(input as RequestInfo, merged);
    }
    return real(input as RequestInfo, init);
  };
}

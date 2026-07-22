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

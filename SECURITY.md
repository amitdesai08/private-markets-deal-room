# Security

The Deal Room is an **Azure accelerator** built to be secure-by-default. This
document summarises the security model and how to report a vulnerability.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report it privately to the maintainers so it can be triaged and fixed
before disclosure:

- Use **GitHub → Security → Report a vulnerability** (private advisory), **or**
- Email the repository owner / your delivery contact directly.

Please include: a description, the affected component (orchestrator / teams-app /
infra / scripts), reproduction steps, and any suggested remediation. We aim to
acknowledge within a few business days.

## Security model (how the accelerator protects itself)

- **Managed identity end-to-end.** The Container Apps run as a user-assigned
  managed identity (UAMI). Access to Azure OpenAI / Foundry, the data store,
  Storage and (optionally) Cosmos is **RBAC via managed identity — no keys in
  the app**. Cosmos, when used, has local auth disabled.
- **No secrets in the repository.** `.env`, `*.pem/*.key/*.pfx`, generated Entra
  param files and compiled Bicep outputs are git-ignored. Secrets
  (`teamsTabClientSecret`, `botAppPassword`, `m365ClientSecret`,
  `mcpReadonlyKey`, `botBackendKey`) are passed at deploy time or auto-derived
  as Container App secrets — never committed. Rotate them by redeploying.
- **Identity-aware RBAC.** What each caller may see and do is resolved
  **server-side** from the requesting identity ([`app/lib/userPolicy.js`](app/lib/userPolicy.js) +
  [`app/lib/personaPolicy.js`](app/lib/personaPolicy.js)). A client can never widen its own powers; the
  hierarchy "view-as" can only move **down**, never up. Persona write actions are
  authorised on the server regardless of what a model emits.
- **Entra-gated MCP.** The public `/mcp` surface is protected by Microsoft Entra
  ID; the read-only `/mcp-ro` surface (used by the Foundry agents) is gated by a
  Container App secret and exposes **read tools only** — governed writes stay in
  the app.
- **Trusted-caller seam.** The orchestrator only honours a supplied requesting
  identity when the caller proves it is the Teams server (shared
  `botBackendKey`); otherwise the request is treated as unidentified and gets the
  `defaultAgentRole`.
- **Content safety (optional).** When `CONTENT_SAFETY_ENDPOINT` is set, model
  I/O is screened by Azure AI Content Safety.
- **Network hardening (optional).** `enablePrivateEndpoints=true` provisions
  private endpoints + private DNS for the data-plane services and denies public
  network access.

## Demo profiles are not a production auth mechanism

The demo "sign in as" profiles are gated behind `deployDemoProfiles` and are for
**demonstrations only**. Leave `deployDemoProfiles=false` in production — real
access is then driven solely by the Entra object IDs you supply in the roles
harness (`adminIds` / `partnerIds` / `dealTeamIds` / `analystIds`).

## Your responsibilities when deploying

- Supply your **own** Entra object IDs in the roles harness; do not rely on demo
  names in production.
- Keep `deployDemoProfiles=false` and, if you don't need the M365/bot identity,
  run in **demo mode** (no app registrations).
- Review the Entra app registrations and their consented Graph scopes before
  going live (see the deployment checklist).
- Rotate deploy-time secrets and restrict who can read the Container App secrets.

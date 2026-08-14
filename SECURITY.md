# Security

The Deal Room is an **Azure accelerator** built to be secure-by-default. This document
covers how to report a vulnerability. For the full control matrix, data sovereignty model,
and what a deploying firm is responsible for — the document written for a PE firm's
compliance review — see **[Security & compliance](docs/SECURITY-COMPLIANCE.md)**.

**Why it matters:** a deal room holds the fund's most sensitive material — live deal
terms, MNPI and confidential targets — so confidentiality, need-to-know access and a
clean audit trail aren't features, they're the point.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report it privately to the maintainers so it can be triaged and fixed
before disclosure:

- Use **GitHub → Security → Report a vulnerability** (private advisory), **or**
- Email the repository owner / your delivery contact directly.

Please include: a description, the affected component (orchestrator / teams-app /
infra / scripts), reproduction steps, and any suggested remediation. We aim to
acknowledge within a few business days.

## At a glance

- **Managed identity end-to-end** — no keys or connection strings in the running app.
- **Identity-aware RBAC**, resolved server-side — a client can never widen its own access.
- **Two hard agent classes** — internal-data agents can never reach the public web; the
  external-web agent can never read a deal record.
- **Demo profiles are for demonstrations only** — keep them off in production, where
  access is driven solely by the Entra object IDs you supply.

Full detail on all of the above: **[docs/SECURITY-COMPLIANCE.md](docs/SECURITY-COMPLIANCE.md)**.


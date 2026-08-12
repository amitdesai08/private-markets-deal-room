# Data handling — statement of current fact

Last verified: rev 4b, against the code in this commit. This file exists because a
compliance review asked for the position in writing rather than inferred from source, and
because an assurance that lives only in someone's memory is not an assurance.

If you change any of the behaviour below, change this file in the same commit.

## Microsoft Graph / M365

**No live-tenant Microsoft Graph connector is enabled in any deployed environment.**

- `app/lib/m365/graph.js` refuses to construct a client unless a client id, a client
  secret and a GUID-form tenant id are all present. Two separate call paths (`:72`,
  `:147`) throw rather than degrade.
- `app/lib/config.js` ships those three values empty. Nothing in `infra/` sets them.
- Consequently every M365 surface in the product — channel messages, the commitments
  feed, the "promises made in channels" card, calendar and mail context — is running on
  **seeded demo data**, not on any real tenant's content.
- The Teams applet posts to a channel only where one has been provisioned. No deal in the
  seeded set has one, so the composer explains itself rather than sending.
- `POST /api/deals/teams/ensure-all` would provision channels tenant-wide. It has
  deliberately never been run.

This is a statement about the *current* configuration, not a control. There is no code
that would prevent an operator from setting those three values. Before a live tenant is
connected, the items under "Not in place" below stop being theoretical.

## What is in place

- **Tiered access per deal.** `dealAccessLevel` returns `full` / `status` / `none`.
  Confidential deals are invisible — not redacted — to anyone outside the named team.
- **Status-tier redaction.** `applyStatusTier` (`app/lib/store.js`) strips the thesis, the
  per-lane workstream array, `diligenceProgress`, memo counts and compliance counts. A
  single overall `readiness` scalar survives deliberately; that is a decision, and it is
  recorded in the rev-4 appendix on `mockups/nav-ia.html`.
- **Region walls.** A region-restricted user cannot see an out-of-region deal at all.
- **View-as narrows only.** It can never elevate a capability the caller does not have.
- **Partner-only IC-gate override**, resolved server-side from the caller's identity, and
  failing shut for an unidentified caller. Tested in `app/test/accessControl.test.mjs`.
- **Write routes require a write-capable seat.** `/deals/:id/advance`, `/back` and
  `/back-stage` all check `canWrite` and resolve the actor server-side. Backwards moves
  are written to the activity log with an actor and a reason.

## What a deal team must be told on day one

Say this, in these words, before anyone opens it:

- **Nothing in this system is a committee decision.** The phase is read off the stage
  field. There is no minute, no attendee list and no approval terms behind any sentence
  that mentions the committee.
- **The activity log is not yet an audit trail.** See the list below.
- **Every finding, condition, memo section and figure is fabricated demo content.**
- **Pressing "generate" clears required items by writing them.** The gate cannot tell a
  filed document from a model output.
- **Do not export any of it to an LP, a lender, or counsel.**

## Not in place — and blocking a production deployment

These are unchanged from the previous review and are listed so that nobody has to
rediscover them.

1. **No actor on `recordEvent`.** The audit trail records what happened, not who did it.
2. **The event log is not append-only.** `app/lib/repo/index.js:149` exports
   `removeEvent`, and `app/lib/workiqMemory.js:88` calls it.
3. **No read, export or digest events.** Who looked at a deal, and who exported it, is not
   recorded at all — which is the specific question an insider-dealing enquiry asks.
4. **View-as is not stamped on anything.** An action taken while viewing as another role
   is indistinguishable from one taken normally.
5. **No restricted list and no wall-crossing log.** For a live take-private this is not
   optional.
6. **No DPIA, and no works-council consultation** for the M365 signals that would be
   ingested if a tenant were connected.
7. **`RESTRICTED_STAGE_RE` (`app/lib/userPolicy.js:287`) covers D/E/V stages only**, so an
   origination deal is `full` access for any in-region user, and the commitments feed will
   read its channel. That is policy-consistent with how the firm treats origination, but
   the policy has never been reviewed. It matters more since `dealPhase` made origination
   a first-class population on the home screen.
8. **`icPapers` is written by the seed pass and by nothing else.** A gate cleared by an
   unsourced boolean is worse than an open gate, because the open gate is visible. It must
   become a reference to a filed document — with a date and an author — before this is
   used to assert that a committee paper exists.

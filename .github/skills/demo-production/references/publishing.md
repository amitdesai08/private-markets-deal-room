# Publishing to an internal demo gallery (optional)

This repo's own recordings live in `docs/demos/media/` and are indexed by
`docs/demos/RECORDINGS.md` and `docs/DEMO-CENTER.md` — that alone is enough to ship a new track.
This file only applies if your team also maintains a separate internal gallery site that hosts
interactive click-throughs and recordings across multiple projects. Adapt the specifics to
whatever your team's actual gallery looks like; the pattern below is a description of one such
gallery, not a dependency of this repository.

## The general pattern

1. **One media bundle per project**, imported wholesale from this repo's `demo/build/` output
   folder into the gallery's own media storage under a project-specific id. Re-running the
   import with a "replace existing" flag after a rebuild keeps the gallery's copy in sync — the
   whole `demo/build/` folder can usually be imported as-is, since it already contains every
   `.html` player and `.mp4` alongside the JSON manifests and screenshots those players need.
2. **A catalog/index entry per project**, listing each demo's materials as an ordered array of
   resources — typically `{ type: 'interactive' | 'video', title, duration, src, poster? }` per
   asset. When one project accumulates many tracks (a PE track, a technical track, a business
   track, each with a walkthrough/lightning/runbook), consider:
   - **Labelling each resource by audience** in its title (e.g. "Technical audience — Full
     walkthrough") once there's more than one track, so a flat list stays legible.
   - **Grouping resources into named, collapsible sections** (Full Walkthrough / Runbook /
     Lightning Deck / whatever categories fit) once the flat list gets long — a simple approach
     that needs no new data model is to add a `group` string field to each resource and have the
     gallery's renderer emit a collapsible container whenever consecutive resources share a
     `group` value, defaulting the group containing the currently-open resource to expanded and
     collapsing the rest. This is presentation-only — it does not change how resources are
     addressed or routed, so existing deep links keep working.
3. **Validate before publishing** — a gallery with any kind of access gate almost always ships
   its own test suite (auth rules, config wiring); run it after any catalog/config edit, not
   just after a media re-import.
4. **Verify visually before publishing**, especially for structural changes to the catalog
   (grouping, reordering, relabeling) — serve the gallery's static assets locally (a plain
   static file server is usually enough; gallery frontends built to fetch their own auth state
   with a graceful "not signed in" fallback don't need a full auth emulator for a UI-only
   check) and click through the actual rendered page rather than only reading the diff.
5. **Publish, then commit the source change** (catalog/config edits) separately from the media
   re-import — the media itself is very likely to be gitignored in the gallery's own repo (it's
   usually large and regenerable from each source project's own `demo/build/`), so there may be
   nothing to commit there beyond the catalog/config file.

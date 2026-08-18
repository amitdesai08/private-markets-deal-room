# Scene manifest schema and capture.mjs step vocabulary

A scene manifest is a `demo/scenes-<name>.mjs` ES module exporting `BASE` (re-export from
`./scenes.mjs` unless you have a real reason to point elsewhere), `ACTS` (an array of
`{ n, title }` used purely for grouping in the generated docs/player), and `SCENES` (the array
that actually drives everything).

## Scene object shape

```js
{
  id: 'xx-00-kebab-case-id',      // unique across the whole manifest; used as the audio/screenshot filename
  act: 100,                        // must match an ACTS[].n
  title: 'One line, shown in the player nav',
  seat: 'partner',                 // a real persona key the product's seat switcher recognises
  keepBanner: true,                // OPTIONAL — see "dismissBanner" below
  steps: [ /* array of step objects, run in order — see vocabulary below */ ],
  spotlight: 'text:Some Fuzzy Match',   // OPTIONAL — draws a highlight box, does not click
  click: 'text:Button Label',           // OPTIONAL — draws a highlight box on something already clicked by a step
  say: `Multi-line narration prose. No presenter-instructions. Natural third-person
    voice describing the product, not the act of demoing it.`,
}
```

`say` gets whitespace-collapsed automatically; write it wrapped across multiple lines for your
own readability, it does not affect the narration.

## The exact step vocabulary (do not invent others)

`capture.mjs` throws `unknown step` for anything not in this list. Verified against the actual
`runStep()` switch statement — treat this as authoritative over any other doc, including older
copies of this note:

| Step | Argument | What it does |
|---|---|---|
| `goto` | a hash route, e.g. `'#/overview'` | Navigates to `${BASE}/?dr_as=${seat}${arg}` and waits for the app to finish loading |
| `wait` | milliseconds | Plain sleep |
| `waitText` | a string | Waits until `document.body.innerText` contains it |
| `scrollTop` | a number (usually `0`) | Scrolls the main scroll container to that offset |
| `scrollTo` | a string | Waits for an element containing that text to exist, then scrolls it into view |
| `clickText` | a string | Waits for a clickable element (button/a/[role=button]/[role=tab]/select/input) matching that text, then clicks it |
| `click` | a CSS selector | Clicks a `document.querySelector` match directly |
| `openDeal` | a company-name substring | Finds the deal row containing that text with its own "Open deal ▸" button and clicks it, then waits for the hash to become a `/deal/...` route |
| `selectSeat` | a seat/persona id | Drives the seat-switcher `<select>` and dispatches a real `change` event |
| `closeOverlay` | `true` | **Always navigates to `#/overview`** (Home) — see the warning below |
| `gotoConfidential` | `true` | Re-navigates to whatever deal URL an **earlier** `openDeal` step in the same run last opened — see the warning below |
| `dismissBanner` | `true` | Closes the "Now viewing as X" banner — runs automatically after every scene unless `keepBanner: true` is set on that scene |

### `capture.mjs` also auto-switches seat for you

Before running a scene's own `steps`, the runner checks `scene.seat !== state.seat` and, if
different, runs an implicit `selectSeat` first. An explicit `{ selectSeat: ... }` inside
`steps` that matches the scene's own `seat` field is therefore redundant but harmless (just an
extra ~3s wait) — keep it explicit anyway when the seat switch itself is the thing you're
narrating, so the step order in the script matches what's on screen.

### `gotoConfidential` — the ordering trap

`gotoConfidential` replays `state.lastDealUrl`, which is only set by a **prior** `openDeal`
step in the same capture run (state persists across scenes and seat switches within one run,
but not across separate `node demo/capture.mjs` invocations). The correct pattern, used
throughout the existing tracks, is two scenes:

```js
// Scene A — a seat that HAS access opens the confidential deal
{ id: 'a', seat: 'analyst', steps: [ { openDeal: 'Onyx' } ] },
// Scene B — a seat that does NOT have access tries the same URL directly
{ id: 'b', seat: 'admin', steps: [ { selectSeat: 'admin' }, { gotoConfidential: true } ] },
```

Calling `gotoConfidential` before any `openDeal` has run throws `no confidential deal URL was
captured earlier`.

### `closeOverlay` — the navigation trap

`closeOverlay` unconditionally navigates to `#/overview`. It is correct when you need to leave
a deal or a settings page back to Home before going somewhere else — it is **wrong** whenever
you need to stay inside a deal (for example, showing the Audit trail tab right after the
assistant drawer was open in the same deal). In that case just `clickText` the target directly:
the helper's `click()` is a direct DOM `.click()` call, which fires even if the element is
visually behind a drawer overlay, since it isn't a real mouse event that respects z-index.

## Verify the on-screen text before writing a `scrollTo`/`spotlight` spec

`byText()` matching is a case-insensitive **substring** match, but it requires the exact word
adjacency of the real rendered text — "needs attention" is not a substring of the real heading
"What **needs my** attention", for example. Before writing any `scrollTo`, `spotlight`, or
`clickText` spec:

1. Grep the actual frontend source (`.tsx` files) for the literal heading/button text, not the
   prose in a markdown doc describing it — docs paraphrase, source code doesn't.
2. Check whether the element you're targeting is conditionally rendered. Some panels only
   render when matching data already exists in the live environment (a common pattern: `if
   (!items.length) return null` on a whole section). If the thing you want to show requires
   data that isn't guaranteed to exist in the live/demo environment, either verify it's there
   first, or retarget the scene at something that's always rendered (e.g. a form or a static
   explanatory panel) and narrate the underlying concept over that screen instead.
3. If the live deployment's code might be behind the repo's `main` branch (a real risk if the
   feature was recently added), fetch the deployed JS bundle and grep it for a distinctive
   string from the feature before writing a scene that depends on it. If it's missing, either
   get the environment redeployed or narrate the concept over an existing, working screen.

## `screenshot`/`spotlight`/`click` boxes only draw — they don't act

`spotlight` and `click` on a scene object are purely for the generated player's highlight
overlay. They resolve the same way capture.mjs resolves any `text:` spec, and `spotlight` grows
the match up to its containing "panel" (bounded by the scroll container, capped so it doesn't
swallow the whole page). Neither of them causes a click; if you need to actually interact with
the element, that has to be a step in `steps`, not just the `spotlight`/`click` field.

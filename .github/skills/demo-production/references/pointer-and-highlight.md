# Pointer and highlight — a scripted demo, not a wandering cursor

## The rule everything else follows

**A highlight and a pointer are different instruments, and conflating them is what makes a
recorded demo feel synthetic.**

- The **highlight** is the narrator's emphasis. It can frame anything worth looking at — a
  panel, a paragraph, a badge, a row.
- The **pointer** is somebody's hand. It goes where a hand would go: a control being used, an
  item being singled out from identical siblings, something you would open. Nothing else.

A person does not drag their mouse to the middle of a paragraph they are reading aloud. Move
the cursor to every highlight and the demo still reads as mechanical, even when each move is
individually justifiable.

**The win condition is mimicking human interaction. It is not a number of gestures.** Counting
them is how you end up back at a busy cursor with better excuses. A five-minute demo with four
deliberate pointer moves and a dozen highlight-only moments is richer than one with twenty
moves, because each of the four means something.

## Rest is the default state

A scene with nothing to point at rests. That is not a gap to be filled.

Three mechanisms are worth naming because they are individually reasonable and collectively
disastrous — each was written to solve a real problem and together they produced exactly the
"cursor wandering for no reason" complaint:

1. **A page tour** for scenes with no cue — hunting the DOM for anything that would repaint and
   hovering it in sequence, usually invented to stop the screencast going quiet.
2. **Idle drift** — nudging the pointer a few pixels every second so it "looks alive".
3. **A settle-back glide** — using up leftover scene time by returning to the last region.

Delete all three. Frames going quiet is correct (see `motion-capture.md`); it is not a problem
to be worked around.

Give a cue-less scene one park position — low and to one side, out of the reading area — and
have it move there once and stay. Guard the move with a distance check so consecutive resting
scenes do not re-park.

## One script drives both

The pointer and the highlight must come from a single source, or they will disagree on screen:

```
cue phrases (a phrase per region, per scene)
   → resolved against the REAL per-word timestamps from speech synthesis
plan file: { cues: { scene: [seconds] }, points: { scene: [indices] } }
   → capture moves the pointer at those seconds and records the moment
   → the video build draws the highlight from those same recorded moments
```

`cues` says *when* each region is spoken about. `points` says which of those the **hand** takes
part in; everything else is highlight-only and the cursor does not move at all. Keeping `points`
short is the whole point of separating them.

Cue times are **narration-relative**, which makes them survive a script edit: re-resolve the
phrase against the new word timings and both instruments follow.

## Positional alignment — cue *i* binds to region *i*

This is the most dangerous property in the design, because breaking it produces working
choreography aimed at the wrong things.

- **Never compact the region list.** Filtering out an unusable region renumbers everything
  after it and silently re-aims every later cue.
- An unresolvable selector **holds its place as null** and is reported by name.
- A region that is deliberately cued elsewhere gets a **null phrase**, not a missing entry.

Add an alignment check to the pipeline: for each scene, assert `regions == phrases == resolved
times`. It costs nothing and catches the case where someone adds a region and forgets its
phrase.

## Cue timing — three traps, all of which cost a capture cycle

1. **Measure elapsed on the clip's clock, not the choreography's own start.** Cue times are
   relative to the start of the clip. Any scene whose setup runs on camera will otherwise fire
   every highlight late by exactly the setup duration — 11s and 12s in two real cases, landing
   well after the narration had moved on.
2. **Release overdue cues in sequence.** If a scene's setup overruns its own early cues, they
   all become due at once and fire simultaneously: two highlights on screen instead of one
   moving to the next. Enforce a minimum gap — `max(cueTime, lastMark + 1.5)`.
3. **Fixed `wait:` steps are usually the real culprit.** In one measured case a scene had
   `wait 4000` and `wait 3000` between a state change and the choreography starting: seven
   seconds of stopwatch for work that took under one. Replacing them with conditions (`waitJs`
   on something that has to become true) took setup from 12.2s to 6.2s and the first cue's lag
   from +8.2s to +2.4s.

A healthy first-cue lag is about **−0.4s** — the deliberate lead, the pointer arriving just
before the phrase. A large *negative* lag is normal on scenes with a real click: the click's
own highlight precedes the spoken cue.

## Highlights move; they do not multiply

Give every highlight a dwell, then **truncate each at the start of the next**. Without this,
consecutive highlights overlap and two boxes appear at once. On a control that shifts position
between them, that reads as one box split across two things.

### A control that changes shape needs two measurements

A selector's text and its geometry do not change at the same time. Setting a `<select>`'s value
updates its text immediately; the surrounding layout only shifts when the component re-renders,
often half a second later. One rect cannot fit both states.

Three capabilities make this correct, and all three are generally useful:

- **`point`** — glide the pointer to a target and record the highlight, *during setup*. Without
  it, a change the narration attributes to a control can never be pointed at before it happens,
  because the choreography only starts once setup is done.
- **`clearHighlight`** — end the current highlight at an exact moment. Needed because the text
  changes before the layout does: the old box must come off when the *name* changes, not when
  the *layout* settles. A brief gap with no box is much better than a box around the wrong
  thing.
- **`waitMoved`** — wait until the target's own geometry changes. Text-based repaint signals
  are guesses about which words survive a re-render; in one case the chosen phrase persisted
  after the change and the wait timed out. Asking the element directly cannot be fooled that
  way.

Sequence for a control whose contents change (`<control>` is whatever selector names it):

```js
{ point: '<control>' },           // highlight state A, cursor arrives
{ wait: 1100 },                   // long enough to be read, not a blink
{ changeSomething },
{ clearHighlight: true },         // the instant the text changes
{ waitMoved: '<control>' },       // the layout has now settled
{ highlight: '<control>' },       // state B, measured on the new geometry
```

Without the deliberate hold, the first highlight lasted 0.26s — a flicker nobody can read.

## Size floors reject real targets

A guard against degenerate rects from half-resolved selectors is worth having, but set it at
**16px**, not 40. A dropdown, a badge or a chip is legitimately about 30px tall. A 40px floor
silently dropped the highlight on the exact control a scene existed to demonstrate — and it did
so in *two* places, so fixing one and re-testing showed no change and looked like a different
bug.

## Targeting vocabulary

| Form | Behaviour | Use for |
|---|---|---|
| `.css-selector` | exact, no growth | anything with a stable class |
| `text:some words` | smallest element containing the text, then **grown** to the enclosing card | a section or panel |
| `exact:some words` | smallest element containing the text, **no growth** | a chip, badge or control |
| `in:.row@some text` | the one element matching the selector whose text contains that text | one item among identical siblings |

Two cues inside the same card need `exact:`, or growth makes both frame the same box.

## Verify regions against a run that executes the scene's interactions

A screenshot-only pass does not run the scene's `perform` steps. A region verified there may
not exist when the real capture measures it — one scene's target was a list row, but its own
`perform` opens a deal, so by resolution time the list was gone. The screenshot taken at the
end of the scene showed the list again (the route is restored afterwards), which made the
selector look correct.

Ground selectors in the state the capture is actually in when it measures them.

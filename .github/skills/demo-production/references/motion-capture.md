# Motion capture — recording a product being used, not screenshots of it

## What this changes

A demo built from still screenshots reads as a slide deck with a voice over it, however good
the narration is. Recording the browser while the scene is driven produces a clip per scene:
the page scrolls, a panel opens, an answer streams in, a list narrows. The narration then
describes something the viewer is watching happen rather than something they are being told
about.

The mechanism is CDP's `Page.startScreencast`, which delivers JPEG frames from the page's own
render surface. It is not a screen recording — other windows, notifications and the OS cursor
are not in it, which is exactly what you want.

## The one fact that explains most of the surprises

**Frames arrive only when the page actually changes.** A scene where the presenter is talking
over a still screen legitimately produces two or three frames across thirty seconds. That is
correct behaviour and the strongest available evidence that the choreography is calm.

Consequences to internalise before debugging anything:

- **A low frame count is not a bug.** Check the clip's DURATION against the scene's narration
  length, never the frame count. A scene going from 170 frames to 4 after a choreography
  rework is the screencast confirming the screen stopped churning.
- **A clip's length cannot come from frame arrivals.** It has to be imposed.
- **A resting pointer produces no frames at all.** Moving the mouse over inert space changes
  nothing on screen.

## Clip length must equal the scene's narration length

Every clip is built to a target: `LEAD_IN_SILENCE + narration seconds + HOLD_AFTER_NARRATION`.
Get this wrong and the video build compensates by playing the clip fast to fit, which produces
visibly hurried motion — the exact fault that motion capture was supposed to remove.

Derive the target from the **real per-word timestamps** the speech engine returns, not from an
estimate. Export it alongside the cue times into a plan file the capture reads.

### Budget the scene on the recording clock, not the wall clock

Long waits (an assistant composing an answer, a slow first load) should be cut from the
recording — stop the screencast, wait, restart it — so the finished demo does not contain
forty seconds of a spinner. That means two different clocks exist:

- **wall time** — how long the run took
- **recording time** — wall time minus everything cut

Anything that decides how much scene is left must use recording time. Using wall time charges
the scene for seconds that never reach the clip and ends the choreography early, leaving a clip
shorter than the narration it has to carry.

## Where a clip should start

Default: **after** the scene's setup steps. Setup length varies with how slow the screen was
that run, and it is not content — left in, every clip is a different length for reasons
unrelated to the story.

Exception: a scene **whose point is the change itself** — a control being operated, a filter
being applied, a list narrowing in response. For those the clip must start *before* the steps,
or it opens on the aftermath and the narration describes something already done. Make this an
explicit per-scene opt-in, and make sure the cue clock and the budget both agree with it.

## The encoder will lie to you. Make it check itself.

Assembling frames with ffmpeg's concat demuxer is the obvious approach and it has three
separate traps, each of which silently produces a clip whose length disagrees with its
timeline. All three were found by measuring, none by reading documentation.

1. **The last entry's `duration` is ignored.** A list of `5s, 3s, 20s` encodes as 8.04s. The
   standard workaround — repeat the final file as an extra entry — is not optional.
2. **A long final hold is dropped even so.** A list of `[0.04, 0.27, 0.05, 8.18]` encoded as
   0.68s: the short frames were honoured and the eight-second hold vanished. Four equal 2s
   durations encoded correctly, so it is the long tail specifically.
3. **`-r 30` inflates the result.** Forcing a constant output rate over long holds turned a
   28.04s timeline into 32.97s.

**The fix is to stop asking the demuxer to hold the last frame at all.** Clone it and set the
length explicitly:

```
ffmpeg -f concat -safe 0 -i list.txt \
  -vf "tpad=stop_mode=clone:stop_duration=<target>,fps=30" -t <target> \
  -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p out.mp4
```

Accurate to a single frame regardless of what the demuxer does with the tail.

**And have the encoder probe its own output**, comparing the encoded duration to the timeline
it was handed and reporting any disagreement over a second. Return the *measured* duration,
not the computed one — that number is used downstream to map the pointer track onto the clip,
so a clip that is secretly nine seconds longer than the code believes will misplace every
pointer sample.

## Timing a pointer track onto a clip

If nothing is capped or resampled, clip time equals recording time and converting a pointer
timestamp is just subtracting the clip's start. Resist any scheme that compresses idle
stretches and then remaps the track to compensate: it works only while every assumption holds,
and when one stops holding the failure is a cursor drifting away from what it is pointing at,
with nothing in any log to say so.

## When a clip overruns, look at the pointer track before re-capturing

A clip longer than its narration is either real content or a dead tail. The pointer track tells
you which in one line: if the last sample is well before the clip's end, the excess is a static
hold and can simply be trimmed —

```
ffmpeg -i clip.mp4 -t <narration length + 0.3> ... out.mp4
```

— guarded by asserting the track's last timestamp falls before the cut. The video build re-pads
short clips by cloning the last frame, so trimming is safe and costs nothing. Two scenes that
had overrun identically across three separate captures were fixed this way in seconds; a
fourth re-capture would have produced the same overrun again.

## Verification that actually catches things

Run this after every capture. Each column has caught a real defect that reported `ok`:

| Check | What a failure means |
|---|---|
| clip duration ÷ narration length | >1.1 means the build will play it fast |
| same ratio <0.9 | frames were dropped; content will play too fast then freeze |
| pointer track first/last timestamp | a track spanning 0.1s of a 30s clip means the time conversion is broken |
| min/max pointer coordinates | outside the app's area means the wrong coordinate space |
| highlight count vs cue count | a region silently failed to resolve |

Then extract a frame at a cue time and look at it. Numbers confirm the timeline; only a frame
confirms the box is around the right thing.

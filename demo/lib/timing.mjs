// The silence held after each scene's narration before the cut to the next one, and the
// beat of silence after the cut before the next scene starts speaking. Shared so the video,
// the caption timings and the audio-description track all use the same beats — if they
// drift apart, captions land against the wrong scene later in the video.
//
// The lead-in is what stops one section running straight into the next: without it the cut
// and the next line of narration happen on the same frame, which reads as continuous speech
// over changing pictures rather than as separate points.
export const HOLD_AFTER_NARRATION = Number(process.env.DEMO_HOLD_SECONDS || 1.4);
export const LEAD_IN_SILENCE = Number(process.env.DEMO_LEAD_SECONDS || 0.7);

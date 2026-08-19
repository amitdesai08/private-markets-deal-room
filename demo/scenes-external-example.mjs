// TEMPLATE for capturing an EXTERNAL target — a resource the user built themselves (a
// Foundry deployment, an ADF pipeline, any other Azure UI), not The Deal Room. Copy this
// file, fill in TARGET.baseUrl and real scenes, then run:
//
//   DEMO_HEADED=1 node demo/capture.mjs --scenes scenes-external-example.mjs --manifest scenes-external-example.json
//   node demo/narrate.mjs --manifest scenes-external-example.json
//   node demo/build-player.mjs --manifest scenes-external-example.json --out external-example.html
//
// The first run pauses for you to sign in in the opened browser window (see
// ../.github/skills/demo-production/references/external-resource-access.md for the access
// decision this assumes you've already made); later runs against the same TARGET.baseUrl
// reuse that session from demo/.external-profile/ (git-ignored) unless it has expired.
//
// Only the generic step vocabulary works here: goto, wait, waitText, scrollTo, scrollTop,
// clickText, click. Deal Room-only steps (selectSeat, openDeal, dismissBanner,
// gotoConfidential, closeOverlay) throw immediately if used — there is no seat, no demo
// mode, no "viewing as" banner on an external resource's own UI.

export const TARGET = {
  kind: 'external',
  // The resource's own UI, e.g. an Azure AI Foundry project's Studio URL or an ADF Studio
  // deep link. `goto` steps below are resolved against this unless they're already an
  // absolute URL.
  baseUrl: 'https://ai.azure.com/build/overview?wsid=/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<name>/projects/<project>',
  // Uncomment to use a specific persistent profile directory instead of the default
  // (demo/.external-profile/<slug of baseUrl>):
  // profileDir: 'C:/Users/you/.dealroom-demo-profiles/my-foundry-project',
  // Uncomment if the session is already known-good and you want to skip the pause:
  // skipSignInPause: true,
};

export const ACTS = [
  { n: 100, title: 'Overview' },
];

export const SCENES = [
  {
    id: 'ext-01-overview',
    act: 100,
    title: 'Project overview',
    steps: [
      { goto: '' }, // TARGET.baseUrl itself; use a relative path for a different page
      { waitText: 'Overview' },
    ],
    say: `This is the project's own overview page, captured live — not a mock-up.`,
  },
];

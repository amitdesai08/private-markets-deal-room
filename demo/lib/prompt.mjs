// A minimal "press Enter to continue" gate — used only by external-target captures, which
// need a human to complete a real sign-in in the opened browser before capture proceeds.
// Deliberately not automatable: a scripted login is exactly the credential-handling risk
// ../.github/skills/demo-production/references/external-resource-access.md warns against.

import { createInterface } from 'node:readline/promises';

export async function waitForEnter(message) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question(`\n${message}\nPress Enter here once you're signed in and ready... `);
  } finally {
    rl.close();
  }
}

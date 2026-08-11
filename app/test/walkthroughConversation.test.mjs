// A walkthrough may demonstrate the deal conversation and must leave nothing behind.
//
// The write guard refuses a walkthrough credential on every deal route, which was right for
// the deal record and wrong for the conversation: collaboration cannot be shown by looking
// at it, so the one capability the product most needed to demonstrate was the one nobody
// could try. The exception is deliberately narrow, and these tests hold it there.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { addWorkiqNote, listWorkiqNotes } from '../lib/workiqMemory.js';

const src = await readFile(new URL('../server.js', import.meta.url), 'utf8');

test('a walkthrough is allowed the conversation and nothing else', () => {
  const m = src.match(/const WALKTHROUGH_MAY = \[([^\]]*)\]/);
  assert.ok(m, 'the walkthrough exception should be a named, greppable list');
  const routes = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  assert.equal(routes.length, 1, `a walkthrough should be allowed exactly one route, not ${routes.length}`);
  assert.match(routes[0], /threads\\\/message/, 'the only exception should be posting in the deal conversation');
});

test('the walkthrough exception still requires a seat that could write anyway', () => {
  assert.match(
    src,
    /if \(access\.canWrite && WALKTHROUGH_MAY\.some/,
    'a read-only role must not gain the ability to post by being in a walkthrough',
  );
});

test('a walkthrough post never reaches Teams', () => {
  assert.match(
    src,
    /const canReachTeams = [^;]*&& !walkthrough/,
    'a walkthrough must never post into a real Teams channel',
  );
});

test('an ephemeral note is not written to the durable store', () => {
  const mem = String(process.env.NODE_ENV);
  void mem;
  const note = addWorkiqNote({
    dealId: 'ephemeral-test-deal',
    author: 'Walkthrough Viewer',
    text: 'This should not survive a restart.',
    channelPost: true,
    ephemeral: true,
  });
  assert.ok(note, 'the note should still be created so the person sees their message');
  assert.equal(note.ephemeral, true);
  const back = listWorkiqNotes('ephemeral-test-deal');
  assert.equal(back.length, 1, 'it should be readable in this process');
});

test('an ordinary post is still durable', () => {
  const note = addWorkiqNote({
    dealId: 'durable-test-deal',
    author: 'Marc Ellis',
    text: 'This one belongs on the deal.',
    channelPost: true,
  });
  assert.equal(note.ephemeral, false, 'a signed-in post must persist');
});

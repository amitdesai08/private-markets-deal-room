// A deal's conversation must always be answerable by someone who can write on the deal.
//
// The original design made posting conditional on a delegated Microsoft 365 token. That is
// the right guard for TEAMS — the app must never put words in someone's mouth in a channel
// it is not authorised to speak in — but it was applied to the whole act of speaking, so on
// any day M365 was not connected the deal's own conversation was readable and could not be
// answered. These tests pin the split: speaking is governed by deal access, reaching Teams
// is governed by the Graph token, and the reader is always told which one happened.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildThreads } from '../lib/dealDesk.js';

const deal = { id: 'd1', company: 'Lumen Analytics', issues: [] };

const channel = {
  name: 'Lumen — Deal Room',
  messages: [
    { from: 'Priya Raman', created: '2026-01-01T09:00:00.000Z', text: 'Diligence pack is up.' },
  ],
};

function post(over = {}) {
  return {
    id: 'wiq-1',
    dealId: 'd1',
    author: 'Marc Ellis',
    personaLabel: 'Partner',
    text: 'Pushing the lender call to Thursday.',
    createdAt: '2026-01-02T09:00:00.000Z',
    channelPost: true,
    postedToTeams: false,
    ...over,
  };
}

function warRoom(out) {
  return out.threads.find((t) => t.id === 'war-room');
}

test('a message posted in the Deal Room appears in the deal conversation', () => {
  const out = buildThreads(deal, { channel, notes: [post()] });
  const room = warRoom(out);
  assert.ok(room, 'the deal conversation should exist');
  const mine = room.messages.find((m) => m.text.includes('lender call'));
  assert.ok(mine, 'the posted message should be in the conversation, not a separate list');
  assert.equal(mine.from, 'Marc Ellis');
});

test('the conversation is in time order regardless of where each message came from', () => {
  const early = post({ id: 'wiq-early', createdAt: '2025-12-01T09:00:00.000Z', text: 'Earliest.' });
  const out = buildThreads(deal, { channel, notes: [post(), early] });
  const at = warRoom(out).messages.map((m) => m.at);
  const sorted = [...at].sort();
  assert.deepEqual(at, sorted, 'messages should read oldest to newest');
});

test('a message that stayed in the Deal Room is labelled as such', () => {
  const out = buildThreads(deal, { channel, notes: [post({ postedToTeams: false })] });
  const mine = warRoom(out).messages.find((m) => m.text.includes('lender call'));
  assert.equal(mine.via, 'deal-room', 'a reader must be able to tell this is not in Teams');
});

test('a message that reached Teams is not labelled Deal Room only', () => {
  const out = buildThreads(deal, { channel, notes: [post({ postedToTeams: true })] });
  const mine = warRoom(out).messages.find((m) => m.text.includes('lender call'));
  assert.equal(mine.via, 'teams');
});

test('messages read from the channel are marked as living in Teams', () => {
  const out = buildThreads(deal, { channel, notes: [] });
  assert.equal(warRoom(out).messages[0].via, 'teams');
});

test('a conversation post is not also filed as its own workstream thread', () => {
  const out = buildThreads(deal, { channel, notes: [post()] });
  const dupes = out.threads.filter((t) => t.id.startsWith('note-d1'));
  assert.equal(dupes.length, 0, 'showing a person their own post twice is a bug, not a feature');
});

test('an ordinary saved note is still filed as a workstream thread', () => {
  const note = post({ id: 'wiq-2', channelPost: false, text: 'Tech diligence: no blockers found.' });
  const out = buildThreads(deal, { channel, notes: [note] });
  const lanes = out.threads.filter((t) => t.id.startsWith('note-d1'));
  assert.equal(lanes.length, 1, 'saved conclusions keep their existing home');
});

test('a deal with no channel still has a conversation once someone posts', () => {
  const out = buildThreads(deal, { channel: null, notes: [post()] });
  const room = warRoom(out);
  assert.ok(room, 'the first message should open the conversation');
  assert.equal(room.messages.length, 1);
});

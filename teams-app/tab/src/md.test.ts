import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMarkdown } from './md.ts';

test('renders underscore-delimited assistant emphasis without visible markers', () => {
  assert.equal(renderMarkdown('_Important answer_'), '<p><em>Important answer</em></p>');
});

test('preserves underscores inside identifiers', () => {
  assert.equal(renderMarkdown('Use deal_room_id.'), '<p>Use deal_room_id.</p>');
});
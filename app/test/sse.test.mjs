// A CHUNK BOUNDARY CAN FALL ANYWHERE.
//
// This is the part of streaming that gets written wrong when it is written in a hurry: the
// network hands you bytes, not lines, and a JSON payload can arrive split across two
// reads — or across five. A parser that assumes each chunk is a whole frame works
// perfectly against a fast local mock and drops tokens in production, which is the worst
// possible failure shape because the answer merely looks slightly wrong.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSseParser, readResponseStream, consumeSse, sseFrame } from '../lib/sse.js';

const collect = () => { const seen = []; return { seen, parser: createSseParser((e) => seen.push(e)) }; };

test('a frame split across chunks is still read once, whole', () => {
  const { seen, parser } = collect();
  const frame = sseFrame({ type: 'response.output_text.delta', delta: 'hello world' });
  // One byte at a time — the worst case, and the one a mock never produces.
  for (const ch of frame) parser.push(ch);
  parser.end();
  assert.equal(seen.length, 1, `expected one event, got ${seen.length}`);
  assert.equal(seen[0].delta, 'hello world');
});

test('several frames arriving in one chunk are all read', () => {
  const { seen, parser } = collect();
  parser.push([
    sseFrame({ type: 'response.output_text.delta', delta: 'a' }),
    sseFrame({ type: 'response.output_text.delta', delta: 'b' }),
    sseFrame({ type: 'response.output_text.delta', delta: 'c' }),
  ].join(''));
  parser.end();
  assert.deepEqual(seen.map((e) => e.delta), ['a', 'b', 'c']);
});

test('a chunk boundary inside the JSON payload loses nothing', () => {
  const { seen, parser } = collect();
  const frame = sseFrame({ type: 'response.output_text.delta', delta: 'the entry multiple is 8.3x' });
  const cut = Math.floor(frame.length / 2);
  parser.push(frame.slice(0, cut));
  parser.push(frame.slice(cut));
  parser.end();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].delta, 'the entry multiple is 8.3x');
});

test('a payload containing a newline survives, because the wire escapes it', () => {
  const { seen, parser } = collect();
  parser.push(sseFrame({ type: 'response.output_text.delta', delta: 'line one\nline two' }));
  parser.end();
  assert.equal(seen[0].delta, 'line one\nline two');
});

test('comments, blank lines and a terminator are not mistaken for data', () => {
  const { seen, parser } = collect();
  parser.push(': keep-alive\n\n');
  parser.push('\n');
  parser.push(sseFrame({ type: 'response.output_text.delta', delta: 'x' }));
  parser.push('data: [DONE]\n\n');
  parser.end();
  assert.equal(seen.filter((e) => e.type === 'response.output_text.delta').length, 1);
  assert.equal(seen.filter((e) => e.type === 'done').length, 1);
});

// A truncated frame is what a dropped connection looks like. It must not throw — the
// caller has already shown the reader everything that arrived and should keep it.
test('a truncated final frame is dropped rather than thrown', () => {
  const { seen, parser } = collect();
  parser.push('data: {"type":"response.output_text.delta","del');
  assert.doesNotThrow(() => parser.end());
  assert.equal(seen.length, 0);
});

test('a frame with no trailing newline is still read at the end', () => {
  const { seen, parser } = collect();
  parser.push('data: {"type":"response.output_text.delta","delta":"tail"}');
  parser.end();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].delta, 'tail');
});

test('deltas accumulate and the completed response is handed back', () => {
  let text = '';
  let final = null;
  const events = [
    { type: 'response.output_text.delta', delta: 'Recommendation: ' },
    { type: 'response.output_text.delta', delta: 'Hold.' },
    { type: 'response.completed', response: { id: 'resp_123' } },
  ];
  for (const e of events) readResponseStream(e, { onDelta: (d) => { text += d; }, onDone: (r) => { final = r; } });
  assert.equal(text, 'Recommendation: Hold.');
  assert.equal(final.id, 'resp_123');
});

test('an unrelated event type is ignored rather than treated as text', () => {
  let text = '';
  readResponseStream({ type: 'response.in_progress' }, { onDelta: (d) => { text += d; } });
  readResponseStream({ type: 'response.output_item.added', item: { type: 'message' } }, { onDelta: (d) => { text += d; } });
  assert.equal(text, '');
});

// consumeSse is what actually runs against the network, so it is tested against a body
// that hands out awkward chunks rather than tidy frames.
test('consumeSse reads a body delivered in awkward chunks', async () => {
  const frames = [
    sseFrame({ type: 'response.output_text.delta', delta: 'one ' }),
    sseFrame({ type: 'response.output_text.delta', delta: 'two ' }),
    sseFrame({ type: 'response.completed', response: { id: 'r1' } }),
  ].join('');
  const bytes = new TextEncoder().encode(frames);
  let i = 0;
  const resp = {
    body: {
      getReader: () => ({
        read: async () => {
          if (i >= bytes.length) return { done: true };
          // 7 bytes at a time, which will land mid-payload repeatedly.
          const slice = bytes.slice(i, i + 7);
          i += 7;
          return { done: false, value: slice };
        },
      }),
    },
  };
  let text = '';
  let final = null;
  await consumeSse(resp, (e) => readResponseStream(e, { onDelta: (d) => { text += d; }, onDone: (r) => { final = r; } }));
  assert.equal(text, 'one two ');
  assert.equal(final.id, 'r1');
});

test('consumeSse falls back when the body cannot be streamed', async () => {
  const frames = sseFrame({ type: 'response.output_text.delta', delta: 'buffered' });
  const resp = { arrayBuffer: async () => new TextEncoder().encode(frames) };
  let text = '';
  await consumeSse(resp, (e) => readResponseStream(e, { onDelta: (d) => { text += d; } }));
  assert.equal(text, 'buffered');
});

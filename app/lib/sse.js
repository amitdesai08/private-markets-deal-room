// Server-sent events, parsed once.
//
// Both the orchestrator and the deal chat need to read a streamed Responses API reply, and
// both the tab host and the browser need to read the stream we then emit. That is four
// places, which in this codebase has reliably meant four slightly different parsers and
// one bug per surface. This is the parser; everything else calls it.
//
// The wire format is `data: <json>` lines separated by blank lines, and a chunk boundary
// can fall anywhere — including inside a JSON payload or between the `data:` and its
// newline. Buffering until a complete line arrives is the whole job, and it is the part
// that gets written wrong when it is written in a hurry.

// Feed it chunks; it calls back with each parsed event.
export function createSseParser(onEvent) {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk;
      // Only consume up to the last newline; whatever follows is a partial line.
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        if (!line || line.startsWith(':')) continue;
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') { onEvent({ type: 'done' }); continue; }
        try { onEvent(JSON.parse(payload)); } catch { /* a half-written frame is not an error */ }
      }
    },
    // Anything left without a trailing newline. Some servers end without one.
    end() {
      const line = buffer.trim();
      buffer = '';
      if (!line.startsWith('data:')) return;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      try { onEvent(JSON.parse(payload)); } catch { /* ignore a truncated tail */ }
    },
  };
}

// The Responses API emits many event types; these are the two that matter. Text arrives as
// `response.output_text.delta`, and the finished object (which carries the id we need for
// conversation continuity) arrives on `response.completed`.
export function readResponseStream(event, { onDelta, onDone } = {}) {
  const t = event?.type;
  if (t === 'response.output_text.delta' && typeof event.delta === 'string') {
    if (onDelta) onDelta(event.delta);
    return;
  }
  if (t === 'response.completed' || t === 'response.incomplete') {
    if (onDone) onDone(event.response || null);
  }
}

// Read a whole fetch Response body as a stream of parsed SSE events.
export async function consumeSse(resp, onEvent) {
  const parser = createSseParser(onEvent);
  const decoder = new TextDecoder();
  const reader = resp.body?.getReader?.();
  if (!reader) {
    // No streaming body available (a mock, or a proxy that buffered it). Treat the whole
    // payload as one chunk rather than failing — the events are the same either way.
    parser.push(decoder.decode(await resp.arrayBuffer()));
    parser.end();
    return;
  }
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.end();
}

// Format one event for the browser. Same shape in both directions so the client parser is
// the one above.
export function sseFrame(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

import test from 'node:test';
import assert from 'node:assert/strict';

import { startupProbeCandidates } from '../lib/connectors.js';

test('startup probes only enabled, configured, testable connectors', () => {
  const candidates = startupProbeCandidates([
    { id: 'ready', enabled: true, configured: true, testable: true },
    { id: 'disabled', enabled: false, configured: true, testable: true },
    { id: 'unconfigured', enabled: true, configured: false, testable: true },
    { id: 'unwired', enabled: true, configured: true, testable: false }
  ]);

  assert.deepEqual(candidates.map((connector) => connector.id), ['ready']);
});
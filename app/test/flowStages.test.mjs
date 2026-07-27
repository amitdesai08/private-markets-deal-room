// Guards the "knock a deal back a stage" primitives (data/flow.js). These pure,
// positional helpers decide where a stage knock-back lands: prevStageId finds the
// stage before the one owning a step, and firstStepKeyOfStage picks that stage's
// entry step. regressDealStage (lib/store.js) is just: firstStepKeyOfStage(prevStageId(stage)).

import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, prevStageId, firstStepKeyOfStage } from '../data/flow.js';

test('firstStepKeyOfStage returns each stage’s entry step in flow order', () => {
  assert.equal(firstStepKeyOfStage('origination'), 'O1');
  assert.equal(firstStepKeyOfStage('diligence'), 'D1');
  assert.equal(firstStepKeyOfStage('execution'), 'E1');
  assert.equal(firstStepKeyOfStage('ownership'), 'V1');
  assert.equal(firstStepKeyOfStage('not-a-stage'), null);
});

test('prevStageId is null in the first stage and the immediate predecessor otherwise', () => {
  // First stage — nothing to knock back to.
  assert.equal(prevStageId('O1'), null);
  assert.equal(prevStageId('O4'), null);
  // Each later step maps back to the previous stage.
  assert.equal(prevStageId('D1'), 'origination');
  assert.equal(prevStageId('D5'), 'origination');
  assert.equal(prevStageId('E1'), 'diligence');
  assert.equal(prevStageId('V3'), 'execution');
  // Unknown / pre-launch (e.g. screened "SCR") pseudo-stages are a safe no-op.
  assert.equal(prevStageId('SCR'), null);
  assert.equal(prevStageId(''), null);
});

test('a knock-back lands on the previous stage’s first step (the store composition)', () => {
  const landing = (stepKey) => {
    const prev = prevStageId(stepKey);
    return prev ? firstStepKeyOfStage(prev) : null; // null => no-op
  };
  assert.equal(landing('D2'), 'O1');   // mid-diligence -> start of origination
  assert.equal(landing('E2'), 'D1');   // mid-execution -> start of diligence
  assert.equal(landing('V2'), 'E1');   // mid-ownership -> start of execution
  assert.equal(landing('O2'), null);   // already in the first stage -> no-op
});

test('the stage order used by knock-back matches the canonical flow', () => {
  assert.deepEqual(STAGES.map((s) => s.id), ['origination', 'diligence', 'execution', 'ownership']);
});

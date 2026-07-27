// Playbook templates are the firm's blank kickoff SKELETONS, not per-deal files.
// buildWorkspace() must NOT fabricate a per-file SharePoint link for them — such a
// path 404s because provisioning creates the VDR folders, not these files. This
// guards the regression where "Playbook templates" showed 404 file-not-found.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkspace } from '../data/workspace.js';

test('playbook templates carry no fabricated per-file link', () => {
  const ws = buildWorkspace({ id: 'proj-atlas', company: 'Atlas Foods', targetICDate: '2026-09-01' });
  assert.ok(Array.isArray(ws.templates) && ws.templates.length > 0, 'templates should be present');
  for (const t of ws.templates) {
    assert.equal(t.url, undefined, `template "${t.name}" must not deep-link to a fabricated file`);
    assert.ok(t.name && (t.type || t.ext), 'template keeps its descriptor (name + type)');
  }
});

test('data-room folders still carry a link (they are real once provisioned)', () => {
  const ws = buildWorkspace({ id: 'proj-atlas', company: 'Atlas Foods' });
  assert.ok((ws.folders || []).every((f) => typeof f.url === 'string'), 'folders keep a url');
});

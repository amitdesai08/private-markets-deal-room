// IC deck (PowerPoint) generation — prove the dependency-free PPTX writer produces a
// valid, non-trivial OOXML package with one slide per section, from the live deal +
// its decision artifacts. Guards against OOXML regressions in lib/m365/pptx.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildIcDeckPptx } from '../lib/m365/office.js';

const deal = {
  id: 'd1', company: 'Acme Robotics', sector: 'Industrials', subSector: 'Automation',
  dealSize: 420, currency: 'USD', readiness: 72, daysToIC: 18, leadAnalyst: 'M. Olsen',
  thesis: 'Automation platform with recurring revenue and a consolidation runway.',
  keyFigures: [{ label: 'Revenue', value: '$310M' }, { label: 'EBITDA', value: '$68M' }],
  memoSections: [{ key: 'recommendation', status: 'draft', content: 'Proceed to IC with conditions.' }],
};
const extras = {
  returns: { entry: { evEbitda: 9.5, holdYears: 5 }, hurdle: { irr: 20, moic: 2 }, meetsHurdle: true, headline: 'Base clears the hurdle.', scenarios: [{ name: 'Downside', moic: 1.6, irr: 11 }, { name: 'Base', moic: 2.4, irr: 24 }, { name: 'Upside', moic: 3.1, irr: 33 }] },
  valueCreation: { levers: [{ name: 'Pricing', timeline: 'Days 1-100', owner: 'OP' }], ebitdaComponents: [{ lever: 'Organic growth', contribution: 18 }] },
  risks: { risks: [{ id: 'R1', workstream: 'Commercial', risk: 'Customer concentration', severity: 'reprice', severityLabel: 'Reprice' }] },
  ic: { verdict: { state: 'CONDITIONAL', headline: 'Close two items.', gating: ['2 workstreams blocking'] }, requiredArtifacts: { items: [{ key: 'D3', label: 'D3 · Final IC memo', complete: false }, { key: 'compliance', label: 'KYC cleared', complete: true }] } },
};

test('buildIcDeckPptx returns a non-trivial buffer', async () => {
  const buf = await buildIcDeckPptx(deal, extras);
  assert.ok(Buffer.isBuffer(buf), 'must be a Buffer');
  assert.ok(buf.length > 5000, 'a real 7-slide deck is > 5KB');
});

test('the deck is a valid OPC package with one slide per section', async () => {
  const buf = await buildIcDeckPptx(deal, extras);
  const zip = await JSZip.loadAsync(buf);
  const files = Object.keys(zip.files);
  // Required OPC + presentation parts.
  for (const req of ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels', 'ppt/theme/theme1.xml', 'ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml']) {
    assert.ok(files.includes(req), `missing required part ${req}`);
  }
  const slides = files.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  assert.equal(slides.length, 7, 'cover + thesis + snapshot + returns + value-creation + risks + recommendation');
  // Every slide has a matching rels part and non-empty XML.
  for (const s of slides) {
    const n = s.match(/slide(\d+)\.xml$/)[1];
    assert.ok(files.includes(`ppt/slides/_rels/slide${n}.xml.rels`), `slide ${n} missing rels`);
    const xml = await zip.file(s).async('string');
    assert.ok(xml.startsWith('<?xml') && xml.includes('<p:sld'), `slide ${n} malformed`);
  }
});

test('the deck grounds in the live deal (company name appears)', async () => {
  const buf = await buildIcDeckPptx(deal, extras);
  const zip = await JSZip.loadAsync(buf);
  const cover = await zip.file('ppt/slides/slide1.xml').async('string');
  assert.ok(cover.includes('Acme Robotics'), 'cover slide must name the company');
});

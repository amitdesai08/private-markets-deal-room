// Smoke test for the deal-desk builders. Memory mode seeds no deals through the
// store, so we call the builders directly against the demo records.
//   node scripts/desk_smoke.mjs <dealId>
import { demoStageDeals } from '../data/deals.js';
import { computeICReadiness } from '../lib/icReadiness.js';
import { workiqCorpusForDeal, WORKIQ_SEED_NOTES } from '../data/workiqSeed.js';
import { buildWorkflowDesk, buildThreads, buildDocumentDesk, detectCommitments } from '../lib/dealDesk.js';

const ids = process.argv[2] ? [process.argv[2]] : demoStageDeals.map((d) => d.id);

for (const id of ids) {
  const deal = demoStageDeals.find((d) => d.id === id);
  if (!deal) { console.error(`no deal ${id}`); process.exit(1); }
  const board = computeICReadiness(deal);
  const corpus = workiqCorpusForDeal(id);
  const commitments = detectCommitments(corpus.channel?.messages || [], { source: 'Teams' });
  const wf = buildWorkflowDesk(deal, board, { role: 'partner', commitments });
  const th = buildThreads(deal, { channel: corpus.channel, notes: WORKIQ_SEED_NOTES.filter((n) => n.dealId === id) });
  const dd = buildDocumentDesk(deal, { files: corpus.files || [] });

  console.log(`\n=== ${deal.company} (${id}) ===`);
  console.log('workflow:', JSON.stringify(wf.counts), '| commitments:', commitments.length);
  wf.narrative.paragraphs.forEach((p) => console.log('  •', p.text, p.cites.length ? `[${p.cites.join(',')}]` : ''));
  console.log('  sources:', wf.narrative.sources.join(' | '));
  const flagged = wf.steps.filter((s) => s.flagged || s.atRisk);
  flagged.forEach((s) => console.log(`  ⚑ ${s.key} ${s.title} — ${s.blocker.headline} :: ${s.blocker.impact}`));
  commitments.forEach((c) => console.log(`  ✋ ${c.author}: "${c.headline.slice(0, 80)}" due=${c.due || 'unresolved'} lane=${c.laneLabel || '-'}`));
  console.log('threads:', th.threads.length, '| decisions:', th.decisions.length, '| connected:', th.connected);
  th.threads.forEach((t) => console.log(`  · [${t.group}] ${t.title} → ${t.anchorKind}: ${t.anchor} (${t.messages.length} msg)`));
  if (th.catchUp) console.log('  catch-up:', th.catchUp.count, 'new;', th.catchUp.decision);
  console.log('docs:', JSON.stringify(dd.counts), '| changed:', dd.changed.length, '| gaps:', dd.gaps.length);
  dd.changed.forEach((c) => console.log(`  Δ ${c.name} — ${c.delta.slice(0, 80)} (${c.author})`));
  dd.gaps.slice(0, 4).forEach((g) => console.log(`  ✗ missing "${g.artefact}" — expected at ${g.step}`));
  dd.comments.slice(0, 3).forEach((c) => console.log(`  💬 ${c.blocking ? 'BLOCKING' : 'review'} ${c.doc}: ${c.text.slice(0, 70)}`));
}

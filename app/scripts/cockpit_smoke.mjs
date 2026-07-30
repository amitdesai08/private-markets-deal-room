// Smoke test for the cockpit builder — runs it against the real demo deal
// records so the briefing/attention output can be eyeballed without a datastore.
import { demoStageDeals } from '../data/deals.js';
import { computeICReadiness } from '../lib/icReadiness.js';
import { buildCockpit } from '../lib/cockpit.js';

const id = process.argv[2] || 'demo-sterling';
const role = process.argv[3] || 'partner';

const deal = demoStageDeals.find((d) => d.id === id);
if (!deal) {
  console.error(`no such demo deal: ${id}`);
  process.exit(1);
}
deal.issues = deal.issues || [];
deal.activity = deal.activity || [];

const board = computeICReadiness(deal);
const ck = buildCockpit(deal, board, { role });

console.log(`=== ${ck.company} · ${ck.stage} · IC in ${ck.icInDays} days · role=${role}`);
console.log('\n--- BRIEFING ---');
for (const p of ck.briefing.paragraphs) console.log(' * ' + p);
console.log('   sources: ' + ck.briefing.sources.join(' | '));
console.log('   ask next: ' + ck.briefing.suggestions.join(' / '));
console.log(`\n--- ATTENTION (${ck.attention.length}) ---`);
for (const a of ck.attention) {
  console.log(` #${a.rank} [${a.kindLabel}] ${a.title}`);
  console.log(`     why: ${a.why}`);
  console.log(`     owner: ${a.owner} | impact: ${a.impact}`);
  console.log(`     basis: ${a.basis} | actions: ${(a.actions || []).map((x) => x.kind).join(',')}`);
}
const cur = ck.milestones.find((m) => m.state === 'current');
console.log(`\n--- MILESTONES: ${ck.milestones.filter((m) => m.state === 'done').length} done of ${ck.milestones.length}`);
console.log(`   current: ${cur ? cur.key + ' ' + cur.title : '—'}${cur?.aiRisk ? ' | AI risk: ' + cur.aiRisk.headline : ''}`);

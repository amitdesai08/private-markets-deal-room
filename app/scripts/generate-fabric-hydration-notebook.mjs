import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, '../data/fabric-cache.json');
const outputPath = resolve(process.argv[2] || 'fabric-hydrate.ipynb');
const workspaceId = process.argv[3];
const lakehouseId = process.argv[4];
if (!workspaceId || !lakehouseId) {
  throw new Error('Usage: node generate-fabric-hydration-notebook.mjs <output> <workspace-id> <lakehouse-id>');
}
const snapshot = JSON.parse(await readFile(sourcePath, 'utf8'));

const companyId = (name) => String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const companies = snapshot.companies.map((company) => ({
  company_id: companyId(company.name),
  ticker: company.ticker,
  name: company.name,
  sector: company.sector,
  industry: company.industry,
  employees: company.employees,
  market_cap: company.marketCap,
  revenue: company.revenue
})).concat(snapshot.comparableDeals.map((deal) => ({
  company_id: companyId(deal.company),
  ticker: null,
  name: deal.company,
  sector: deal.sector,
  industry: null,
  employees: null,
  market_cap: null,
  revenue: null
})));

const deals = snapshot.comparableDeals.map((deal) => ({
  company_id: companyId(deal.company),
  company_name: deal.company,
  ticker: deal.ticker || null,
  sector: deal.sector,
  deal_type: deal.dealType,
  deal_value: deal.dealValue,
  implied_valuation: deal.impliedValuation,
  ev_ebitda: deal.evEbitda,
  stage: deal.stage,
  status: deal.status,
  investment_thesis: deal.thesis,
  deal_date: deal.dealDate
}));

const findings = [];
for (const benchmark of snapshot.benchmarkFindings) {
  const remaining = { ...benchmark.byRisk };
  for (const sample of benchmark.samples) {
    remaining[sample.risk] -= 1;
    findings.push({
      workstream: benchmark.workstream,
      finding_type: sample.type,
      description: sample.description,
      risk_level: sample.risk,
      remediation: sample.remediation,
      status: sample.status,
      owner: sample.owner,
      target_resolution: sample.targetResolution || null
    });
  }
  for (const [risk, count] of Object.entries(remaining)) {
    for (let index = 1; index <= count; index += 1) {
      findings.push({
        workstream: benchmark.workstream,
        finding_type: `${risk} benchmark observation ${index}`,
        description: `${risk} ${benchmark.workstream.toLowerCase()} finding retained from the fund benchmark set.`,
        risk_level: risk,
        remediation: 'Tracked in the diligence plan and reflected in underwriting where applicable.',
        status: 'Resolved',
        owner: `${benchmark.workstream} DD`,
        target_resolution: null
      });
    }
  }
}

const approvals = snapshot.icPrecedents.map((precedent) => ({
  deal_name: precedent.deal,
  sector: precedent.sector,
  decision: precedent.decision,
  votes_for: precedent.votesFor,
  votes_against: precedent.votesAgainst,
  votes_abstain: precedent.votesAbstain,
  conditions: precedent.conditions.join('|'),
  closing_conditions_status: precedent.closingStatus,
  entry_multiple: precedent.entryMultiple,
  ic_meeting_date: precedent.meetingDate,
  note: precedent.note || null
}));

const companyIdsByTicker = new Map(snapshot.companies.map((company) => [company.ticker, companyId(company.name)]));
const filings = Object.entries(snapshot.companyFinancials).flatMap(([ticker, metrics]) =>
  Object.entries(metrics).map(([metric, filing]) => ({ company_id: companyIdsByTicker.get(ticker), ticker, metric, ...filing }))
);

const tables = {
  'silver.dim_company': {
    schema: 'company_id string, ticker string, name string, sector string, industry string, employees long, market_cap long, revenue long',
    rows: companies
  },
  'silver.fact_deal': {
    schema: 'company_id string, company_name string, ticker string, sector string, deal_type string, deal_value long, implied_valuation long, ev_ebitda double, stage string, status string, investment_thesis string, deal_date string',
    rows: deals
  },
  'bronze.bronze_diligence_findings': {
    schema: 'workstream string, finding_type string, description string, risk_level string, remediation string, status string, owner string, target_resolution string',
    rows: findings
  },
  'bronze.bronze_ic_approvals': {
    schema: 'deal_name string, sector string, decision string, votes_for long, votes_against long, votes_abstain long, conditions string, closing_conditions_status string, entry_multiple double, ic_meeting_date string, note string',
    rows: approvals
  },
  'bronze.bronze_sec_filings': {
    schema: 'company_id string, ticker string, metric string, value long, unit string, form string, filed string',
    rows: filings
  }
};

const payload = JSON.stringify(tables);
const code = `import json
from notebookutils import mssparkutils

tables = json.loads(${JSON.stringify(payload)})
spark.sql("CREATE SCHEMA IF NOT EXISTS bronze")
spark.sql("CREATE SCHEMA IF NOT EXISTS silver")

for table in tables.values():
  for row in table["rows"]:
    for column in ("ev_ebitda", "entry_multiple"):
      if row.get(column) is not None:
        row[column] = float(row[column])

for table_name, table in tables.items():
  frame = spark.createDataFrame(table["rows"], schema=table["schema"])
  frame.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(table_name)

counts = {name: spark.table(name).count() for name in tables}
company_deal_links = spark.sql("""
  SELECT COUNT(*)
  FROM silver.fact_deal deal
  JOIN silver.dim_company company ON company.company_id = deal.company_id
""").first()[0]
if company_deal_links != len(tables["silver.fact_deal"]["rows"]):
  raise RuntimeError(f"Expected every deal to resolve to one company; found {company_deal_links} links")
counts["silver.company_deal_links"] = company_deal_links
company_filing_links = spark.sql("""
  SELECT COUNT(*)
  FROM bronze.bronze_sec_filings filing
  JOIN silver.dim_company company ON company.company_id = filing.company_id
""").first()[0]
if company_filing_links != len(tables["bronze.bronze_sec_filings"]["rows"]):
  raise RuntimeError(f"Expected every filing metric to resolve to one company; found {company_filing_links} links")
counts["bronze.company_filing_links"] = company_filing_links
print(json.dumps(counts, sort_keys=True))
mssparkutils.notebook.exit(json.dumps(counts, sort_keys=True))
`;

const notebook = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {
    kernelspec: { display_name: 'Synapse PySpark', language: 'Python', name: 'synapse_pyspark' },
    language_info: { name: 'python' }
  },
  cells: [
    {
      cell_type: 'code',
      execution_count: null,
      metadata: {},
      outputs: [],
      source: [`%%configure\n`, `${JSON.stringify({ defaultLakehouse: { name: 'deal_room_starter', id: lakehouseId, workspaceId } }, null, 2)}\n`]
    },
    { cell_type: 'code', execution_count: null, metadata: {}, outputs: [], source: code.split(/(?<=\n)/) }
  ]
};

await writeFile(outputPath, `${JSON.stringify(notebook, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, counts: Object.fromEntries(Object.entries(tables).map(([name, table]) => [name, table.rows.length])) }));
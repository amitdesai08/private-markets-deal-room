// Extract the "Deal Room" Fabric lakehouse into a committable JSON seed
// (app/data/fabric-cache.json) so the demo's market-intelligence data ships with the
// app and no longer depends on the external Fabric capacity (dealroomfabric).
//
// This is the file-dumping sibling of scripts/extract_fabric_cache.py: it runs the
// SAME queries and produces the SAME snapshot shape as lib/fabric.js buildSnapshot(),
// but writes a local JSON file instead of upserting Cosmos. lib/fabric.js loads that
// file as the seed baseline (materialized mode) when no live/Cosmos source is present.
//
// Run (from app/):
//   FABRIC_SQL_ENDPOINT="<lakehouse sql endpoint>" node scripts/extract-fabric-seed.mjs
// Requires: az login as a member of the Fabric workspace (Viewer) with SQL access.

import { DefaultAzureCredential } from '@azure/identity';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SQL_ENDPOINT = process.env.FABRIC_SQL_ENDPOINT || '';
const SQL_DATABASE = process.env.FABRIC_SQL_DATABASE || 'deal_room_starter';
const WORKSPACE = process.env.FABRIC_WORKSPACE || 'Deal Room';
const LAKEHOUSE = process.env.FABRIC_LAKEHOUSE || 'deal_room_starter';

const here = dirname(fileURLToPath(import.meta.url));
// Default output is the committed seed; FABRIC_SEED_OUT redirects to a backup path.
const OUT = process.env.FABRIC_SEED_OUT
  ? resolve(process.cwd(), process.env.FABRIC_SEED_OUT)
  : resolve(here, '../data/fabric-cache.json');

const num = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isNaN(n) ? null : n;
};

function buildSnapshot({ companies, comps, fcounts, samples, ic, sec }) {
  const outCompanies = (companies || []).map((r) => ({
    ticker: r.ticker, name: r.name, sector: r.sector, industry: r.industry,
    employees: num(r.employees), marketCap: num(r.market_cap), revenue: num(r.revenue)
  }));
  const outComps = (comps || []).map((r) => ({
    company: r.company_name, ticker: r.ticker, dealType: r.deal_type,
    dealValue: num(r.deal_value), impliedValuation: num(r.implied_valuation),
    evEbitda: null, stage: r.stage, status: r.status,
    thesis: (r.investment_thesis || '').slice(0, 240), dealDate: r.deal_date
  }));
  const byWs = {};
  for (const r of fcounts || []) {
    const ws = r.workstream;
    if (!byWs[ws]) byWs[ws] = { workstream: ws, total: 0, byRisk: {} };
    byWs[ws].byRisk[r.risk_level] = num(r.c);
    byWs[ws].total += num(r.c) || 0;
  }
  const wsSamples = {};
  for (const r of samples || []) {
    (wsSamples[r.workstream] ||= []);
    if (wsSamples[r.workstream].length < 3) {
      wsSamples[r.workstream].push({
        type: r.finding_type, description: (r.description || '').slice(0, 280), risk: r.risk_level,
        remediation: (r.remediation || '').slice(0, 200), status: r.status, owner: r.owner, targetResolution: r.target_resolution
      });
    }
  }
  const benchmarkFindings = Object.keys(byWs).sort().map((ws) => ({ ...byWs[ws], samples: wsSamples[ws] || [] }));
  const icPrecedents = (ic || []).map((r) => ({
    deal: r.deal_name, decision: r.decision, votesFor: num(r.votes_for),
    votesAgainst: num(r.votes_against), votesAbstain: num(r.votes_abstain),
    conditions: String(r.conditions || '').split('|').map((c) => c.trim()).filter(Boolean),
    closingStatus: r.closing_conditions_status, meetingDate: r.ic_meeting_date
  }));
  const finByTicker = {};
  for (const r of sec || []) {
    (finByTicker[r.ticker] ||= {});
    const cur = finByTicker[r.ticker][r.metric];
    const v = num(r.value);
    if (cur == null || Math.abs(v || 0) > Math.abs(cur.value || 0)) {
      finByTicker[r.ticker][r.metric] = { value: v, unit: r.unit, form: r.form, filed: r.filed };
    }
  }
  return {
    source: `fabric:${WORKSPACE}/${LAKEHOUSE}`,
    // Do NOT embed the concrete SQL endpoint in the committed seed (public repo). The
    // live path reads FABRIC_SQL_ENDPOINT from env; the snapshot only needs the labels.
    sqlEndpoint: '',
    capacity: 'dealroomfabric',
    extractedAt: new Date().toISOString(),
    companies: outCompanies,
    comparableDeals: outComps,
    benchmarkFindings,
    icPrecedents,
    companyFinancials: finByTicker,
    counts: {
      companies: outCompanies.length, comparableDeals: outComps.length,
      benchmarkFindingWorkstreams: benchmarkFindings.length, icPrecedents: icPrecedents.length,
      secTickers: Object.keys(finByTicker).length
    }
  };
}

async function main() {
  if (!SQL_ENDPOINT) throw new Error('FABRIC_SQL_ENDPOINT not set');
  const sql = (await import('mssql')).default;
  const token = await new DefaultAzureCredential().getToken('https://database.windows.net/.default');
  const pool = await sql.connect({
    server: SQL_ENDPOINT,
    database: SQL_DATABASE,
    port: 1433,
    options: { encrypt: true, trustServerCertificate: false },
    authentication: { type: 'azure-active-directory-access-token', options: { token: token.token } },
    connectionTimeout: 30000,
    requestTimeout: 60000
  });
  try {
    const q = (s) => pool.request().query(s).then((r) => r.recordset);
    const [companies, comps, fcounts, samples, ic, sec] = await Promise.all([
      q('SELECT ticker,name,sector,industry,employees,market_cap,revenue FROM silver.dim_company'),
      q('SELECT company_name,ticker,deal_type,deal_value,implied_valuation,stage,status,investment_thesis,deal_date FROM silver.fact_deal ORDER BY deal_date DESC'),
      q('SELECT workstream, risk_level, COUNT(*) c FROM bronze.bronze_diligence_findings GROUP BY workstream, risk_level'),
      q("SELECT workstream, finding_type, description, risk_level, remediation, status, owner, target_resolution FROM bronze.bronze_diligence_findings WHERE risk_level IN ('Critical','High') ORDER BY workstream"),
      q('SELECT deal_name,decision,votes_for,votes_against,votes_abstain,conditions,closing_conditions_status,ic_meeting_date FROM bronze.bronze_ic_approvals'),
      q('SELECT ticker, metric, value, unit, form, filed FROM bronze.bronze_sec_filings f WHERE filed = (SELECT MAX(filed) FROM bronze.bronze_sec_filings g WHERE g.ticker=f.ticker AND g.metric=f.metric)')
    ]);
    const snap = buildSnapshot({ companies, comps, fcounts, samples, ic, sec });
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(snap, null, 2));
    console.log('snapshot counts:', JSON.stringify(snap.counts));
    console.log('wrote', OUT);
  } finally {
    await pool.close().catch(() => {});
  }
}

main().catch((e) => { console.error('extract failed:', e?.message || e); process.exit(1); });

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputPath = resolve(process.argv[2] || 'fabric-data-agent-definition.json');
const workspaceId = process.argv[3];
const lakehouseId = process.argv[4];
if (!workspaceId || !lakehouseId) {
  throw new Error('Usage: node generate-fabric-data-agent-definition.mjs <output> <workspace-id> <lakehouse-id>');
}

const guid = (value) => {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
};

const tableDefinitions = {
  bronze: {
    bronze_diligence_findings: {
      workstream: 'Diligence workstream', finding_type: 'Finding category', description: 'Finding detail',
      risk_level: 'Critical, High, Medium, or Low', remediation: 'Recorded remediation', status: 'Resolution status',
      owner: 'Accountable diligence team', target_resolution: 'Target resolution date when recorded'
    },
    bronze_ic_approvals: {
      deal_name: 'Deal presented to investment committee', sector: 'Deal sector', decision: 'Committee decision',
      votes_for: 'Votes in favor', votes_against: 'Votes against', votes_abstain: 'Abstentions',
      conditions: 'Pipe-delimited approval conditions', closing_conditions_status: 'Condition completion status',
      entry_multiple: 'Entry EV/EBITDA multiple', ic_meeting_date: 'Committee meeting date', note: 'Decision context'
    },
    bronze_sec_filings: {
      ticker: 'Public company ticker', metric: 'SEC filing metric', value: 'Reported value', unit: 'Reporting unit',
      form: 'SEC form type', filed: 'Filing date'
    }
  },
  silver: {
    dim_company: {
      ticker: 'Public company ticker', name: 'Company name', sector: 'Market sector', industry: 'Industry',
      employees: 'Employee count', market_cap: 'Market capitalization', revenue: 'Reported revenue'
    },
    fact_deal: {
      company_name: 'Comparable deal company', ticker: 'Ticker when public', sector: 'Deal sector',
      deal_type: 'Transaction type', deal_value: 'Deal value', implied_valuation: 'Implied enterprise valuation',
      ev_ebitda: 'Entry EV/EBITDA multiple', stage: 'Deal stage', status: 'Deal outcome',
      investment_thesis: 'Recorded investment thesis', deal_date: 'Deal date'
    }
  }
};

const elements = Object.entries(tableDefinitions).map(([schemaName, tables]) => ({
  id: guid(`schema:${schemaName}`),
  display_name: schemaName,
  type: 'lakehouse_tables.schema',
  is_selected: true,
  children: Object.entries(tables).map(([tableName, columns]) => ({
    id: guid(`table:${schemaName}.${tableName}`),
    display_name: tableName,
    type: 'lakehouse_tables.table',
    is_selected: true,
    description: `Deal Room ${tableName.replaceAll('_', ' ')} table`,
    children: Object.entries(columns).map(([columnName, description]) => ({
      id: guid(`column:${schemaName}.${tableName}.${columnName}`),
      display_name: columnName,
      type: 'lakehouse_tables.column',
      is_selected: true,
      description
    }))
  }))
}));

const dataSource = {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/dataAgent/definition/dataSource/1.0.0/schema.json',
  artifactId: lakehouseId,
  workspaceId,
  displayName: 'deal_room_starter',
  type: 'lakehouse',
  userDescription: 'Live private-markets comparables, diligence benchmarks, IC precedents, and public-company financial metrics.',
  dataSourceInstructions: 'Use only the selected tables. Treat deal_value, implied_valuation, market_cap, revenue, and SEC values as raw reported units. Do not invent missing values. Explain filters and cite table names.',
  elements
};

const fewShots = {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/dataAgent/definition/fewShots/1.0.0/schema.json',
  fewShots: [
    {
      id: guid('fewshot:comparables'),
      question: 'Which comparable deals had the highest entry multiples?',
      query: 'SELECT TOP 5 company_name, sector, ev_ebitda, deal_date FROM silver.fact_deal WHERE ev_ebitda IS NOT NULL ORDER BY ev_ebitda DESC'
    },
    {
      id: guid('fewshot:findings'),
      question: 'How many Critical and High diligence findings are there by workstream?',
      query: "SELECT workstream, risk_level, COUNT(*) AS finding_count FROM bronze.bronze_diligence_findings WHERE risk_level IN ('Critical','High') GROUP BY workstream, risk_level ORDER BY workstream, risk_level"
    },
    {
      id: guid('fewshot:ic'),
      question: 'Show declined or conditional IC precedents and their entry multiples.',
      query: "SELECT deal_name, sector, decision, entry_multiple, conditions, ic_meeting_date FROM bronze.bronze_ic_approvals WHERE decision IN ('Declined','Approved subject to conditions') ORDER BY ic_meeting_date DESC"
    }
  ]
};

const instructions = {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/dataAgent/definition/stageConfiguration/1.0.0/schema.json',
  aiInstructions: 'You are the Deal Room Fabric IQ analyst. Answer private-markets questions only from the selected lakehouse tables. State the population and units, distinguish facts from interpretation, preserve committee decision wording, and say when the data cannot answer a question. Include the generated SQL or a concise description of it when useful.'
};

const encode = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`).toString('base64');
const parts = [
  ['Files/Config/data_agent.json', { $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/dataAgent/definition/dataAgent/2.1.0/schema.json' }],
  ['Files/Config/draft/lakehouse-deal_room_starter/datasource.json', dataSource],
  ['Files/Config/draft/lakehouse-deal_room_starter/fewshots.json', fewShots],
  ['Files/Config/draft/stage_config.json', instructions],
  ['Files/Config/published/lakehouse-deal_room_starter/datasource.json', dataSource],
  ['Files/Config/published/lakehouse-deal_room_starter/fewshots.json', fewShots],
  ['Files/Config/published/stage_config.json', instructions],
  ['Files/Config/publish_info.json', {
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/dataAgent/definition/publishInfo/1.0.0/schema.json',
    description: 'Deal Room Fabric IQ agent grounded in five live lakehouse tables.'
  }]
].map(([path, value]) => ({ path, payload: encode(value), payloadType: 'InlineBase64' }));

const request = {
  displayName: 'Deal Room Fabric IQ Agent',
  description: 'Natural-language analysis over live Deal Room Fabric IQ lakehouse data.',
  definition: { parts }
};

await writeFile(outputPath, `${JSON.stringify(request, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, selectedTables: 5, fewShots: fewShots.fewShots.length, published: true }));
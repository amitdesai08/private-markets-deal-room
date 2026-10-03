import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputPath = resolve(process.argv[2] || 'fabric-iq-definitions.json');
const workspaceId = process.argv[3];
const lakehouseId = process.argv[4];
const sqlEndpoint = process.argv[5];
const sqlDatabase = process.argv[6];
const lakehouseName = process.argv[7] || 'deal_room_starter';
const directLakeExpressionLineageTag = process.argv[8] || stableGuid(`expression:DirectLake - ${lakehouseName}`);

if (!workspaceId || !lakehouseId || !sqlEndpoint || !sqlDatabase) {
  throw new Error('Usage: node generate-fabric-iq-definitions.mjs <output> <workspace-id> <lakehouse-id> <sql-endpoint> <sql-database> [lakehouse-name] [direct-lake-expression-lineage-tag]');
}

function stableGuid(name) {
  const hex = createHash('sha256').update(`deal-room-fabric-iq:${name}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

function encodePart(path, content) {
  return {
    path,
    payload: Buffer.from(`${content.trim()}\n`, 'utf8').toString('base64'),
    payloadType: 'InlineBase64'
  };
}

const tables = [
  {
    name: 'dim_company',
    schema: 'silver',
    columns: {
      company_id: 'string', ticker: 'string', name: 'string', sector: 'string', industry: 'string', employees: 'int64', market_cap: 'int64', revenue: 'int64'
    },
    measures: [
      ['Company Count', "COUNTROWS('dim_company')", '#,##0'],
      ['Total Revenue', "SUM('dim_company'[revenue])", '$#,##0']
    ]
  },
  {
    name: 'fact_deal',
    schema: 'silver',
    columns: {
      company_id: 'string', company_name: 'string', ticker: 'string', sector: 'string', deal_type: 'string', deal_value: 'int64', implied_valuation: 'int64', ev_ebitda: 'double', stage: 'string', status: 'string', investment_thesis: 'string', deal_date: 'string'
    },
    measures: [
      ['Comparable Deal Count', "COUNTROWS('fact_deal')", '#,##0'],
      ['Average Entry Multiple', "AVERAGE('fact_deal'[ev_ebitda])", '0.0x'],
      ['Total Deal Value', "SUM('fact_deal'[deal_value])", '$#,##0']
    ]
  },
  {
    name: 'bronze_diligence_findings',
    schema: 'bronze',
    columns: {
      workstream: 'string', finding_type: 'string', description: 'string', risk_level: 'string', remediation: 'string', status: 'string', owner: 'string', target_resolution: 'string'
    },
    measures: [
      ['Finding Count', "COUNTROWS('bronze_diligence_findings')", '#,##0'],
      ['High Risk Finding Count', "CALCULATE(COUNTROWS('bronze_diligence_findings'), 'bronze_diligence_findings'[risk_level] IN { \"High\", \"Critical\" })", '#,##0']
    ]
  },
  {
    name: 'bronze_ic_approvals',
    schema: 'bronze',
    columns: {
      deal_name: 'string', sector: 'string', decision: 'string', votes_for: 'int64', votes_against: 'int64', votes_abstain: 'int64', conditions: 'string', closing_conditions_status: 'string', entry_multiple: 'double', ic_meeting_date: 'string', note: 'string'
    },
    measures: [
      ['IC Decision Count', "COUNTROWS('bronze_ic_approvals')", '#,##0'],
      ['IC Approval Rate', "DIVIDE(CALCULATE(COUNTROWS('bronze_ic_approvals'), 'bronze_ic_approvals'[decision] = \"Approved\"), COUNTROWS('bronze_ic_approvals'))", '0.0%']
    ]
  },
  {
    name: 'bronze_sec_filings',
    schema: 'bronze',
    columns: {
      company_id: 'string', ticker: 'string', metric: 'string', value: 'int64', unit: 'string', form: 'string', filed: 'string'
    },
    measures: [['Filing Metric Count', "COUNTROWS('bronze_sec_filings')", '#,##0']]
  }
];

function tmdlTable(table, source = {}) {
  const expressionSource = source.expressionSource || 'DatabaseQuery';
  const lines = [`table ${table.name}`, `\tlineageTag: ${stableGuid(`table:${table.name}`)}`];
  for (const [name, dataType] of Object.entries(table.columns)) {
    lines.push('', `\tcolumn ${name}`, `\t\tdataType: ${dataType}`, `\t\tlineageTag: ${stableGuid(`column:${table.name}:${name}`)}`, `\t\tsourceColumn: ${name}`, `\t\tsourceLineageTag: ${name}`);
  }
  lines.push('', `\tpartition ${table.name} = entity`, '\t\tmode: directLake', '\t\tsource', `\t\t\tentityName: ${table.name}`, `\t\t\tschemaName: ${table.schema}`, `\t\t\texpressionSource: '${expressionSource}'`);
  for (const [name, value] of Object.entries(source.annotations || {})) {
    lines.push('', `\t\tannotation ${name} = ${value}`);
  }
  for (const [name, expression, formatString] of table.measures) {
    lines.push('', `\tmeasure '${name}' = ${expression}`, `\t\tformatString: ${formatString}`, `\t\tlineageTag: ${stableGuid(`measure:${table.name}:${name}`)}`);
  }
  return lines.join('\n');
}

const databaseQuery = `expression DatabaseQuery =\n\t\tlet\n\t\t\tdatabase = Sql.Database("${sqlEndpoint}", "${sqlDatabase}")\n\t\tin\n\t\t\tdatabase\n\tlineageTag: ${stableGuid('expression:DatabaseQuery')}`;
const directLakeExpressionName = `DirectLake - ${lakehouseName}`;
const directLakeExpression = `expression '${directLakeExpressionName}' =\n\t\tlet\n\t\t\tSource = AzureStorage.DataLake("https://onelake.dfs.fabric.microsoft.com/${workspaceId}/${lakehouseId}", [HierarchicalNavigation=true])\n\t\tin\n\t\t\tSource\n\tlineageTag: ${directLakeExpressionLineageTag}`;
const ontologySource = {
  expressionSource: directLakeExpressionName,
  annotations: {
    ONT_WorkspaceId: workspaceId,
    ONT_ItemId: lakehouseId,
    ONT_ItemKind: 'Lakehouse',
    ONT_ItemName: lakehouseName,
    ONT_SqlEndpoint: sqlEndpoint,
    ONT_SqlDatabase: lakehouseName
  }
};

const semanticParts = [
  encodePart('definition/database.tmdl', `database\n\tcompatibilityLevel: 1604`),
  encodePart('definition/model.tmdl', `model Model\n\tculture: en-US\n\tdefaultPowerBIDataSourceVersion: powerBI_V3\n\tsourceQueryCulture: en-US\n\tdataAccessOptions\n\t\tlegacyRedirects\n\t\treturnErrorValuesAsNull\n\n${tables.map((table) => `ref table ${table.name}`).join('\n')}\n\nref expression DatabaseQuery`),
  ...tables.map((table) => encodePart(`definition/tables/${table.name}.tmdl`, tmdlTable(table))),
  encodePart('definition/relationships.tmdl', `relationship deal_company\n\tfromColumn: fact_deal.company_id\n\ttoColumn: dim_company.company_id\n\nrelationship filing_company\n\tfromColumn: bronze_sec_filings.company_id\n\ttoColumn: dim_company.company_id`),
  encodePart('definition/expressions.tmdl', databaseQuery),
  encodePart('definition.pbism', JSON.stringify({
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json',
    version: '5.0',
    settings: { qnaEnabled: true }
  }, null, 2))
];

const entities = [
  { name: 'Company', table: 'dim_company', key: 'company_id', description: 'A public company or comparable target in the market intelligence estate.' },
  { name: 'Deal', table: 'fact_deal', key: 'company_name', description: 'A comparable private-markets transaction and its underwriting context.' },
  { name: 'DiligenceFinding', table: 'bronze_diligence_findings', key: 'finding_type', description: 'A diligence observation, risk rating, and remediation action.' },
  { name: 'ICDecision', table: 'bronze_ic_approvals', key: 'deal_name', description: 'An Investment Committee precedent, vote, and approval condition.' },
  { name: 'FilingMetric', table: 'bronze_sec_filings', key: 'metric', description: 'A reported public-company metric grounded in a regulatory filing.' }
];

function tmdlEntity(entity) {
  const table = tables.find((candidate) => candidate.name === entity.table);
  const lines = [`/// ${entity.description}`, `entity ${entity.name}`, `\tlineageTag: ${stableGuid(`entity:${entity.name}`)}`, `\tbackingTable: ${entity.table}`, `\tkeyProperty: ${entity.key}`];
  for (const [name, dataType] of Object.entries(table.columns)) {
    lines.push('', `\tproperty ${name}`, `\t\tdataType: ${dataType}`, `\t\tlineageTag: ${stableGuid(`property:${entity.name}:${name}`)}`, '\t\tbackingConfiguration', `\t\t\tvalueColumn: ${entity.table}.${name}`);
  }
  lines.push('', '\tresourceLink', '\t\titem', `\t\t\tworkspaceId: ${workspaceId}`, `\t\t\titemId: ${lakehouseId}`, '\t\tsynonym lakehouse');
  return lines.join('\n');
}

const ontologyLogicalId = stableGuid('ontology:DealRoomInvestmentOntology');
const ontologyParts = [
  encodePart('.platform', JSON.stringify({
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json',
    metadata: { type: 'Ontology', displayName: 'DealRoomInvestmentOntology' },
    config: { version: '2.0', logicalId: ontologyLogicalId }
  }, null, 2)),
  encodePart('database.tmdl', 'database\n\tcompatibilityLevel: 1000000'),
  encodePart('model.tmdl', `model Model\n\n${tables.map((table) => `ref table ${table.name}`).join('\n')}\n${entities.map((entity) => `ref entity ${entity.name}`).join('\n')}\nref namespace default`),
  encodePart('namespaces/default.tmdl', 'namespace default\n\tlineageTag: default'),
  encodePart('expressions.tmdl', directLakeExpression),
  ...tables.map((table) => encodePart(`tables/${table.name}.tmdl`, tmdlTable(table, ontologySource))),
  ...entities.map((entity) => encodePart(`entities/${entity.name}.tmdl`, tmdlEntity(entity))),
  encodePart('relationships.tmdl', `relationship deal_company\n\tfromColumn: fact_deal.company_id\n\ttoColumn: dim_company.company_id\n\nrelationship filing_company\n\tfromColumn: bronze_sec_filings.company_id\n\ttoColumn: dim_company.company_id`),
  encodePart('entityRelationships.tmdl', `/// A comparable deal targets a company.\nentityRelationship 'Deal Targets Company'\n\tlineageTag: ${stableGuid('entity-relationship:deal-company')}\n\tfromEntity: Deal\n\ttoEntity: Company\n\tbackingConfiguration\n\t\trelationship: deal_company\n\n/// A filing metric describes a company.\nentityRelationship 'Filing Describes Company'\n\tlineageTag: ${stableGuid('entity-relationship:filing-company')}\n\tfromEntity: FilingMetric\n\ttoEntity: Company\n\tbackingConfiguration\n\t\trelationship: filing_company`)
];

const output = {
  source: { workspaceId, lakehouseId, lakehouseName, sqlEndpoint, sqlDatabase },
  semanticModel: {
    displayName: 'Deal Room Investment Model',
    type: 'SemanticModel',
    description: 'Trusted Direct Lake KPIs and business dimensions for Deal Room Fabric IQ.',
    definition: { format: 'TMDL', parts: semanticParts }
  },
  ontology: {
    displayName: 'DealRoomInvestmentOntology',
    type: 'Ontology',
    description: 'Shared Deal Room investment entities, relationships, rules, and business meaning.',
    definition: { parts: ontologyParts }
  }
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, semanticParts: semanticParts.length, ontologyParts: ontologyParts.length, ontologyLogicalId }));
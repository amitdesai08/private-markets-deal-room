import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const hostedProject = resolve(repo, 'hosted-agents/iq-router');

function run(command, args, cwd = repo) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, AZURE_DEV_USER_AGENT: 'microsoft_foundry_skill' },
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return String(result.stdout || '').trim();
}

function tryRun(command, args, cwd = repo) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, AZURE_DEV_USER_AGENT: 'microsoft_foundry_skill' },
    windowsHide: true,
  });
  return result.status === 0;
}

function parseAzdValues(text) {
  const values = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replaceAll('\\"', '"');
    values[match[1].trim()] = value;
  }
  return values;
}

export function hostedRouterEndpoint(agent) {
  const endpoint = agent?.agent_endpoints?.responses;
  if (!endpoint || !URL.canParse(endpoint)) throw new Error('Hosted IQ router did not publish a valid Responses endpoint');
  return endpoint;
}

export function bindHostedRouter() {
  const values = parseAzdValues(run('azd', ['env', 'get-values']));
  const rootEnvironment = values.AZURE_ENV_NAME || process.env.AZURE_ENV_NAME || 'deal-room';
  const subscriptionId = values.AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID;
  const location = values.AZURE_LOCATION || process.env.AZURE_LOCATION;
  const projectId = values.AZURE_AI_PROJECT_ID;
  if (!subscriptionId || !location || !projectId) {
    throw new Error('AZURE_SUBSCRIPTION_ID, AZURE_LOCATION, and AZURE_AI_PROJECT_ID are required to deploy the hosted IQ router');
  }
  const hostedEnvironment = `${rootEnvironment}-iq-router`.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 64);
  if (!tryRun('azd', ['env', 'select', hostedEnvironment, '--no-prompt'], hostedProject)) {
    run('azd', ['env', 'new', hostedEnvironment, '--subscription', subscriptionId, '--location', location, '--no-prompt'], hostedProject);
  }
  run('azd', ['env', 'set', 'AZURE_SUBSCRIPTION_ID', subscriptionId], hostedProject);
  run('azd', ['env', 'set', 'AZURE_LOCATION', location], hostedProject);
  run('azd', ['env', 'set', 'AZURE_AI_PROJECT_ID', projectId], hostedProject);
  run('azd', ['deploy', 'deal-room-hosted-iq-router', '--no-prompt'], hostedProject);
  const agent = JSON.parse(run('azd', ['ai', 'agent', 'show', 'deal-room-hosted-iq-router', '--output', 'json'], hostedProject));
  const endpoint = hostedRouterEndpoint(agent);
  const apps = JSON.parse(run('az', [
    'containerapp', 'list',
    '--subscription', subscriptionId,
    '--query', "[?tags.'azd-service-name'=='orchestrator'].{name:name,resourceGroup:resourceGroup}",
    '-o', 'json',
  ]));
  if (!Array.isArray(apps) || apps.length !== 1) throw new Error(`Expected one azd orchestrator Container App; found ${apps?.length || 0}`);
  run('azd', ['env', 'set', 'HOSTED_IQ_ROUTER_ENDPOINT', endpoint]);
  run('az', [
    'containerapp', 'update',
    '--name', apps[0].name,
    '--resource-group', apps[0].resourceGroup,
    '--subscription', subscriptionId,
    '--set-env-vars',
    `HOSTED_IQ_ROUTER_ENDPOINT=${endpoint}`,
  ]);
  return { endpoint, environment: hostedEnvironment };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    console.log(JSON.stringify(bindHostedRouter(), null, 2));
  } catch (error) {
    console.error(`[hosted-router] ${error.message}`);
    process.exitCode = 1;
  }
}
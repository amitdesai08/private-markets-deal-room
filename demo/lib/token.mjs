// The token the capture presents to the tab.
//
// The demo used to run against a host with DEMO_OPEN_SIGN_IN on, which let anyone with the
// URL read every deal. That is gone: the tab now demands a real Entra identity, and the
// capture proves one like any other caller.
//
// `x-dr-as` picks the seat, and the tab honours it *because* there is an identity behind it
// (`if (!identity && !OPEN_SIGN_IN) return ''`). The service principal holds DealRoom.Automation
// on the tab app, which confers no seat of its own — it exists so Entra will issue the token.
// The seat, and therefore the role, still comes from the demo roster.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const run = promisify(execFile);

const APP_ID = process.env.DEMO_SPN_APP_ID || '4732cfda-458b-4a5c-9714-f87a2d3e61d9';
const TENANT = process.env.DEMO_SPN_TENANT || '301fb807-bdbc-4bac-802f-39b67f298b6c';
const TAB_APP = process.env.DEMO_TAB_APP_ID || '43ec8f74-280e-4e78-9fd3-4f87115bf4b9';
const CERT = process.env.DEMO_SPN_CERT
  || path.join(process.env.USERPROFILE || process.env.HOME || '', '.azure', 'sp-dealroom-demo-automation.pem');

/**
 * A bearer token for the tab, or null if the certificate is not on this machine.
 * Signs in under a throwaway CLI profile so an interactive `az` session is untouched.
 */
export async function tabToken() {
  if (process.env.DEMO_BEARER) return process.env.DEMO_BEARER;
  const profile = await mkdtemp(path.join(tmpdir(), 'az-demo-'));
  const env = { ...process.env, AZURE_CONFIG_DIR: profile };
  try {
    await run('az', ['login', '--service-principal', '-u', APP_ID,
      '--certificate', `"${CERT}"`, '--tenant', TENANT, '-o', 'none'], { shell: true, env, maxBuffer: 1 << 22 });
    // Asked for by application id: the tab's identifier URI is the container-app form,
    // so `api://<app-id>` does not resolve.
    const { stdout } = await run('az', ['account', 'get-access-token',
      '--resource', TAB_APP, '-o', 'json'], { shell: true, env, maxBuffer: 1 << 22 });
    return JSON.parse(stdout).accessToken || null;
  } catch {
    return null;
  } finally {
    await run('az', ['logout'], { shell: true, env }).catch(() => {});
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

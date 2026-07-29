// SSRF guard for any server-side fetch of an operator/user-supplied URL (custom
// connector endpoints, MCP URLs, webhooks). Enforces https, blocks localhost and
// private / loopback / link-local / metadata / unique-local address ranges, and —
// at fetch time — resolves DNS and re-checks the resolved IPs to defeat DNS
// rebinding. OWASP SSRF guidance: allowlist scheme, block internal ranges, and
// validate the post-resolution IP rather than trusting the string form.

import dns from 'node:dns/promises';
import net from 'node:net';

// Is an IP literal inside a private / loopback / link-local / reserved range?
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    if (p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    if (p[0] === 0) return true;                                   // 0.0.0.0/8
    if (p[0] === 10) return true;                                  // 10/8 private
    if (p[0] === 127) return true;                                 // loopback
    if (p[0] === 169 && p[1] === 254) return true;                 // link-local + 169.254.169.254 metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;     // 172.16/12 private
    if (p[0] === 192 && p[1] === 168) return true;                 // 192.168/16 private
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;    // 100.64/10 CGNAT
    if (p[0] >= 224) return true;                                  // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;            // loopback / unspecified
    if (lower.startsWith('fe80')) return true;                    // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);    // IPv4-mapped
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true; // not a valid IP → treat as unsafe
}

// Structural (synchronous, no DNS) validation — safe to run at config-set time.
// Returns the parsed URL or throws with a human-readable reason.
export function validateHttpUrlSync(urlStr, { allowHttp = false } = {}) {
  let u;
  try { u = new URL(String(urlStr)); } catch { throw new Error('Not a valid URL.'); }
  if (u.protocol !== 'https:' && !(allowHttp && u.protocol === 'http:')) {
    throw new Error('Only https:// URLs are allowed.');
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host) throw new Error('URL has no host.');
  if (/^(localhost|.*\.localhost)$/i.test(host)) throw new Error('Localhost URLs are not allowed.');
  if (net.isIP(host) && isPrivateIp(host)) throw new Error('URL points at a private / loopback address.');
  return u;
}

// Full (async) validation — resolves DNS and re-checks every resolved IP. Run this
// immediately before performing the outbound fetch.
export async function assertPublicHttpUrl(urlStr, { allowHttp = false } = {}) {
  const u = validateHttpUrlSync(urlStr, { allowHttp });
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let ips;
  if (net.isIP(host)) ips = [host];
  else {
    let recs;
    try { recs = await dns.lookup(host, { all: true }); } catch { throw new Error('Host did not resolve.'); }
    ips = recs.map((r) => r.address);
  }
  if (!ips.length) throw new Error('Host did not resolve.');
  for (const ip of ips) {
    if (isPrivateIp(ip)) throw new Error(`Host resolves to a private / loopback address (${ip}) — blocked.`);
  }
  return u;
}

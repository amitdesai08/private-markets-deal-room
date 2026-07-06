// Blob storage seam for saved SEC filing archives.
//
// When DEAL_BLOB_ENDPOINT is set (prod: the Container App's UAMI holds Storage
// Blob Data Contributor on the ADLS Gen2 data account) we persist the entire
// pulled-down filing — every document in the EDGAR accession — into the
// `filings` blob container. With no endpoint (local dev) we fall back to an
// on-disk store under app/.filings-store so the feature is fully testable
// offline. Either way callers get back a manifest of saved objects.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const ENDPOINT = process.env.DEAL_BLOB_ENDPOINT || '';
const CONTAINER = process.env.DEAL_FILINGS_CONTAINER || 'filings';
const DISK_ROOT = process.env.DEAL_FILINGS_DIR || path.resolve('.filings-store');

let mode = ENDPOINT ? 'blob' : 'disk';
let containerClient = null;
let initErr = null;

export function blobMode() {
  return mode;
}
export function blobConfigured() {
  return true; // blob in prod, disk fallback in dev — always usable
}

async function ensureContainer() {
  if (containerClient || mode !== 'blob') return containerClient;
  try {
    const { BlobServiceClient } = await import('@azure/storage-blob');
    const { DefaultAzureCredential } = await import('@azure/identity');
    const svc = new BlobServiceClient(ENDPOINT, new DefaultAzureCredential());
    containerClient = svc.getContainerClient(CONTAINER);
    await containerClient.createIfNotExists();
  } catch (err) {
    initErr = String(err?.message || err);
    mode = 'disk'; // degrade gracefully rather than hard-fail a save
    containerClient = null;
  }
  return containerClient;
}

const safeSeg = (s) => String(s || '').replace(/[^A-Za-z0-9._-]/g, '_');
// A blob "path" is prefix/name; sanitize each segment but keep the slashes.
function safePath(p) {
  return String(p || '')
    .split('/')
    .map(safeSeg)
    .filter(Boolean)
    .join('/');
}

// Upload a set of files under a common prefix. files: [{ name, buffer, contentType }].
// Returns { mode, container, prefix, files: [{ name, path, size, contentType }] }.
export async function uploadFiles(prefix, files) {
  const cleanPrefix = safePath(prefix);
  const saved = [];
  if (mode === 'blob') {
    const cc = await ensureContainer();
    if (cc) {
      for (const f of files) {
        const blobPath = `${cleanPrefix}/${safeSeg(f.name)}`;
        const block = cc.getBlockBlobClient(blobPath);
        await block.uploadData(f.buffer, {
          blobHTTPHeaders: { blobContentType: f.contentType || 'application/octet-stream' }
        });
        saved.push({ name: f.name, path: blobPath, size: f.buffer.length, contentType: f.contentType || 'application/octet-stream' });
      }
      return { mode: 'blob', container: CONTAINER, prefix: cleanPrefix, files: saved };
    }
  }
  // disk fallback
  const dir = path.join(DISK_ROOT, ...cleanPrefix.split('/'));
  await fsp.mkdir(dir, { recursive: true });
  for (const f of files) {
    const name = safeSeg(f.name);
    await fsp.writeFile(path.join(dir, name), f.buffer);
    saved.push({ name: f.name, path: `${cleanPrefix}/${name}`, size: f.buffer.length, contentType: f.contentType || 'application/octet-stream' });
  }
  return { mode: 'disk', container: CONTAINER, prefix: cleanPrefix, files: saved };
}

// Fetch a previously-saved object. Returns { buffer, contentType } or null.
export async function getFile(blobPath) {
  const clean = safePath(blobPath);
  if (!clean) return null;
  if (mode === 'blob') {
    const cc = await ensureContainer();
    if (cc) {
      try {
        const block = cc.getBlockBlobClient(clean);
        const buffer = await block.downloadToBuffer();
        const props = await block.getProperties().catch(() => ({}));
        return { buffer, contentType: props.contentType || 'application/octet-stream' };
      } catch {
        return null;
      }
    }
  }
  const abs = path.join(DISK_ROOT, ...clean.split('/'));
  if (!fs.existsSync(abs)) return null;
  return { buffer: await fsp.readFile(abs), contentType: 'application/octet-stream' };
}

// List saved objects under a prefix. Returns [{ name, path, size }].
export async function listPrefix(prefix) {
  const clean = safePath(prefix);
  if (mode === 'blob') {
    const cc = await ensureContainer();
    if (cc) {
      const out = [];
      for await (const b of cc.listBlobsFlat({ prefix: `${clean}/` })) {
        out.push({ name: b.name.split('/').pop(), path: b.name, size: b.properties?.contentLength || 0 });
      }
      return out;
    }
  }
  const dir = path.join(DISK_ROOT, ...clean.split('/'));
  if (!fs.existsSync(dir)) return [];
  const names = await fsp.readdir(dir);
  return names.map((n) => {
    const st = fs.statSync(path.join(dir, n));
    return { name: n, path: `${clean}/${n}`, size: st.size };
  });
}

export function blobDiag() {
  return { mode, endpoint: ENDPOINT || null, container: CONTAINER, error: initErr };
}

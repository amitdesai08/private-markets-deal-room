// Blob-backed document store — the lean, low-cost backend for demos / PoCs.
//
// Stores one JSON blob per document under `<collection>/<id>.json` in a single
// container on the EXISTING data storage account (the same account + managed-
// identity Blob RBAC the filing archive already uses). That means it adds **no
// new Azure resource** and is materially cheaper than Cosmos DB for small
// deal-room workloads — ideal for demos and proofs of concept.
//
// It implements exactly the seam lib/repo needs (get / upsert / saveConcurrent /
// list / remove), and maps Cosmos's optimistic concurrency onto blob ETag
// conditions so `saveConcurrent` still throws a `code: 412` on a lost update —
// the contract mutateDeal() retries on.

import { DefaultAzureCredential } from '@azure/identity';

let container = null; // ContainerClient

const blobName = (collection, id) => `${collection}/${encodeURIComponent(String(id))}.json`;

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function conflict() {
  const err = new Error('blob store: concurrent modification (412)');
  err.code = 412;
  return err;
}

// Connect to the container (created on demand) and smoke the connection with a
// cheap list so a misconfiguration fails loudly at boot, like the Cosmos path.
export async function initBlobStore(endpoint, containerName) {
  const { BlobServiceClient } = await import('@azure/storage-blob');
  const svc = new BlobServiceClient(endpoint, new DefaultAzureCredential());
  container = svc.getContainerClient(containerName);
  await container.createIfNotExists();
  // eslint-disable-next-line no-unused-vars
  for await (const _ of container.listBlobsFlat({ prefix: '__smoke__/' })) break;
  return true;
}

export async function bsGet(collection, id) {
  const client = container.getBlockBlobClient(blobName(collection, id));
  try {
    const dl = await client.download();
    const text = await streamToString(dl.readableStreamBody);
    const doc = JSON.parse(text);
    doc._etag = dl.etag; // carry the blob ETag for optimistic concurrency
    return doc;
  } catch (err) {
    if (err?.statusCode === 404) return null;
    throw err;
  }
}

export async function bsUpsert(collection, doc) {
  const client = container.getBlockBlobClient(blobName(collection, doc.id));
  const { _etag, ...clean } = doc;
  const body = JSON.stringify(clean);
  await client.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  });
  return { ...clean };
}

// Conditional write: with an ETag we require If-Match (throws 412 on a
// concurrent change); a new doc (no ETag) writes unconditionally, mirroring the
// Cosmos adapter so the authoritative-writer semantics hold under replicas.
export async function bsSaveConcurrent(collection, doc) {
  const client = container.getBlockBlobClient(blobName(collection, doc.id));
  const { _etag, ...clean } = doc;
  const body = JSON.stringify(clean);
  try {
    await client.upload(body, Buffer.byteLength(body), {
      blobHTTPHeaders: { blobContentType: 'application/json' },
      conditions: _etag ? { ifMatch: _etag } : undefined,
    });
  } catch (err) {
    if (err?.statusCode === 412) throw conflict();
    throw err;
  }
  return { ...clean };
}

export async function bsList(collection) {
  const out = [];
  for await (const item of container.listBlobsFlat({ prefix: `${collection}/` })) {
    const client = container.getBlockBlobClient(item.name);
    try {
      const dl = await client.download();
      const doc = JSON.parse(await streamToString(dl.readableStreamBody));
      doc._etag = dl.etag;
      out.push(doc);
    } catch (err) {
      if (err?.statusCode !== 404) throw err; // a blob deleted mid-list is fine
    }
  }
  return out;
}

export async function bsRemove(collection, id) {
  const client = container.getBlockBlobClient(blobName(collection, id));
  await client.deleteIfExists();
}

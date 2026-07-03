// File storage abstraction. Uses Google Cloud Storage when GCS_BUCKET is set
// (production), otherwise the local disk under backend/data (local dev/tests).
import { Storage } from '@google-cloud/storage';
import { mkdirSync, writeFileSync, createReadStream, statSync, existsSync, readFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', '..', 'data');

const BUCKET = process.env.GCS_BUCKET || '';
const useGcs = !!BUCKET;
const bucket = useGcs ? new Storage().bucket(BUCKET) : null;

const diskPath = (key) => join(DATA, key);

export async function saveFile(key, buffer, contentType) {
  if (useGcs) {
    await bucket.file(key).save(buffer, { contentType, resumable: false });
  } else {
    const p = diskPath(key);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, buffer);
  }
  return key;
}

export async function fileExists(key) {
  if (useGcs) { const [e] = await bucket.file(key).exists(); return e; }
  return existsSync(diskPath(key));
}

export async function fileSize(key) {
  if (useGcs) { const [m] = await bucket.file(key).getMetadata(); return Number(m.size); }
  return statSync(diskPath(key)).size;
}

export async function readBuffer(key) {
  if (useGcs) { const [b] = await bucket.file(key).download(); return b; }
  return readFileSync(diskPath(key));
}

// A time-limited direct GCS read URL so clients stream media straight from
// Google (fast, CDN-like) instead of proxying through this server. Returns null
// on disk mode or if signing isn't available (caller falls back to the proxy).
export async function signedReadUrl(key, minutes = 720) {
  if (!useGcs || !key) return null;
  try {
    const [url] = await bucket.file(key).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + minutes * 60 * 1000,
    });
    return url;
  } catch {
    return null;
  }
}

// Returns a readable stream (optionally a byte range) for piping to res.
export function streamFile(key, range) {
  const opts = range && range.start != null ? { start: range.start, end: range.end } : {};
  if (useGcs) return bucket.file(key).createReadStream(opts);
  return createReadStream(diskPath(key), opts);
}

export async function deleteFile(key) {
  try {
    if (useGcs) await bucket.file(key).delete();
    else unlinkSync(diskPath(key));
  } catch { /* already gone */ }
}

export function storageMode() {
  return useGcs ? `gcs:${BUCKET}` : 'disk';
}

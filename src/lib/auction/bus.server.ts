import { getStore, type Store } from "@netlify/blobs";

type Envelope = { version: number; hostId: string; state: string; token: string };
export type RoomRow = { code: string; host_id: string; version: number; state: string; etag?: string };

/**
 * Storage for rooms, accounts, sessions and saved auctions.
 *
 * On Netlify (and under `netlify dev`) everything lives in Netlify Blobs. A single
 * failed Blobs call is retried and then surfaced as an error; it never switches the
 * instance to another backend. The in-memory store below is used ONLY when no Blobs
 * environment exists at all (plain `vite dev` on a laptop), so local development
 * still works. Room state is never published to any public broker.
 */
const memoryRooms = new Map<string, { env: Envelope; etag: string }>();
const memoryKv = new Map<string, string>();
let blobStore: Store | null | undefined;
let etagSeq = 0;
let warnedNoEtag = false;

function token() {
  return Math.random().toString(16).slice(2, 12);
}

function row(code: string, env: Envelope, etag?: string): RoomRow {
  return { code, host_id: env.hostId, version: env.version, state: env.state, etag };
}

/** Returns the Blobs store, or null when this process has no Blobs environment. */
function blobs(): Store | null {
  if (blobStore !== undefined) return blobStore;
  try {
    blobStore = getStore({ name: "auction-rooms", consistency: "strong" });
  } catch (error) {
    if (process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT) {
      // On Netlify, a missing Blobs environment is a real failure: do not fall back.
      throw error;
    }
    blobStore = null;
  }
  return blobStore;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function retry<T>(work: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await work();
    } catch (error) {
      last = error;
      if (i < attempts - 1) await sleep(80 * 2 ** i);
    }
  }
  console.error("[auction] Blobs call failed after retries", last);
  throw new Error("Server storage abhi slow hai. Ek second baad try karo.");
}

export async function loadRoom(code: string): Promise<RoomRow | null> {
  const store = blobs();
  if (store) {
    const hit = await retry(() => store.getWithMetadata(code, { type: "json", consistency: "strong" }));
    if (!hit?.data) return null;
    return row(code, hit.data as Envelope, hit.etag);
  }
  const mem = memoryRooms.get(code);
  return mem ? row(code, mem.env, mem.etag) : null;
}

export async function insertRoom(code: string, hostId: string, state: string): Promise<"ok" | "taken"> {
  const env: Envelope = { version: 1, hostId, state, token: token() };
  const store = blobs();
  if (store) {
    const result = await retry(() => store.setJSON(code, env, { onlyIfNew: true }));
    return result.modified ? "ok" : "taken";
  }
  if (memoryRooms.has(code)) return "taken";
  memoryRooms.set(code, { env, etag: `m${++etagSeq}` });
  return "ok";
}

export async function saveRoom(
  code: string,
  expected: number,
  state: string,
  hostId: string,
  etag?: string,
): Promise<boolean> {
  const env: Envelope = { version: expected + 1, hostId, state, token: token() };
  const store = blobs();
  if (store) {
    let match = etag;
    if (!match) {
      const hit = await retry(() => store.getWithMetadata(code, { type: "json", consistency: "strong" }));
      const current = hit?.data as Envelope | undefined;
      if (!current || current.version !== expected) return false;
      match = hit?.etag;
    }
    if (!match) {
      // The local `netlify dev` Blobs sandbox returns no etag on reads, so a
      // compare-and-swap is impossible there. Deployed Blobs always return one.
      if (!warnedNoEtag) {
        warnedNoEtag = true;
        console.warn("[auction] Blobs returned no etag; using version-checked write (local sandbox only)");
      }
      await retry(() => store.setJSON(code, env));
      return true;
    }
    const ifMatch = match;
    const result = await retry(() => store.setJSON(code, env, { onlyIfMatch: ifMatch }));
    return result.modified;
  }
  const mem = memoryRooms.get(code);
  if (!mem || mem.env.version !== expected || (etag && mem.etag !== etag)) return false;
  memoryRooms.set(code, { env, etag: `m${++etagSeq}` });
  return true;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const store = blobs();
  if (store) {
    const value = (await retry(() => store.get(key, { type: "json", consistency: "strong" }))) as T | null;
    return value ?? null;
  }
  const raw = memoryKv.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function kvSet(key: string, value: unknown, onlyIfNew = false): Promise<boolean> {
  const store = blobs();
  if (store) {
    const result = await retry(() => store.setJSON(key, value, onlyIfNew ? { onlyIfNew: true } : {}));
    return result.modified;
  }
  if (onlyIfNew && memoryKv.has(key)) return false;
  memoryKv.set(key, JSON.stringify(value));
  return true;
}

export async function kvDel(key: string) {
  const store = blobs();
  if (store) {
    await retry(() => store.delete(key));
    return;
  }
  memoryKv.delete(key);
}

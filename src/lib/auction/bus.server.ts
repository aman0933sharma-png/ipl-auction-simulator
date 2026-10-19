import { getStore, type Store } from "@netlify/blobs";

const ROOT = "aman-ipl-auction/v1";
const BROKER = "wss://broker.hivemq.com:8884/mqtt";

type Envelope = { version: number; hostId: string; state: string; token: string };
export type RoomRow = { code: string; host_id: string; version: number; state: string; etag?: string };

const rooms = new Map<string, Envelope>();
const seen = new Set<string>();
let mqttClient: import("mqtt").MqttClient | null = null;
let connecting: Promise<import("mqtt").MqttClient> | null = null;
let connects = 0;
let blobStore: Store | null | undefined;

function topic(code: string) {
  return `${ROOT}/${code}`;
}

function token() {
  return Math.random().toString(16).slice(2, 12);
}

function row(code: string, env: Envelope): RoomRow {
  return { code, host_id: env.hostId, version: env.version, state: env.state };
}

function blobs(): Store | null {
  if (blobStore !== undefined) return blobStore;
  try {
    blobStore = getStore({ name: "auction-rooms", consistency: "strong" });
  } catch {
    blobStore = null;
  }
  return blobStore;
}

function remember(name: string, payload: Buffer): Envelope | null {
  if (!name.startsWith(`${ROOT}/`)) return null;
  const code = name.slice(ROOT.length + 1);
  if (!code || code.includes("/")) return null;
  if (!payload.length) {
    rooms.delete(code);
    return null;
  }
  try {
    const env = JSON.parse(payload.toString()) as Envelope;
    if (!env || typeof env.version !== "number" || typeof env.state !== "string") return null;
    rooms.set(code, env);
    return env;
  } catch {
    return null;
  }
}

async function broker() {
  if (mqttClient?.connected) return mqttClient;
  if (connecting) return connecting;
  connecting = (async () => {
    const mqtt = (await import("mqtt")).default;
    const next = mqtt.connect(BROKER, {
      protocolVersion: 5,
      clientId: `ipl${Math.random().toString(16).slice(2, 12)}`,
      connectTimeout: 4000,
      reconnectPeriod: 1000,
      keepalive: 20,
    });
    return new Promise<import("mqtt").MqttClient>((resolve, reject) => {
      const timer = setTimeout(() => {
        next.end(true);
        connecting = null;
        mqttClient = null;
        reject(new Error("Auction network timeout"));
      }, 4000);
      next.on("message", (name, payload) => {
        remember(name, payload);
      });
      next.on("connect", () => {
        connects += 1;
        if (connects > 1) seen.clear();
        clearTimeout(timer);
        mqttClient = next;
        connecting = null;
        resolve(next);
      });
      next.on("error", () => {
        /* mqtt.js reconnects */
      });
      next.on("close", () => {
        if (mqttClient === next && !next.connected) mqttClient = null;
      });
    });
  })();
  return connecting;
}

async function pull(code: string): Promise<Envelope | null> {
  const live = await broker();
  if (seen.has(code) && live.connected) return rooms.get(code) ?? null;
  const name = topic(code);
  await new Promise<void>((resolve, reject) => {
    live.subscribe(name, { qos: 0 }, (err) => (err ? reject(err) : resolve()));
  });
  const started = Date.now();
  while (!rooms.has(code) && Date.now() - started < 120) {
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
  seen.add(code);
  return rooms.get(code) ?? null;
}

async function publish(code: string, env: Envelope) {
  const live = await broker();
  await new Promise<void>((resolve, reject) => {
    live.publish(
      topic(code),
      JSON.stringify(env),
      { qos: 0, retain: true, properties: { messageExpiryInterval: 60 * 60 * 6 } },
      (err) => (err ? reject(err) : resolve()),
    );
  });
  const current = rooms.get(code);
  if (!current || current.version <= env.version) rooms.set(code, env);
}

export async function loadRoom(code: string): Promise<RoomRow | null> {
  const store = blobs();
  if (store) {
    try {
      const hit = await store.getWithMetadata(code, { type: "json", consistency: "strong" });
      if (!hit?.data) return null;
      const env = hit.data as Envelope;
      return { ...row(code, env), etag: hit.etag };
    } catch {
      blobStore = null;
    }
  }
  const env = await pull(code);
  return env ? row(code, env) : null;
}

export async function insertRoom(code: string, hostId: string, state: string): Promise<"ok" | "taken"> {
  const env = { version: 1, hostId, state, token: token() };
  const store = blobs();
  if (store) {
    try {
      const result = await store.setJSON(code, env, { onlyIfNew: true });
      return result.modified ? "ok" : "taken";
    } catch {
      blobStore = null;
    }
  }
  const existing = await pull(code);
  if (existing) return "taken";
  await publish(code, env);
  return rooms.get(code)?.token === env.token ? "ok" : "taken";
}

export async function saveRoom(
  code: string,
  expected: number,
  state: string,
  hostId: string,
  etag?: string,
): Promise<boolean> {
  const env = { version: expected + 1, hostId, state, token: token() };
  const store = blobs();
  if (store) {
    try {
      if (etag) {
        const result = await store.setJSON(code, env, { onlyIfMatch: etag });
        return result.modified;
      }
      const hit = await store.getWithMetadata(code, { type: "json", consistency: "strong" });
      const current = hit?.data as Envelope | undefined;
      if (!current || current.version !== expected || !hit?.etag) return false;
      const result = await store.setJSON(code, env, { onlyIfMatch: hit.etag });
      return result.modified;
    } catch {
      blobStore = null;
    }
  }
  const current = await pull(code);
  if (!current || current.version !== expected) return false;
  await publish(code, env);
  return rooms.get(code)?.token === env.token && rooms.get(code)?.version === env.version;
}

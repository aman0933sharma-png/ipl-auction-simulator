import mqtt, { type MqttClient } from "mqtt";

const ROOT = "aman-ipl-auction/v1";
const BROKER = "wss://broker.hivemq.com:8884/mqtt";

type Envelope = { version: number; hostId: string; state: string; token: string };
export type RoomRow = { code: string; host_id: string; version: number; state: string };

const rooms = new Map<string, Envelope>();
const seen = new Set<string>();
let client: MqttClient | null = null;
let connecting: Promise<MqttClient> | null = null;
let connects = 0;

function topic(code: string) {
  return `${ROOT}/${code}`;
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

function broker(): Promise<MqttClient> {
  if (client?.connected) return Promise.resolve(client);
  if (connecting) return connecting;
  connecting = new Promise((resolve, reject) => {
    const next = mqtt.connect(BROKER, {
      protocolVersion: 5,
      clientId: `ipl${Math.random().toString(16).slice(2, 12)}`,
      connectTimeout: 8000,
      reconnectPeriod: 1000,
      keepalive: 20,
    });
    const timer = setTimeout(() => {
      next.end(true);
      connecting = null;
      client = null;
      reject(new Error("Auction network timeout"));
    }, 8000);
    next.on("message", (name, payload) => {
      remember(name, payload);
    });
    next.on("connect", () => {
      connects += 1;
      if (connects > 1) seen.clear();
      clearTimeout(timer);
      client = next;
      connecting = null;
      resolve(next);
    });
    next.on("error", () => {
      /* mqtt.js reconnects */
    });
    next.on("close", () => {
      if (client === next && !next.connected) client = null;
    });
  });
  return connecting;
}

function row(code: string, env: Envelope): RoomRow {
  return { code, host_id: env.hostId, version: env.version, state: env.state };
}

async function pull(code: string): Promise<Envelope | null> {
  const live = await broker();
  if (seen.has(code) && live.connected) return rooms.get(code) ?? null;
  const name = topic(code);
  return new Promise((resolve, reject) => {
    const finish = (env: Envelope | null) => {
      clearTimeout(timer);
      live.removeListener("message", onMessage);
      seen.add(code);
      resolve(env);
    };
    const timer = setTimeout(() => finish(rooms.get(code) ?? null), 800);
    const onMessage = (got: string, payload: Buffer) => {
      if (got !== name) return;
      finish(remember(got, payload));
    };
    live.on("message", onMessage);
    live.subscribe(name, { qos: 1 }, (err) => {
      if (err) {
        clearTimeout(timer);
        live.removeListener("message", onMessage);
        reject(err);
      }
    });
  });
}

function token() {
  return Math.random().toString(16).slice(2, 12);
}

async function publish(code: string, env: Envelope) {
  const live = await broker();
  await new Promise<void>((resolve, reject) => {
    live.publish(
      topic(code),
      JSON.stringify(env),
      { qos: 1, retain: true, properties: { messageExpiryInterval: 60 * 60 * 6 } },
      (err) => (err ? reject(err) : resolve()),
    );
  });
  rooms.set(code, env);
}

export async function loadRoom(code: string): Promise<RoomRow | null> {
  const env = await pull(code);
  return env ? row(code, env) : null;
}

export async function insertRoom(code: string, hostId: string, state: string): Promise<"ok" | "taken"> {
  const existing = await pull(code);
  if (existing) return "taken";
  const env = { version: 1, hostId, state, token: token() };
  await publish(code, env);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const latest = await pull(code);
  if (latest?.token === env.token) return "ok";
  return "taken";
}

export async function saveRoom(
  code: string,
  expected: number,
  state: string,
  hostId: string,
): Promise<boolean> {
  const current = await pull(code);
  if (!current || current.version !== expected) return false;
  const env = { version: expected + 1, hostId, state, token: token() };
  await publish(code, env);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const latest = await pull(code);
  return latest?.token === env.token && latest.version === env.version;
}

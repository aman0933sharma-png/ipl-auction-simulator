import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { addPlayer, beginAuction, forceClose, freshRoom, passLot, placeBid, resolveDue, seat, type RoomState } from "./state";
import { getKind, type AuctionKind } from "./catalog";
import { insertRoom, loadRoom, saveRoom } from "./bus.server";
import { endSession, loginAccount, readSession, registerAccount } from "./accounts.server";

const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,8}$/, "Room code 4–8 letters ya numbers ka hona chahiye.");

const label = z.string().trim().min(2).max(22);
const tokenSchema = z.string().regex(/^[a-f0-9]{48}$/);

const joinSchema = z.object({
  code: codeSchema,
  token: tokenSchema,
  kind: z.enum(["ipl", "cars", "bikes"]).optional(),
});

const actSchema = z.object({
  code: codeSchema,
  token: tokenSchema,
});

const authSchema = z.object({
  name: label,
  password: z.string().min(4).max(40),
});

type Row = { code: string; host_id: string; version: number; state: string; etag?: string };

function sharedStore() {
  return !process.env.DATABASE_URL?.trim();
}

function parseState(raw: string | RoomState): RoomState {
  if (typeof raw === "string") return JSON.parse(raw) as RoomState;
  return raw;
}

async function load(code: string): Promise<Row | null> {
  if (sharedStore()) {
    return loadRoom(code);
  }
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql.query<Row>(
    "select code, host_id, version, state from auction_rooms where code = $1",
    [code],
  );
  return rows[0] ?? null;
}

async function save(code: string, expected: number, state: RoomState, etag?: string): Promise<boolean> {
  if (sharedStore()) {
    return saveRoom(code, expected, JSON.stringify(state), state.hostId, etag);
  }
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql.query<{ version: number }>(
    `update auction_rooms
        set state = $1, version = version + 1, host_id = $2, updated_at = now()
      where code = $3 and version = $4
      returning version`,
    [JSON.stringify(state), state.hostId, code, expected],
  );
  return rows.length > 0;
}

async function owner(token: string) {
  const user = await readSession(token);
  if (!user) throw new Error("Login khatam ho gaya. Dubara login karo.");
  return user;
}

export const signUp = createServerFn({ method: "POST" })
  .validator((input: unknown) => authSchema.extend({ team: label }).parse(input))
  .handler(async ({ data }) => registerAccount(data.name, data.password, data.team));

export const signIn = createServerFn({ method: "POST" })
  .validator((input: unknown) => authSchema.parse(input))
  .handler(async ({ data }) => loginAccount(data.name, data.password));

export const currentProfile = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data }) => {
    const user = await readSession(data.token);
    if (!user) throw new Error("Login khatam ho gaya.");
    return user;
  });

export const signOut = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data }) => {
    await endSession(data.token);
    return { ok: true };
  });

async function mutate(code: string, change: (state: RoomState, version: number) => RoomState): Promise<RoomState> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const row = await load(code);
    if (!row) throw new Error("Room nahi mila. Code check karo.");
    const current = resolveDue(parseState(row.state), Date.now());
    const next = change(current, row.version);
    if (JSON.stringify(next) === JSON.stringify(current)) return current;
    const ok = await save(code, row.version, next, row.etag);
    if (ok) return next;
  }
  throw new Error("Room busy hai. Ek second baad try karo.");
}

export const syncRoom = createServerFn({ method: "POST" })
  .validator((input: unknown) => actSchema.parse(input))
  .handler(async ({ data }) => {
    await owner(data.token);
    const row = await load(data.code);
    if (!row) throw new Error("Room nahi mila. Code check karo.");
    const current = parseState(row.state);
    const next = resolveDue(current, Date.now());
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      await save(data.code, row.version, next, row.etag);
      const fresh = await load(data.code);
      return fresh ? parseState(fresh.state) : next;
    }
    return current;
  });

export const createRoom = createServerFn({ method: "POST" })
  .validator((input: unknown) => joinSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await owner(data.token);
    const kind = (data.kind ?? "ipl") as AuctionKind;
    const host = seat(user.id, user.name, user.team, getKind(kind).purse);
    if (sharedStore()) {
      const placed = await insertRoom(data.code, host.id, JSON.stringify(freshRoom(data.code, host, kind)));
      if (placed === "ok") return freshRoom(data.code, host, kind);
    }
    const existing = await load(data.code);
    if (existing) {
      const state = parseState(existing.state);
      const mine = state.players.some((p) => p.id === user.id);
      if (state.phase === "lobby" && (mine || state.players.length === 0)) {
        return mutate(data.code, (state) =>
          addPlayer(state, seat(user.id, user.name, user.team, getKind(state.kind).purse)),
        );
      }
      if (mine) return resolveDue(state, Date.now());
      throw new Error("Ye room code pehle se use ho raha hai. Doosra code try karo.");
    }
    const state = freshRoom(data.code, host, kind);
    if (sharedStore()) {
      const placed = await insertRoom(data.code, host.id, JSON.stringify(state));
      if (placed === "ok") return state;
      return mutate(data.code, (s) => addPlayer(s, host));
    }
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    try {
      await sql.query(
        `insert into auction_rooms (code, host_id, version, state)
         values ($1, $2, 1, $3)`,
        [data.code, host.id, JSON.stringify(state)],
      );
    } catch (error) {
      const again = await load(data.code);
      if (again) {
        const existingState = parseState(again.state);
        if (existingState.players.some((p) => p.id === user.id) || existingState.phase === "lobby") {
          return mutate(data.code, (s) => addPlayer(s, host));
        }
      }
      const detail = error instanceof Error ? error.message : "";
      if (/duplicate|unique/i.test(detail)) {
        throw new Error("Ye room code pehle se use ho raha hai. Doosra code try karo, ya Code se join dabao.");
      }
      throw new Error(detail || "Room nahi bana. Dubara try karo.");
    }
    return state;
  });

export const joinRoom = createServerFn({ method: "POST" })
  .validator((input: unknown) => joinSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await owner(data.token);
    return mutate(data.code, (state) =>
      addPlayer(state, seat(user.id, user.name, user.team, getKind(state.kind).purse)),
    );
  });

export const startAuction = createServerFn({ method: "POST" })
  .validator((input: unknown) => actSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await owner(data.token);
    return mutate(data.code, (state) => beginAuction(state, user.id, Date.now()));
  });

export const bid = createServerFn({ method: "POST" })
  .validator((input: unknown) => actSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await owner(data.token);
    return mutate(data.code, (state) => placeBid(state, user.id, Date.now()));
  });

export const pass = createServerFn({ method: "POST" })
  .validator((input: unknown) => actSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await owner(data.token);
    return mutate(data.code, (state) => passLot(state, user.id, Date.now()));
  });

export const closeLot = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    actSchema.extend({ mode: z.enum(["sell", "unsold"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    const user = await owner(data.token);
    return mutate(data.code, (state) => forceClose(state, user.id, Date.now(), data.mode));
  });

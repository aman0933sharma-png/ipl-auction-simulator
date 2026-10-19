import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { addPlayer, beginAuction, forceClose, freshRoom, placeBid, resolveDue, seat, type RoomState } from "./state";

const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,8}$/, "Room code 4–8 letters ya numbers ka hona chahiye.");

const idSchema = z.string().regex(/^[a-zA-Z0-9]{8,32}$/);
const label = z.string().trim().min(2).max(22);

const joinSchema = z.object({
  code: codeSchema,
  playerId: idSchema,
  name: label,
  team: label,
});

const actSchema = z.object({
  code: codeSchema,
  playerId: idSchema,
});

type Row = { code: string; host_id: string; version: number; state: string };

function parseState(raw: string): RoomState {
  return JSON.parse(raw) as RoomState;
}

async function load(code: string): Promise<Row | null> {
  const sql = await getSql();
  const rows = await sql.query<Row>(
    "select code, host_id, version, state from auction_rooms where code = $1",
    [code],
  );
  return rows[0] ?? null;
}

async function save(code: string, expected: number, state: RoomState): Promise<boolean> {
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

async function mutate(code: string, change: (state: RoomState, version: number) => RoomState): Promise<RoomState> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const row = await load(code);
    if (!row) throw new Error("Room nahi mila. Code check karo.");
    const current = resolveDue(parseState(row.state), Date.now());
    const next = change(current, row.version);
    if (JSON.stringify(next) === JSON.stringify(current)) return current;
    const ok = await save(code, row.version, next);
    if (ok) return next;
  }
  throw new Error("Room busy hai. Ek second baad try karo.");
}

export const syncRoom = createServerFn({ method: "POST" })
  .validator((input: unknown) => actSchema.parse(input))
  .handler(async ({ data }) => {
    const row = await load(data.code);
    if (!row) throw new Error("Room nahi mila. Code check karo.");
    const current = parseState(row.state);
    const next = resolveDue(current, Date.now());
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      await save(data.code, row.version, next);
      const fresh = await load(data.code);
      return fresh ? parseState(fresh.state) : next;
    }
    return current;
  });

export const createRoom = createServerFn({ method: "POST" })
  .validator((input: unknown) => joinSchema.parse(input))
  .handler(async ({ data }) => {
    const existing = await load(data.code);
    if (existing) {
      const state = parseState(existing.state);
      const mine = state.players.some((p) => p.id === data.playerId);
      if (state.phase === "lobby" && (mine || state.players.length === 0)) {
        return mutate(data.code, (s) => addPlayer(s, seat(data.playerId, data.name, data.team)));
      }
      if (mine) return resolveDue(state, Date.now());
      throw new Error("Ye room code pehle se use ho raha hai. Doosra code try karo.");
    }
    const host = seat(data.playerId, data.name, data.team);
    const state = freshRoom(data.code, host);
    const sql = await getSql();
    await sql.query(
      `insert into auction_rooms (code, host_id, version, state)
       values ($1, $2, 1, $3)`,
      [data.code, host.id, JSON.stringify(state)],
    );
    return state;
  });

export const joinRoom = createServerFn({ method: "POST" })
  .validator((input: unknown) => joinSchema.parse(input))
  .handler(async ({ data }) => {
    return mutate(data.code, (state) => addPlayer(state, seat(data.playerId, data.name, data.team)));
  });

export const startAuction = createServerFn({ method: "POST" })
  .validator((input: unknown) => actSchema.parse(input))
  .handler(async ({ data }) => {
    return mutate(data.code, (state) => beginAuction(state, data.playerId, Date.now()));
  });

export const bid = createServerFn({ method: "POST" })
  .validator((input: unknown) => actSchema.parse(input))
  .handler(async ({ data }) => {
    return mutate(data.code, (state) => placeBid(state, data.playerId, Date.now()));
  });

export const closeLot = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    actSchema.extend({ mode: z.enum(["sell", "unsold"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    return mutate(data.code, (state) => forceClose(state, data.playerId, Date.now(), data.mode));
  });

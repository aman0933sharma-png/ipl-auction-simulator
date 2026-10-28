import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { kvDel, kvGet, kvSet } from "./bus.server";
import { MIN_NEW_PASSWORD } from "./catalog";
import type { Desk, SavedItem } from "./library";
import type { RoomState } from "./state";

const scryptAsync = promisify(scrypt);
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/** After this many wrong passwords in a row, the name is locked for LOCK_MS. */
const MAX_FAILS = 5;
const LOCK_MS = 10 * MINUTE;
/** Failures older than this are forgotten. */
const FAIL_WINDOW_MS = 15 * MINUTE;

type FailRecord = { count: number; first: number; lockedUntil: number };

type Account = { id: string; name: string; team: string; salt: string; hash: string };
type Session = { id: string; name: string; team: string; exp: number };

export type PublicProfile = { id: string; name: string; team: string; token: string };

function slug(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function acctKey(name: string) {
  return `acct-${Buffer.from(slug(name)).toString("hex").slice(0, 80)}`;
}

function failKey(name: string) {
  return `fail-${Buffer.from(slug(name)).toString("hex").slice(0, 80)}`;
}

async function readFails(name: string): Promise<FailRecord | null> {
  const rec = await kvGet<FailRecord>(failKey(name));
  if (!rec) return null;
  if (rec.lockedUntil <= Date.now() && Date.now() - rec.first > FAIL_WINDOW_MS) return null;
  return rec;
}

async function noteFail(name: string) {
  const now = Date.now();
  const prev = await readFails(name);
  // A lock that already ran out starts a fresh count.
  const carry = prev && !(prev.lockedUntil > 0 && prev.lockedUntil <= now) ? prev : null;
  const count = (carry?.count ?? 0) + 1;
  const rec: FailRecord = {
    count,
    first: carry?.first ?? now,
    lockedUntil: count >= MAX_FAILS ? now + LOCK_MS : 0,
  };
  await kvSet(failKey(name), rec);
}

function lockMessage(until: number) {
  const mins = Math.max(1, Math.ceil((until - Date.now()) / MINUTE));
  return `Bahut baar galat password. ${mins} minute baad try karo.`;
}

function sessKey(token: string) {
  return `sess-${token}`;
}

async function hashPassword(password: string, salt: string) {
  const buf = (await scryptAsync(password, salt, 32)) as Buffer;
  return buf.toString("hex");
}

function newId() {
  return randomBytes(8).toString("hex");
}

export async function registerAccount(name: string, password: string, team: string): Promise<PublicProfile> {
  const clean = name.trim();
  const crew = team.trim();
  if (clean.length < 2 || clean.length > 22) throw new Error("Name 2 se 22 letters ka hona chahiye.");
  if (crew.length < 2 || crew.length > 22) throw new Error("Team name 2 se 22 letters ka hona chahiye.");
  if (password.length < MIN_NEW_PASSWORD || password.length > 40) {
    throw new Error(`Password kam se kam ${MIN_NEW_PASSWORD} characters ka hona chahiye.`);
  }
  const salt = randomBytes(16).toString("hex");
  const account: Account = {
    id: newId(),
    name: clean,
    team: crew,
    salt,
    hash: await hashPassword(password, salt),
  };
  const saved = await kvSet(acctKey(clean), account, true);
  if (!saved) throw new Error("Ye name pehle se hai. Login karo.");
  return openSession(account);
}

export async function loginAccount(name: string, password: string): Promise<PublicProfile> {
  const fails = await readFails(name);
  if (fails && fails.lockedUntil > Date.now()) throw new Error(lockMessage(fails.lockedUntil));
  const account = await kvGet<Account>(acctKey(name));
  if (!account) {
    await noteFail(name);
    throw new Error("Name ya password galat hai.");
  }
  const hash = await hashPassword(password, account.salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(account.hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await noteFail(name);
    throw new Error("Name ya password galat hai.");
  }
  if (fails) await kvDel(failKey(name));
  return openSession(account);
}

async function openSession(account: Account): Promise<PublicProfile> {
  const token = randomBytes(24).toString("hex");
  const session: Session = { id: account.id, name: account.name, team: account.team, exp: Date.now() + 30 * DAY };
  await kvSet(sessKey(token), session);
  return { id: account.id, name: account.name, team: account.team, token };
}

export async function readSession(token: string): Promise<PublicProfile | null> {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const session = await kvGet<Session>(sessKey(token));
  if (!session || session.exp < Date.now()) return null;
  return { id: session.id, name: session.name, team: session.team, token };
}

export async function endSession(token: string) {
  if (/^[a-f0-9]{48}$/.test(token)) await kvDel(sessKey(token));
}

function libKey(userId: string) {
  return `lib-${userId}`;
}

export async function readDesk(userId: string): Promise<Desk> {
  return (await kvGet<Desk>(libKey(userId))) ?? { open: [], squads: [] };
}

export async function saveLibrary(userId: string, state: RoomState) {
  const me = state.players.find((player) => player.id === userId);
  if (!me) return;
  const desk = await readDesk(userId);
  if (state.phase === "done") {
    const items: SavedItem[] = me.squad.map((item) => ({
      name: item.name,
      country: item.country,
      role: item.role,
      group: item.group,
      soldFor: item.soldFor,
    }));
    desk.open = desk.open.filter((auction) => auction.code !== state.code);
    desk.squads = [
      {
        code: state.code,
        kind: state.kind,
        team: me.team,
        finishedAt: Date.now(),
        purse: me.purse,
        items,
      },
      ...desk.squads.filter((squad) => squad.code !== state.code),
    ].slice(0, 20);
  } else {
    desk.open = [
      { code: state.code, kind: state.kind, phase: state.phase, updatedAt: Date.now() },
      ...desk.open.filter((auction) => auction.code !== state.code),
    ].slice(0, 8);
  }
  await kvSet(libKey(userId), desk);
}

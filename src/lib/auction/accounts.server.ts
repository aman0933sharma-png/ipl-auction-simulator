import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { kvDel, kvGet, kvSet } from "./bus.server";

const scryptAsync = promisify(scrypt);
const DAY = 24 * 60 * 60 * 1000;

type Account = { id: string; name: string; team: string; salt: string; hash: string };
type Session = { id: string; name: string; team: string; exp: number };

export type PublicProfile = { id: string; name: string; team: string; token: string };

function slug(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function acctKey(name: string) {
  return `acct-${Buffer.from(slug(name)).toString("hex").slice(0, 80)}`;
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
  if (password.length < 4 || password.length > 40) throw new Error("Password kam se kam 4 characters ka hona chahiye.");
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
  const account = await kvGet<Account>(acctKey(name));
  if (!account) throw new Error("Name ya password galat hai.");
  const hash = await hashPassword(password, account.salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(account.hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Name ya password galat hai.");
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

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Gavel, Play, Users } from "lucide-react";
import {
  KINDS,
  MIN_NEW_PASSWORD,
  formatCr,
  getKind,
  lotTitle,
  type AuctionKind,
} from "@/lib/auction/catalog";
import {
  bid,
  closeLot,
  currentProfile,
  createRoom,
  joinRoom,
  myDesk,
  pass,
  signIn,
  signOut,
  signUp,
  startAuction,
  syncRoom,
} from "@/lib/auction/server";
import {
  blockReason,
  freshRoom,
  passLot,
  placeBid,
  seat,
  squadFull,
  type RoomState,
  type Seat,
} from "@/lib/auction/state";
import { Results } from "@/components/auction-results";
import type { Desk } from "@/lib/auction/library";
import { downloadSquadPdf } from "@/lib/auction/squad-pdf";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode() {
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  for (const b of bytes) code += ALPHA[b % ALPHA.length];
  return code;
}

function messageOf(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "Bid nahi lagi. Ek baar aur tap karo.";
}

function withTimeout<T>(work: Promise<T>, ms = 7000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Network slow hai. Dono phones sync ho rahe hain.")),
      ms,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function CodeTiles({ value }: { value: string }) {
  const chars = (value || "----").padEnd(4, "·").slice(0, 8).split("");
  return (
    <div className="flex flex-wrap justify-center gap-2" aria-label={`Room code ${value}`}>
      {chars.map((ch, i) => (
        <span
          key={`${ch}-${i}`}
          style={{ animationDelay: `${i * 60}ms` }}
          className="tile flex h-16 w-12 items-center justify-center rounded-2xl border border-white/80 bg-white/80 font-display text-3xl font-extrabold tracking-wide text-gold shadow-[0_10px_24px_rgba(150,170,200,0.22)]"
        >
          {ch}
        </span>
      ))}
    </div>
  );
}

type Profile = { id: string; name: string; team: string; token: string };

export function AuctionDesk() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"host" | "join">("host");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [kind, setKind] = useState<AuctionKind>("ipl");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [desk, setDesk] = useState<Desk>({ open: [], squads: [] });
  const [now, setNow] = useState(() => Date.now());
  const confirmedRev = useRef(0);
  const pendingRef = useRef<{ base: number; index: number } | null>(null);
  const pullRef = useRef<() => void>(() => {});
  const kickedEnd = useRef(0);
  const holdSync = useRef(false);
  const playerId = profile?.id ?? "";
  const token = profile?.token ?? "";

  useEffect(() => {
    const saved = localStorage.getItem("auction-token");
    if (!saved || !/^[a-f0-9]{48}$/.test(saved)) {
      setAuthReady(true);
      return;
    }
    currentProfile({ data: { token: saved } })
      .then((user) => {
        setProfile(user);
        setName(user.name);
        setTeam(user.team);
      })
      .catch(() => localStorage.removeItem("auction-token"))
      .finally(() => setAuthReady(true));
  }, []);

  function takeServer(next: RoomState) {
    const rev = next.rev ?? 0;
    if (rev < confirmedRev.current) return;
    const pending = pendingRef.current;
    if (pending && rev <= pending.base && next.index === pending.index && next.phase === "live")
      return;
    confirmedRev.current = rev;
    if (!pending || rev > pending.base || next.index !== pending.index || next.phase !== "live") {
      pendingRef.current = null;
    }
    setRoom(next);
  }

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!room || !token) return;
    let stop = false;
    const pull = async () => {
      try {
        const next = await syncRoom({ data: { code: room.code, token } });
        if (stop || holdSync.current) return;
        takeServer(next);
      } catch {
        /* keep last good snapshot */
      }
    };
    pullRef.current = () => {
      void pull();
    };
    void pull();
    // ~1s while bidding, ~2s in the lobby. Own actions update instantly from the
    // server reply, and the timer-expiry effect below pulls right when a lot ends.
    const id = window.setInterval(
      pull,
      room.phase === "lobby" ? 2000 : room.phase === "done" ? 5000 : 1000,
    );
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [room?.code, room?.phase, token]);

  useEffect(() => {
    if (!token) return;
    myDesk({ data: { token } })
      .then(setDesk)
      .catch(() => undefined);
  }, [token, room?.code, room?.phase]);

  useEffect(() => {
    if (!room || room.phase !== "live" || !room.endsAt) return;
    if (now < room.endsAt) return;
    if (kickedEnd.current === room.endsAt) return;
    kickedEnd.current = room.endsAt;
    pullRef.current();
  }, [now, room?.endsAt, room?.phase]);

  const draft = code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

  async function enter(action: "host" | "join") {
    if (!profile) return;
    setError("");
    if (draft.length < 4) {
      setError("Room code kam se kam 4 characters ka hona chahiye.");
      return;
    }
    setBusy(true);
    holdSync.current = true;
    const spec = getKind(kind);
    const local = freshRoom(draft, seat(profile.id, profile.name, profile.team, spec.purse), kind);
    setCode(draft);
    setRoom(
      action === "join" ? { ...local, hostId: "", commentary: "Room join ho raha hai..." } : local,
    );
    try {
      const payload = { code: draft, token, kind };
      const next =
        action === "host" ? await createRoom({ data: payload }) : await joinRoom({ data: payload });
      setRoom(next);
      setCode(next.code);
      confirmedRev.current = next.rev ?? 0;
    } catch (err) {
      setRoom(null);
      setError(messageOf(err));
    } finally {
      holdSync.current = false;
      setBusy(false);
    }
  }

  async function onStart() {
    if (!room || !token) return;
    setBusy(true);
    setError("");
    try {
      setRoom(await startAuction({ data: { code: room.code, token } }));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function onBid() {
    if (!room || !token || pendingRef.current) return;
    const live = room.phase === "live" && Date.now() < room.endsAt;
    if (!live) {
      setError("Time khatam. Is lot pe bid band ho gayi.");
      pullRef.current();
      return;
    }
    const index = room.index;
    try {
      const optimistic = placeBid(room, playerId, Date.now(), index);
      pendingRef.current = { base: room.rev ?? 0, index: room.index };
      if (optimistic.index === room.index) setRoom(optimistic);
      setError("");
    } catch (err) {
      setError(messageOf(err));
      return;
    }
    try {
      const next = await withTimeout(bid({ data: { code: room.code, token, index } }));
      pendingRef.current = null;
      takeServer(next);
    } catch (err) {
      pendingRef.current = null;
      setError(messageOf(err));
      pullRef.current();
    }
  }

  async function onPass() {
    if (!room || !token || pendingRef.current) return;
    const live = room.phase === "live" && Date.now() < room.endsAt;
    if (!live) {
      pullRef.current();
      return;
    }
    const index = room.index;
    try {
      const optimistic = passLot(room, playerId, Date.now(), index);
      pendingRef.current = { base: room.rev ?? 0, index: room.index };
      if (optimistic.index === room.index) setRoom(optimistic);
      setError("");
    } catch (err) {
      setError(messageOf(err));
      return;
    }
    try {
      const next = await withTimeout(pass({ data: { code: room.code, token, index } }));
      pendingRef.current = null;
      takeServer(next);
    } catch (err) {
      pendingRef.current = null;
      setError(messageOf(err));
      pullRef.current();
    }
  }

  async function onClose(mode: "sell" | "unsold") {
    if (!room || !token || room.phase !== "live") return;
    setBusy(true);
    setError("");
    try {
      const next = await withTimeout(
        closeLot({ data: { code: room.code, token, index: room.index, mode } }),
      );
      takeServer(next);
    } catch (err) {
      setError(messageOf(err));
      pullRef.current();
    } finally {
      setBusy(false);
    }
  }

  async function resume(savedCode: string) {
    if (!profile) return;
    setError("");
    setBusy(true);
    holdSync.current = true;
    try {
      const next = await joinRoom({ data: { code: savedCode, token: profile.token } });
      setRoom(next);
      setCode(next.code);
      confirmedRev.current = next.rev ?? 0;
    } catch (err) {
      setError(messageOf(err));
    } finally {
      holdSync.current = false;
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy nahi hua. Code khud select karke bhej do.");
    }
  }

  async function logout() {
    const current = profile?.token;
    setProfile(null);
    setRoom(null);
    setPassword("");
    localStorage.removeItem("auction-token");
    if (current) void signOut({ data: { token: current } }).catch(() => undefined);
  }

  async function onAuth() {
    setError("");
    if (authMode === "signup" && password.length < MIN_NEW_PASSWORD) {
      setError(`Password kam se kam ${MIN_NEW_PASSWORD} characters ka hona chahiye.`);
      return;
    }
    setBusy(true);
    try {
      const user =
        authMode === "login"
          ? await signIn({ data: { name: name.trim(), password } })
          : await signUp({ data: { name: name.trim(), password, team: team.trim() } });
      localStorage.setItem("auction-token", user.token);
      setProfile(user);
      setPassword("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (!authReady) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4">
        <p className="text-muted">Profile khul raha hai...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="rise mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8">
        <Header title="Auction" />
        <AuthScreen
          mode={authMode}
          setMode={setAuthMode}
          name={name}
          setName={setName}
          password={password}
          setPassword={setPassword}
          team={team}
          setTeam={setTeam}
          busy={busy}
          error={error}
          onSubmit={onAuth}
        />
      </main>
    );
  }

  if (!room || room.phase === "lobby") {
    return (
      <main className="rise mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8">
        <Header title={room ? getKind(room.kind).title : "Auction"} />
        {room ? (
          <Lobby
            room={room}
            playerId={playerId}
            busy={busy}
            error={error}
            copied={copied}
            onStart={onStart}
            onCopy={copyCode}
          />
        ) : (
          <>
            <SavedPanel desk={desk} busy={busy} onResume={resume} />
            <Gate
              mode={mode}
              setMode={setMode}
              draft={draft}
              setCode={setCode}
              name={name}
              setName={setName}
              team={team}
              setTeam={setTeam}
              kind={kind}
              setKind={setKind}
              busy={busy}
              error={error}
              onRandom={() => setCode(randomCode())}
              onEnter={() => enter(mode)}
              profile={profile}
              onLogout={logout}
            />
          </>
        )}
      </main>
    );
  }

  return (
    <Board
      room={room}
      playerId={playerId}
      now={now}
      error={error}
      onBid={onBid}
      onPass={onPass}
      onClose={onClose}
      busy={busy}
      onLogout={logout}
      onHome={() => setRoom(null)}
    />
  );
}

function SavedPanel(props: { desk: Desk; busy: boolean; onResume: (code: string) => void }) {
  if (props.desk.open.length === 0 && props.desk.squads.length === 0) return null;
  return (
    <section className="mb-4 grid gap-3">
      {props.desk.open.length > 0 ? (
        <div className="glass rounded-[28px] p-5">
          <p className="font-display text-2xl">Purani auction</p>
          <p className="mt-1 text-sm text-muted">
            Phone band karne ke baad yahi se resume karo, ya neeche nayi shuru karo.
          </p>
          <div className="mt-3 grid gap-2">
            {props.desk.open.map((auction) => (
              <button
                key={auction.code}
                type="button"
                disabled={props.busy}
                onClick={() => props.onResume(auction.code)}
                className="flex min-h-12 items-center justify-between rounded-2xl border border-line bg-white px-4 text-left"
              >
                <span className="font-semibold">
                  {auction.code} · {auction.kind}
                </span>
                <span className="text-sm text-gold">
                  {auction.phase === "live" ? "Resume" : "Lobby"}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {props.desk.squads.length > 0 ? (
        <div className="glass rounded-[28px] p-5">
          <p className="font-display text-2xl">Saved squads</p>
          <div className="mt-3 grid gap-2">
            {props.desk.squads.map((squad) => (
              <div
                key={`${squad.code}-${squad.finishedAt}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3"
              >
                <div>
                  <p className="font-semibold">
                    {squad.team} · {squad.code}
                  </p>
                  <p className="text-sm text-muted">
                    {squad.kind} · {squad.items.length} lots · {formatCr(squad.purse)} left
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadSquadPdf(squad)}
                  className="btn-gloss min-h-10 rounded-xl px-3 text-sm font-semibold"
                >
                  PDF
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Header(props: { title: string }) {
  return (
    <header className="mb-8 flex items-end justify-between gap-4">
      <div>
        <p className="font-display text-sm tracking-[0.32em] text-primary">LIVE AUCTION</p>
        <h1 className="font-display text-5xl font-extrabold leading-none text-fg">{props.title}</h1>
      </div>
      <span className="glass sheen grid size-14 place-items-center rounded-2xl">
        <Gavel className="size-7 text-primary" aria-hidden="true" />
      </span>
    </header>
  );
}

function AuthScreen(props: {
  mode: "login" | "signup";
  setMode: (mode: "login" | "signup") => void;
  name: string;
  setName: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  team: string;
  setTeam: (v: string) => void;
  busy: boolean;
  error: string;
  onSubmit: () => void;
}) {
  return (
    <section className="glass rounded-[28px] p-5 sm:p-8">
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-raised/80 p-1">
        {(
          [
            ["login", "Login"],
            ["signup", "Sign up"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => props.setMode(id)}
            className={
              props.mode === id
                ? "btn-gloss min-h-11 rounded-xl font-semibold"
                : "min-h-11 rounded-xl font-medium text-muted"
            }
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted">
        {props.mode === "login"
          ? "Apna name aur password daalo. Team profile se aa jaayegi."
          : "Name, password aur team name set karo. Ye profile save ho jaayegi."}
      </p>
      <div className="grid gap-3">
        <Field
          id="auth-name"
          label="Name"
          value={props.name}
          onChange={props.setName}
          placeholder="Aman"
        />
        <Field
          id="auth-password"
          label="Password"
          value={props.password}
          onChange={props.setPassword}
          placeholder={
            props.mode === "signup" ? `Kam se kam ${MIN_NEW_PASSWORD} characters` : "••••••"
          }
          type="password"
        />
        {props.mode === "signup" ? (
          <Field
            id="auth-team"
            label="Team name"
            value={props.team}
            onChange={props.setTeam}
            placeholder="Pahadi XI"
          />
        ) : null}
      </div>
      {props.error ? <p className="mt-4 text-sm text-primary">{props.error}</p> : null}
      <button
        type="button"
        disabled={props.busy}
        onClick={props.onSubmit}
        className="btn-gloss mt-6 min-h-12 w-full rounded-2xl font-semibold disabled:opacity-50"
      >
        {props.busy ? "Ruk jao..." : props.mode === "login" ? "Login" : "Profile banao"}
      </button>
    </section>
  );
}

function Gate(props: {
  mode: "host" | "join";
  setMode: (m: "host" | "join") => void;
  draft: string;
  setCode: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  team: string;
  setTeam: (v: string) => void;
  kind: AuctionKind;
  setKind: (k: AuctionKind) => void;
  busy: boolean;
  error: string;
  onRandom: () => void;
  onEnter: () => void;
  profile: Profile;
  onLogout: () => void;
}) {
  return (
    <section className="glass sheen rise rounded-[28px] p-5 sm:p-8">
      <div className="relative mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-raised/80 p-1">
        {(
          [
            ["host", "Room banao"],
            ["join", "Code se join"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => props.setMode(id)}
            className={
              props.mode === id
                ? "btn-gloss min-h-11 rounded-xl px-3 font-semibold"
                : "min-h-11 rounded-xl px-3 font-medium text-muted"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {props.mode === "host" ? (
        <div className="mt-5 grid grid-cols-3 gap-2">
          {KINDS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => props.setKind(item.id)}
              className={
                props.kind === item.id
                  ? "btn-gloss min-h-16 rounded-2xl px-2 text-center"
                  : "min-h-16 rounded-2xl border border-line bg-white/80 px-2 text-center"
              }
            >
              <span className="block text-sm font-semibold">
                {item.title.replace(" Auction", "")}
              </span>
              <span className="mt-1 block text-xs text-muted">{formatCr(item.purse)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-center text-sm text-muted">
          Auction type host choose karega. Tum sirf code se join karo.
        </p>
      )}

      <CodeTiles value={props.draft} />
      <p className="mt-3 text-center text-sm text-muted">
        {props.mode === "host"
          ? "Apna code set karo. Dusra phone yahi code daal ke join karega."
          : "Host ke screen pe jo code hai, wahi yahan daalo."}
      </p>

      <label className="mt-6 block text-sm text-muted" htmlFor="room-code">
        Room code
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="room-code"
          value={props.draft}
          onChange={(e) => props.setCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="IPL7"
          className="min-h-12 w-full rounded-2xl border border-line bg-white/80 px-4 font-display text-2xl tracking-[0.2em] text-gold shadow-inner outline-none focus:border-primary"
        />
        {props.mode === "host" ? (
          <button
            type="button"
            onClick={props.onRandom}
            className="min-h-12 shrink-0 rounded-2xl border border-line bg-white px-4 text-sm font-medium text-fg shadow-[0_8px_18px_rgba(150,170,200,0.2)]"
          >
            Random
          </button>
        ) : null}
      </div>

      <p className="mb-4 flex items-center justify-between gap-3 text-sm">
        <span>
          <span className="font-semibold text-fg">{props.profile.name}</span>
          <span className="text-muted"> · {props.profile.team}</span>
        </span>
        <button type="button" onClick={props.onLogout} className="text-muted underline">
          Logout
        </button>
      </p>

      {props.error ? <p className="mt-4 text-sm text-primary">{props.error}</p> : null}

      <button
        type="button"
        disabled={props.busy}
        onClick={props.onEnter}
        className="btn-gloss mt-6 min-h-12 w-full rounded-2xl px-4 font-semibold disabled:opacity-50"
      >
        {props.busy ? "Ruk jao..." : props.mode === "host" ? "Room banao" : "Join room"}
      </button>
    </section>
  );
}

function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="block text-sm text-muted" htmlFor={props.id}>
      {props.label}
      <input
        id={props.id}
        type={props.type}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="mt-2 min-h-12 w-full rounded-2xl border border-line bg-white/80 px-4 text-base text-fg outline-none focus:border-primary"
      />
    </label>
  );
}

function Lobby(props: {
  room: RoomState;
  playerId: string;
  busy: boolean;
  error: string;
  copied: boolean;
  onStart: () => void;
  onCopy: () => void;
}) {
  const isHost = props.room.hostId === props.playerId;
  const ready = props.room.players.length >= 2;
  const why = !isHost
    ? "Sirf host start karega. Tumhara button dusre phone pe hai."
    : !ready
      ? "Doosra owner abhi join nahi hua. Code uske phone pe daalwao."
      : "Sab ready. Auction ab start ho sakti hai.";

  return (
    <section className="glass sheen rise rounded-[28px] p-5 sm:p-8">
      <p className="text-center text-sm text-muted">Room code</p>
      <div className="mt-3">
        <CodeTiles value={props.room.code} />
      </div>
      <button
        type="button"
        onClick={props.onCopy}
        className="relative mx-auto mt-4 flex min-h-11 items-center gap-2 rounded-2xl border border-line bg-white px-4 text-sm font-medium text-fg shadow-[0_8px_18px_rgba(150,170,200,0.2)]"
      >
        <Copy className="size-4" aria-hidden="true" />
        {props.copied ? "Copy ho gaya" : "Code copy karo"}
      </button>

      <div className="mt-8 flex items-center gap-2 text-muted">
        <Users className="size-4" aria-hidden="true" />
        <h2 className="font-display text-2xl text-fg">{props.room.players.length} / 10 owners</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        {getKind(props.room.kind).title} · purse {formatCr(getKind(props.room.kind).purse)}
      </p>
      <ul className="mt-3 grid gap-2">
        {props.room.players.map((p, i) => (
          <li
            key={p.id}
            className="rise flex items-center justify-between rounded-2xl border border-white bg-white/70 px-4 py-3 shadow-[0_8px_18px_rgba(150,170,200,0.16)]"
          >
            <div>
              <p className="font-medium text-fg">{p.team}</p>
              <p className="text-sm text-muted">{p.name}</p>
            </div>
            <span className="text-xs tracking-wide text-gold">
              {p.id === props.room.hostId ? "HOST" : `#${i + 1}`}
              {p.id === props.playerId ? " · YOU" : ""}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-sm text-muted">{why}</p>
      {props.error ? <p className="mt-2 text-sm text-primary">{props.error}</p> : null}
      <button
        type="button"
        disabled={!isHost || !ready || props.busy}
        onClick={props.onStart}
        className="btn-gloss mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 font-semibold disabled:opacity-40"
      >
        <Play className="size-4" aria-hidden="true" />
        Start auction
      </button>
    </section>
  );
}

function useLotPhoto(name: string) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!name) return;
    const ctrl = new AbortController();
    setSrc("");
    const title = encodeURIComponent(name.trim().replace(/ /g, "_"));
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const photo = data?.originalimage?.source || data?.thumbnail?.source || "";
        setSrc(typeof photo === "string" ? photo : "");
      })
      .catch(() => setSrc(""));
    return () => ctrl.abort();
  }, [name]);
  return src;
}

function LotPhoto(props: { name: string; tall?: boolean }) {
  const src = useLotPhoto(props.name);
  if (!src) {
    return (
      <div
        className={`lot-photo grid place-items-center font-display text-5xl text-gold ${props.tall ? "h-64" : "h-44"}`}
      >
        {props.name.slice(0, 1)}
      </div>
    );
  }
  return <img src={src} alt="" className={`lot-photo ${props.tall ? "h-64" : "h-44"}`} />;
}

function Board(props: {
  room: RoomState;
  playerId: string;
  now: number;
  error: string;
  onBid: () => void;
  onPass: () => void;
  onClose: (mode: "sell" | "unsold") => void;
  busy: boolean;
  onLogout: () => void;
  onHome: () => void;
}) {
  const rule = getKind(props.room.kind);
  const lot = rule.lots[props.room.index];
  const me = props.room.players.find((p) => p.id === props.playerId);
  const leader = props.room.players.find((p) => p.id === props.room.leaderId);
  const live = props.room.phase === "live" && Boolean(lot);
  const left = Math.max(0, Math.ceil((props.room.endsAt - props.now) / 1000));
  const nextAmount = lot ? (props.room.leaderId ? props.room.bid + rule.step : lot.base) : 0;
  const leadingNow = props.room.leaderId === props.playerId;
  const blocked = lot && me && !leadingNow ? blockReason(props.room, me, lot, nextAmount) : null;
  const full = Boolean(blocked);
  const allFull = me ? squadFull(props.room, me) : false;
  const passed = props.room.passed ?? [];
  const iPassed = passed.includes(props.playerId);
  const leading = props.room.leaderId === props.playerId;
  const timeUp = live && left <= 0;
  const isHost = props.room.hostId === props.playerId;
  const [coverOn, setCoverOn] = useState(false);
  const coverSeen = useRef("");

  useEffect(() => {
    if (props.room.phase !== "live" || !lot) return;
    const key = `${props.room.index}:${lot.name}`;
    if (coverSeen.current === key) return;
    coverSeen.current = key;
    setCoverOn(true);
    const id = window.setTimeout(() => setCoverOn(false), 1800);
    return () => window.clearTimeout(id);
  }, [props.room.phase, props.room.index, lot]);

  const nextLabel = useMemo(() => {
    if (!lot || props.room.phase !== "live") return "";
    const amount = props.room.leaderId ? props.room.bid + rule.step : lot.base;
    return formatCr(amount);
  }, [lot, props.room.bid, props.room.leaderId, props.room.phase, rule.step]);

  const pdfFor = (owner: Seat) =>
    downloadSquadPdf({
      code: props.room.code,
      kind: props.room.kind,
      team: owner.team,
      finishedAt: Date.now(),
      purse: owner.purse,
      items: owner.squad.map((item) => ({
        name: item.name,
        country: item.country,
        role: item.role,
        group: item.group,
        soldFor: item.soldFor,
      })),
    });

  return (
    <main className="rise mx-auto min-h-screen w-full max-w-5xl px-4 py-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="font-display tracking-[0.22em] text-primary">ROOM {props.room.code}</p>
          <h1 className="font-display text-4xl font-extrabold">{rule.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          {live ? (
            <div
              className={`grid h-12 min-w-12 place-items-center rounded-2xl border border-line bg-white px-2 font-display text-xl font-extrabold tabular-nums shadow-[0_8px_18px_rgba(150,170,200,0.2)] ${left <= 5 ? "timer-hot text-primary" : "text-gold"}`}
              aria-label={`${left} seconds left`}
            >
              {left}s
            </div>
          ) : null}
          <p className="text-sm font-medium text-muted">{me ? me.team : "Watching"}</p>
          <button type="button" onClick={props.onLogout} className="text-sm text-muted underline">
            Logout
          </button>
        </div>
      </header>

      {props.room.phase === "done" || !lot ? (
        <Results room={props.room} playerId={props.playerId} onPdf={pdfFor} onHome={props.onHome} />
      ) : (
        <section
          key={`${props.room.index}-${lot.name}`}
          className="lot-card glass rounded-[28px] p-6 text-center sm:p-10"
        >
          <LotPhoto name={lot.name} />
          <p className="mt-4 text-sm tracking-widest text-muted">
            {lotTitle(props.room.kind, lot.role, lot.group).toUpperCase()} LOT
          </p>
          <h2 className="mt-2 font-display text-5xl font-bold">{lot.name}</h2>
          <p className="mt-2 text-muted">
            {lot.country} · {lot.role} · Base {formatCr(lot.base)}
          </p>
          <p className="price mt-4 font-display text-3xl text-fg">
            {formatCr(props.room.bid)}
            <span className="ml-2 text-base text-muted">
              {leader ? leader.team : "koi bid nahi"}
            </span>
          </p>
          <p className="mt-4 min-h-6 text-gold">{props.room.commentary}</p>
          {props.error ? <p className="mt-2 text-sm text-primary">{props.error}</p> : null}
          {me && allFull ? (
            <p className="mt-2 text-sm text-muted">
              Tumhari squad full hai. Baaki teams ke full hote hi auction khatam hoke comparison
              aayega.
            </p>
          ) : me && blocked ? (
            <p className="mt-2 text-sm text-muted">{blocked} Ye lot tumhare liye skip.</p>
          ) : null}

          {me ? (
            <div className="mx-auto mt-6 flex w-full max-w-sm gap-2">
              <button
                type="button"
                onClick={props.onBid}
                disabled={full || leading || timeUp || props.busy}
                className="btn-gloss relative min-h-14 flex-1 rounded-2xl px-4 text-lg font-semibold disabled:opacity-40"
              >
                {props.busy
                  ? "Ruk jao..."
                  : timeUp
                    ? "Time up"
                    : full
                      ? blocked?.startsWith("Purse")
                        ? "Purse kam"
                        : "Limit full"
                      : leading
                        ? "Leading"
                        : `Bid ${nextLabel}`}
              </button>
              <button
                type="button"
                onClick={props.onPass}
                disabled={leading || iPassed || full || timeUp || props.busy}
                className="min-h-14 rounded-2xl border border-line bg-white px-5 font-semibold text-fg shadow-[0_8px_18px_rgba(150,170,200,0.2)] disabled:opacity-40"
              >
                {iPassed ? "Passed" : full ? "Skip" : "Pass"}
              </button>
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted">Tum is room ke owner nahi ho.</p>
          )}
          {isHost ? (
            <div className="mx-auto mt-3 flex w-full max-w-sm gap-2 text-sm">
              <button
                type="button"
                onClick={() => props.onClose("sell")}
                disabled={!props.room.leaderId || props.busy}
                className="min-h-11 flex-1 rounded-xl border border-line bg-white font-semibold disabled:opacity-40"
              >
                Host: Sold
              </button>
              <button
                type="button"
                onClick={() => props.onClose("unsold")}
                disabled={props.busy}
                className="min-h-11 flex-1 rounded-xl border border-line bg-white font-semibold disabled:opacity-40"
              >
                Host: Unsold
              </button>
            </div>
          ) : null}
        </section>
      )}

      {coverOn && lot ? (
        <button type="button" className="lot-cover" onClick={() => setCoverOn(false)}>
          <div className="lot-cover-card">
            <p className="text-sm tracking-[0.28em] text-muted">
              {lotTitle(props.room.kind, lot.role, lot.group).toUpperCase()} LOT
            </p>
            <h2 className="mt-2 font-display text-5xl font-extrabold">{lot.group || lot.role}</h2>
            <div className="mt-4">
              <LotPhoto name={lot.name} tall />
            </div>
            <p className="mt-4 font-display text-2xl">{lot.name}</p>
            <p className="mt-1 text-sm text-muted">Tap karke bid screen kholo</p>
          </div>
        </button>
      ) : null}

      {props.room.phase === "done" || !lot ? null : (
        <>
          <h3 className="mt-8 font-display text-2xl">Owners</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {props.room.players.map((p) => {
              const mine = p.id === props.playerId;
              return (
                <article key={p.id} className="glass rise rounded-3xl p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="font-display text-2xl">{p.team}</h4>
                    <span className="text-sm text-gold tabular-nums">{formatCr(p.purse)}</span>
                  </div>
                  <p className="text-sm text-muted">
                    {p.name}
                    {rule.id === "ipl"
                      ? ` · ${p.squad.length}/${rule.maxItems * 3}`
                      : ` · ${p.squad.length}/${rule.maxItems}`}
                    {squadFull(props.room, p) ? " · FULL" : ""}
                    {mine ? "" : " · list hidden"}
                  </p>
                  {mine && rule.id === "ipl" ? (
                    <div className="mt-2 space-y-2 text-sm text-fg">
                      {["Test", "ODI", "T20"].map((group) => {
                        const picked = p.squad.filter((item) => item.group === group);
                        return (
                          <div key={group}>
                            <p className="text-muted">
                              {group} {picked.length}/{rule.maxItems}
                            </p>
                            {picked.map((item) => (
                              <p key={`${group}-${item.name}`}>
                                {item.name} · {formatCr(item.soldFor)}
                              </p>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {mine && rule.id !== "ipl" ? (
                    <ul className="mt-2 space-y-1 text-sm text-fg">
                      {p.squad.length === 0 ? <li className="text-muted">Abhi khaali</li> : null}
                      {p.squad.map((s) => (
                        <li key={s.name}>
                          {s.name} · {formatCr(s.soldFor)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}

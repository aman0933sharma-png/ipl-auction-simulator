import { useEffect, useMemo, useState } from "react";
import { Copy, Gavel, Play, Users } from "lucide-react";
import { LOTS, MAX_SQUAD, formatCr } from "@/lib/auction/catalog";
import { bid, closeLot, createRoom, joinRoom, startAuction, syncRoom } from "@/lib/auction/server";
import type { RoomState } from "@/lib/auction/state";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode() {
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  for (const b of bytes) code += ALPHA[b % ALPHA.length];
  return code;
}

function usePlayerId() {
  const [id, setId] = useState("");
  useEffect(() => {
    let stored = sessionStorage.getItem("gavel-id");
    if (!stored || !/^[a-zA-Z0-9]{8,32}$/.test(stored)) {
      stored = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      sessionStorage.setItem("gavel-id", stored);
    }
    setId(stored);
  }, []);
  return id;
}

function messageOf(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Kuch gadbad ho gayi. Dubara try karo.";
}

function CodeTiles({ value }: { value: string }) {
  const chars = (value || "----").padEnd(4, "·").slice(0, 8).split("");
  return (
    <div className="flex flex-wrap justify-center gap-2" aria-label={`Room code ${value}`}>
      {chars.map((ch, i) => (
        <span
          key={`${ch}-${i}`}
          className="flex h-14 w-11 items-center justify-center rounded-xl border border-line bg-raised font-display text-3xl font-bold tracking-wide text-gold tabular-nums"
        >
          {ch}
        </span>
      ))}
    </div>
  );
}

export function AuctionDesk() {
  const playerId = usePlayerId();
  const [mode, setMode] = useState<"host" | "join">("host");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!room || !playerId) return;
    let stop = false;
    const pull = async () => {
      try {
        const next = await syncRoom({ data: { code: room.code, playerId } });
        if (!stop) setRoom(next);
      } catch {
        /* keep last good snapshot */
      }
    };
    const id = window.setInterval(pull, 1000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [room?.code, playerId]);

  const draft = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

  async function enter(kind: "host" | "join") {
    if (!playerId) return;
    setError("");
    if (draft.length < 4) {
      setError("Room code kam se kam 4 characters ka hona chahiye.");
      return;
    }
    if (name.trim().length < 2 || team.trim().length < 2) {
      setError("Owner name aur team name dono daalo.");
      return;
    }
    setBusy(true);
    try {
      const payload = { code: draft, playerId, name: name.trim(), team: team.trim() };
      const next = kind === "host" ? await createRoom({ data: payload }) : await joinRoom({ data: payload });
      setRoom(next);
      setCode(next.code);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function onStart() {
    if (!room || !playerId) return;
    setBusy(true);
    setError("");
    try {
      setRoom(await startAuction({ data: { code: room.code, playerId } }));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function onBid() {
    if (!room || !playerId) return;
    setError("");
    try {
      setRoom(await bid({ data: { code: room.code, playerId } }));
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function onClose(modeName: "sell" | "unsold") {
    if (!room || !playerId) return;
    setError("");
    try {
      setRoom(await closeLot({ data: { code: room.code, playerId, mode: modeName } }));
    } catch (err) {
      setError(messageOf(err));
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

  if (!room || room.phase === "lobby") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8">
        <Header />
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
          <Gate
            mode={mode}
            setMode={setMode}
            draft={draft}
            setCode={setCode}
            name={name}
            setName={setName}
            team={team}
            setTeam={setTeam}
            busy={busy || !playerId}
            error={error}
            onRandom={() => setCode(randomCode())}
            onEnter={() => enter(mode)}
          />
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
      onClose={onClose}
    />
  );
}

function Header() {
  return (
    <header className="mb-8 flex items-end justify-between gap-4">
      <div>
        <p className="font-display text-sm tracking-[0.28em] text-primary">MEGA AUCTION</p>
        <h1 className="font-display text-5xl font-bold leading-none text-fg">Gavel</h1>
      </div>
      <Gavel className="size-10 text-gold" aria-hidden="true" />
    </header>
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
  busy: boolean;
  error: string;
  onRandom: () => void;
  onEnter: () => void;
}) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 sm:p-8">
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-bg p-1">
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
                ? "min-h-11 rounded-xl bg-primary px-3 font-medium text-bg"
                : "min-h-11 rounded-xl px-3 font-medium text-muted"
            }
          >
            {label}
          </button>
        ))}
      </div>

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
          className="min-h-12 w-full rounded-xl border border-line bg-bg px-4 font-display text-2xl tracking-[0.2em] text-gold outline-none focus:border-primary"
        />
        {props.mode === "host" ? (
          <button
            type="button"
            onClick={props.onRandom}
            className="min-h-12 shrink-0 rounded-xl border border-line bg-raised px-4 text-sm text-fg"
          >
            Random
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field id="owner-name" label="Owner name" value={props.name} onChange={props.setName} placeholder="Aman" />
        <Field id="team-name" label="Team name" value={props.team} onChange={props.setTeam} placeholder="Pahadi XI" />
      </div>

      {props.error ? <p className="mt-4 text-sm text-primary">{props.error}</p> : null}

      <button
        type="button"
        disabled={props.busy}
        onClick={props.onEnter}
        className="mt-6 min-h-12 w-full rounded-xl bg-primary px-4 font-semibold text-bg disabled:opacity-50"
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
}) {
  return (
    <label className="block text-sm text-muted" htmlFor={props.id}>
      {props.label}
      <input
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="mt-2 min-h-12 w-full rounded-xl border border-line bg-bg px-4 text-base text-fg outline-none focus:border-primary"
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
    <section className="rounded-3xl border border-line bg-surface p-5 sm:p-8">
      <p className="text-center text-sm text-muted">Room code</p>
      <div className="mt-3">
        <CodeTiles value={props.room.code} />
      </div>
      <button
        type="button"
        onClick={props.onCopy}
        className="mx-auto mt-4 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-raised px-4 text-sm text-fg"
      >
        <Copy className="size-4" aria-hidden="true" />
        {props.copied ? "Copy ho gaya" : "Code copy karo"}
      </button>

      <div className="mt-8 flex items-center gap-2 text-muted">
        <Users className="size-4" aria-hidden="true" />
        <h2 className="font-display text-2xl text-fg">{props.room.players.length} / 10 owners</h2>
      </div>
      <ul className="mt-3 grid gap-2">
        {props.room.players.map((p, i) => (
          <li key={p.id} className="flex items-center justify-between rounded-2xl border border-line bg-bg px-4 py-3">
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
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-bg disabled:opacity-40"
      >
        <Play className="size-4" aria-hidden="true" />
        Start auction
      </button>
    </section>
  );
}

function Board(props: {
  room: RoomState;
  playerId: string;
  now: number;
  error: string;
  onBid: () => void;
  onClose: (mode: "sell" | "unsold") => void;
}) {
  const lot = LOTS[props.room.index];
  const me = props.room.players.find((p) => p.id === props.playerId);
  const leader = props.room.players.find((p) => p.id === props.room.leaderId);
  const isHost = props.room.hostId === props.playerId;
  const left = Math.max(0, Math.ceil((props.room.endsAt - props.now) / 1000));
  const full = (me?.squad.length ?? 0) >= MAX_SQUAD;

  const nextLabel = useMemo(() => {
    if (!lot || props.room.phase !== "live") return "";
    const amount = props.room.leaderId ? props.room.bid + 25 : lot.base;
    return formatCr(amount);
  }, [lot, props.room.bid, props.room.leaderId, props.room.phase]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="font-display tracking-[0.22em] text-primary">ROOM {props.room.code}</p>
          <h1 className="font-display text-4xl font-bold">Gavel</h1>
        </div>
        <p className="text-sm text-muted">{me ? me.team : "Watching"}</p>
      </header>

      {props.room.phase === "done" || !lot ? (
        <section className="rounded-3xl border border-line bg-surface p-8 text-center">
          <h2 className="font-display text-4xl">Auction complete</h2>
          <p className="mt-2 text-muted">{props.room.commentary}</p>
        </section>
      ) : (
        <section className="rounded-3xl border border-line bg-surface p-6 text-center sm:p-10">
          <p className="text-sm tracking-widest text-muted">NOW BIDDING</p>
          <h2 className="mt-2 font-display text-5xl font-bold">{lot.name}</h2>
          <p className="mt-2 text-muted">
            {lot.country} · {lot.role} · Base {formatCr(lot.base)}
          </p>
          <p className={`mt-4 font-display text-6xl tabular-nums ${left <= 5 ? "text-primary" : "text-gold"}`}>
            {left}
          </p>
          <p className="mt-2 font-display text-3xl text-fg">
            {formatCr(props.room.bid)}
            <span className="ml-2 text-base text-muted">{leader ? leader.team : "koi bid nahi"}</span>
          </p>
          <p className="mt-4 min-h-6 text-gold">{props.room.commentary}</p>
          {props.error ? <p className="mt-2 text-sm text-primary">{props.error}</p> : null}

          {me ? (
            <button
              type="button"
              onClick={props.onBid}
              disabled={full}
              className="mt-6 min-h-14 w-full max-w-sm rounded-2xl bg-primary px-4 font-semibold text-bg disabled:opacity-40"
            >
              {full ? "Squad full 25/25" : `Bid ${nextLabel}`}
            </button>
          ) : (
            <p className="mt-6 text-sm text-muted">Tum is room ke owner nahi ho.</p>
          )}

          {isHost ? (
            <div className="mt-3 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => props.onClose("sell")}
                className="min-h-11 rounded-xl bg-gold px-4 font-semibold text-bg"
              >
                Sell
              </button>
              <button
                type="button"
                onClick={() => props.onClose("unsold")}
                className="min-h-11 rounded-xl border border-line bg-raised px-4 text-fg"
              >
                Unsold
              </button>
            </div>
          ) : null}
        </section>
      )}

      <h3 className="mt-8 font-display text-2xl">Teams</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {props.room.players.map((p) => (
          <article key={p.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="font-display text-2xl">{p.team}</h4>
              <span className="text-sm text-gold tabular-nums">{formatCr(p.purse)}</span>
            </div>
            <p className="text-sm text-muted">
              {p.name} · {p.squad.length}/{MAX_SQUAD}
              {p.squad.length >= MAX_SQUAD ? " full" : ""}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-fg">
              {p.squad.length === 0 ? <li className="text-muted">Abhi khaali</li> : null}
              {p.squad.map((s) => (
                <li key={s.name}>
                  {s.name} · {formatCr(s.soldFor)}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </main>
  );
}

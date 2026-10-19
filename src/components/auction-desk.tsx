import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Gavel, Play, Users } from "lucide-react";
import { KINDS, formatCr, getKind, lotTitle, squadCount, type AuctionKind } from "@/lib/auction/catalog";
import { bid, pass, createRoom, joinRoom, startAuction, syncRoom } from "@/lib/auction/server";
import { freshRoom, seat, type RoomState } from "@/lib/auction/state";

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
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "Bid nahi lagi. Ek baar aur tap karo.";
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

export function AuctionDesk() {
  const playerId = usePlayerId();
  const [mode, setMode] = useState<"host" | "join">("host");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [kind, setKind] = useState<AuctionKind>("ipl");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const actionRef = useRef(false);

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
        if (stop || actionRef.current) return;
        setRoom((current) => {
          if (!current) return next;
          if ((next.rev ?? 0) < (current.rev ?? 0)) return current;
          return next;
        });
      } catch {
        /* keep last good snapshot */
      }
    };
    void pull();
    const id = window.setInterval(pull, room.phase === "lobby" ? 350 : 800);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [room?.code, room?.phase, playerId]);

  const draft = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

  async function enter(action: "host" | "join") {
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
    actionRef.current = true;
    const spec = getKind(kind);
    const local = freshRoom(draft, seat(playerId, name.trim(), team.trim(), spec.purse), kind);
    setCode(draft);
    setRoom(action === "join" ? { ...local, hostId: "", commentary: "Room join ho raha hai..." } : local);
    try {
      const payload = { code: draft, playerId, name: name.trim(), team: team.trim(), kind };
      const next = action === "host" ? await createRoom({ data: payload }) : await joinRoom({ data: payload });
      setRoom(next);
      setCode(next.code);
    } catch (err) {
      setRoom(null);
      setError(messageOf(err));
    } finally {
      actionRef.current = false;
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
    if (!room || !playerId || actionRef.current) return;
    actionRef.current = true;
    setBusy(true);
    setError("");
    try {
      setRoom(await bid({ data: { code: room.code, playerId } }));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      actionRef.current = false;
      setBusy(false);
    }
  }

  async function onPass() {
    if (!room || !playerId || actionRef.current) return;
    actionRef.current = true;
    setBusy(true);
    setError("");
    try {
      setRoom(await pass({ data: { code: room.code, playerId } }));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      actionRef.current = false;
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
      onPass={onPass}
      busy={busy}
    />
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
              <span className="block text-sm font-semibold">{item.title.replace(" Auction", "")}</span>
              <span className="mt-1 block text-xs text-muted">{formatCr(item.purse)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-center text-sm text-muted">Auction type host choose karega. Tum sirf code se join karo.</p>
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field id="owner-name" label="Owner name" value={props.name} onChange={props.setName} placeholder="Aman" />
        <Field
          id="team-name"
          label={getKind(props.kind).teamLabel}
          value={props.team}
          onChange={props.setTeam}
          placeholder={getKind(props.kind).teamHint}
        />
      </div>

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
}) {
  return (
    <label className="block text-sm text-muted" htmlFor={props.id}>
      {props.label}
      <input
        id={props.id}
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
          <li key={p.id} className="rise flex items-center justify-between rounded-2xl border border-white bg-white/70 px-4 py-3 shadow-[0_8px_18px_rgba(150,170,200,0.16)]">
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

function Board(props: {
  room: RoomState;
  playerId: string;
  now: number;
  error: string;
  onBid: () => void;
  onPass: () => void;
  busy: boolean;
}) {
  const rule = getKind(props.room.kind);
  const lot = rule.lots[props.room.index];
  const me = props.room.players.find((p) => p.id === props.playerId);
  const leader = props.room.players.find((p) => p.id === props.room.leaderId);
  const live = props.room.phase === "live" && Boolean(lot);
  const left = Math.max(0, Math.ceil((props.room.endsAt - props.now) / 1000));
  const full = lot ? squadCount(me?.squad ?? [], lot, props.room.kind) >= rule.maxItems : false;
  const passed = props.room.passed ?? [];
  const iPassed = passed.includes(props.playerId);
  const leading = props.room.leaderId === props.playerId;

  const nextLabel = useMemo(() => {
    if (!lot || props.room.phase !== "live") return "";
    const amount = props.room.leaderId ? props.room.bid + rule.step : lot.base;
    return formatCr(amount);
  }, [lot, props.room.bid, props.room.leaderId, props.room.phase, rule.step]);

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
        </div>
      </header>

      {props.room.phase === "done" || !lot ? (
        <section className="glass rise rounded-[28px] p-8 text-center">
          <h2 className="font-display text-4xl">Auction complete</h2>
          <p className="mt-2 text-muted">{props.room.commentary}</p>
        </section>
      ) : (
        <section className="glass sheen rise rounded-[28px] p-6 text-center sm:p-10">
          <p className="text-sm tracking-widest text-muted">{lotTitle(props.room.kind, lot.role, lot.group).toUpperCase()} LOT</p>
          <h2 className="mt-2 font-display text-5xl font-bold">{lot.name}</h2>
          <p className="mt-2 text-muted">
            {lot.country} · {lot.role} · Base {formatCr(lot.base)}
          </p>
          <p className="mt-4 font-display text-3xl text-fg">
            {formatCr(props.room.bid)}
            <span className="ml-2 text-base text-muted">{leader ? leader.team : "koi bid nahi"}</span>
          </p>
          <p className="mt-4 min-h-6 text-gold">{props.room.commentary}</p>
          {props.error ? <p className="mt-2 text-sm text-primary">{props.error}</p> : null}

          {me ? (
            <div className="mx-auto mt-6 flex w-full max-w-sm gap-2">
              <button
                type="button"
                onClick={props.onBid}
                disabled={full || leading || props.busy}
                className="btn-gloss relative min-h-14 flex-1 rounded-2xl px-4 text-lg font-semibold disabled:opacity-40"
              >
                {props.busy ? "Ruk jao..." : full ? "Limit full" : leading ? "Leading" : `Bid ${nextLabel}`}
              </button>
              <button
                type="button"
                onClick={props.onPass}
                disabled={leading || iPassed || props.busy}
                className="min-h-14 rounded-2xl border border-line bg-white px-5 font-semibold text-fg shadow-[0_8px_18px_rgba(150,170,200,0.2)] disabled:opacity-40"
              >
                {iPassed ? "Passed" : "Pass"}
              </button>
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted">Tum is room ke owner nahi ho.</p>
          )}
        </section>
      )}

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
                {rule.id === "ipl" ? "" : ` · ${p.squad.length}/${rule.maxItems}`}
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
    </main>
  );
}

import { MAX_PLAYERS, getKind, squadCount, type AuctionKind, type Lot } from "./catalog";

export type SquadItem = Lot & { soldFor: number };

export type Seat = {
  id: string;
  name: string;
  team: string;
  purse: number;
  squad: SquadItem[];
};

export type Phase = "lobby" | "live" | "done";

export type RoomState = {
  code: string;
  hostId: string;
  kind: AuctionKind;
  phase: Phase;
  players: Seat[];
  index: number;
  bid: number;
  leaderId: string | null;
  endsAt: number;
  passed: string[];
  commentary: string;
  feed: string[];
  rev: number;
};

export function freshRoom(code: string, host: Seat, kind: AuctionKind = "ipl"): RoomState {
  return {
    code,
    hostId: host.id,
    kind,
    phase: "lobby",
    players: [host],
    index: 0,
    bid: 0,
    leaderId: null,
    endsAt: 0,
    passed: [],
    commentary: "Owners join kar rahe hain. Minimum 2 chahiye.",
    feed: [],
    rev: 1,
  };
}

export function seat(id: string, name: string, team: string, purse = getKind("ipl").purse): Seat {
  return { id, name: name.trim(), team: team.trim(), purse, squad: [] };
}

function rules(state: RoomState) {
  return getKind(state.kind);
}

function lotAt(state: RoomState) {
  return rules(state).lots[state.index];
}

function stamp(state: RoomState): RoomState {
  return { ...state, rev: (state.rev ?? 0) + 1 };
}

function pushFeed(state: RoomState, line: string): string[] {
  return [line, ...state.feed].slice(0, 8);
}

/** Format groups a team must fill. Cricket caps each format (Test/ODI/T20) separately. */
function groupsOf(state: RoomState): (string | undefined)[] {
  const rule = rules(state);
  if (rule.id !== "ipl") return [undefined];
  return [...new Set(rule.lots.map((lot) => lot.group))];
}

/** True when this team cannot take any more lots at all. */
export function squadFull(state: RoomState, team: Seat): boolean {
  const rule = rules(state);
  if (rule.id !== "ipl") return team.squad.length >= rule.maxItems;
  return groupsOf(state).every(
    (group) => team.squad.filter((item) => item.group === group).length >= rule.maxItems,
  );
}

/**
 * Why this team cannot bid `amount` on `lot`, or null when it can.
 * A full squad, the overseas cap, or a short purse all count as "out" for this lot.
 */
export function blockReason(state: RoomState, team: Seat, lot: Lot, amount: number): string | null {
  const rule = rules(state);
  const owned = squadCount(team.squad, lot, rule.id);
  if (owned >= rule.maxItems) {
    const label = rule.id === "ipl" && lot.group ? lot.group : rule.item;
    return `${team.team} ke ${rule.maxItems} ${label} poore ho gaye.`;
  }
  if (rule.overseas != null && lot.country !== "India") {
    const foreign = team.squad.filter((p) => p.country !== "India").length;
    if (foreign >= rule.overseas)
      return `${team.team} ke ${rule.overseas} overseas players ho chuke hain.`;
  }
  if (team.purse < amount) return "Purse kam pad raha hai.";
  return null;
}

function canBid(state: RoomState, team: Seat, lot: Lot, amount: number) {
  return blockReason(state, team, lot, amount) === null;
}

function endLine(state: RoomState): string {
  if (state.players.every((p) => squadFull(state, p))) {
    return "Sab teams ki squad full. Auction khatam — comparison neeche hai.";
  }
  if (state.index < rules(state).lots.length) {
    return "Bachi hui teams ke purse/limit mein koi lot nahi bacha. Auction khatam — comparison neeche hai.";
  }
  return "Saare lots ho gaye. Auction khatam — comparison neeche hai.";
}

/**
 * Open the lot at state.index. Lots that no team can take (every squad full for that
 * format, or nobody can afford the base) are skipped. If no lot is left that anyone
 * can bid on, the auction ends right here.
 */
function openLot(state: RoomState, now: number): RoomState {
  const lots = rules(state).lots;
  let index = state.index;
  while (
    index < lots.length &&
    !state.players.some((p) => canBid(state, p, lots[index], lots[index].base))
  ) {
    index += 1;
  }
  const lot = lots[index];
  if (!lot) {
    const line = endLine({ ...state, index: state.index });
    return {
      ...state,
      // Keep the index where the auction actually stopped (first lot nobody could take).
      phase: "done",
      commentary: line,
      feed: pushFeed(state, line),
      endsAt: 0,
      leaderId: null,
      passed: [],
    };
  }
  const skipped = index - state.index;
  return {
    ...state,
    index,
    phase: "live",
    bid: lot.base,
    leaderId: null,
    endsAt: now + rules(state).bidMs,
    passed: [],
    commentary: `${skipped > 0 ? `${skipped} lot skip (koi team le nahi sakti). ` : ""}${lot.name} aaya hai. Base ${lot.base / 100} crore se shuru.`,
  };
}

/** Every owner who could still outbid has passed (or cannot bid at all). */
function nobodyLeftToBid(state: RoomState): boolean {
  const lot = lotAt(state);
  if (!lot) return true;
  const amount = state.leaderId === null ? lot.base : state.bid + rules(state).step;
  return state.players.every(
    (p) => p.id === state.leaderId || state.passed.includes(p.id) || !canBid(state, p, lot, amount),
  );
}

export function resolveDue(state: RoomState, now: number): RoomState {
  if (state.phase !== "live") return state;
  if (now < state.endsAt) return state;
  const lot = lotAt(state);
  if (!lot)
    return stamp({
      ...state,
      phase: "done",
      commentary: "Auction khatam.",
      endsAt: 0,
      leaderId: null,
    });

  let next = state;
  if (state.leaderId) {
    const winner = state.players.find((p) => p.id === state.leaderId);
    if (winner) {
      const players = state.players.map((p) =>
        p.id === winner.id
          ? {
              ...p,
              purse: p.purse - state.bid,
              squad: [...p.squad, { ...lot, soldFor: state.bid }],
            }
          : p,
      );
      const line = `Sold. ${lot.name} — ${winner.team}, ${state.bid / 100} crore.`;
      next = {
        ...state,
        players,
        commentary: line,
        feed: pushFeed(state, line),
        index: state.index + 1,
      };
    } else {
      next = { ...state, index: state.index + 1, commentary: `${lot.name} unsold.` };
    }
  } else {
    const line = `${lot.name} unsold raha.`;
    next = {
      ...state,
      index: state.index + 1,
      commentary: line,
      feed: pushFeed(state, line),
    };
  }
  return stamp(openLot(next, now));
}

export function beginAuction(state: RoomState, playerId: string, now: number): RoomState {
  if (state.hostId !== playerId) throw new Error("Sirf room host auction start kar sakta hai.");
  if (state.phase !== "lobby") throw new Error("Auction pehle se chal rahi hai.");
  if (state.players.length < 2) {
    throw new Error("Kam se kam 2 owners chahiye. Doosra phone room code se join kare.");
  }
  return stamp(openLot({ ...state, phase: "live", index: 0 }, now));
}

/**
 * A bid or pass is aimed at one specific lot. If that lot already closed (timer ran
 * out, everyone passed, or host closed it) by the time the request lands, reject it
 * instead of silently applying it to the next lot.
 */
function assertSameLot(settled: RoomState, expectIndex: number | undefined) {
  if (expectIndex === undefined) return;
  if (settled.index !== expectIndex || settled.phase !== "live") {
    throw new Error("Ye lot band ho chuka hai. Tumhari bid/pass agle player pe nahi lagi.");
  }
}

export function placeBid(
  state: RoomState,
  playerId: string,
  now: number,
  expectIndex?: number,
): RoomState {
  const settled = resolveDue(state, now);
  assertSameLot(settled, expectIndex);
  if (settled.phase !== "live") throw new Error("Is lot pe bid band ho chuki hai.");
  const me = settled.players.find((p) => p.id === playerId);
  if (!me) throw new Error("Tum is room mein nahi ho.");
  const rule = rules(settled);
  const lot = lotAt(settled);
  if (!lot) throw new Error("Koi lot nahi bacha.");
  const nextBid = settled.leaderId === null ? lot.base : settled.bid + rule.step;
  if (settled.leaderId === playerId) throw new Error("Tum pehle se leading ho.");
  const blocked = blockReason(settled, me, lot, nextBid);
  if (blocked) throw new Error(blocked);
  const next: RoomState = {
    ...settled,
    bid: nextBid,
    leaderId: playerId,
    endsAt: now + rule.bidMs,
    passed: [],
    commentary: `${me.team} ne ${nextBid / 100} crore lagaya.`,
  };
  // If no other team can top this (squad full / purse short), sell right away.
  if (nobodyLeftToBid(next)) return resolveDue({ ...next, endsAt: now }, now);
  return stamp(next);
}

export function passLot(
  state: RoomState,
  playerId: string,
  now: number,
  expectIndex?: number,
): RoomState {
  const settled = resolveDue(state, now);
  assertSameLot(settled, expectIndex);
  if (settled.phase !== "live") throw new Error("Is lot pe pass band ho chuka hai.");
  const me = settled.players.find((p) => p.id === playerId);
  if (!me) throw new Error("Tum is room mein nahi ho.");
  if (settled.leaderId === playerId) throw new Error("Tum leading ho. Pass nahi kar sakte.");
  const passed = settled.passed ?? [];
  if (passed.includes(playerId)) throw new Error("Tum is player pe pass kar chuke ho.");
  const next: RoomState = {
    ...settled,
    passed: [...passed, playerId],
    // Passing does not give the room extra time; the running clock keeps going.
    commentary: `${me.team} ne pass kiya.`,
  };
  if (!nobodyLeftToBid(next)) return stamp(next);
  return resolveDue({ ...next, endsAt: now }, now);
}

export function forceClose(
  state: RoomState,
  playerId: string,
  now: number,
  mode: "sell" | "unsold",
  expectIndex?: number,
): RoomState {
  if (state.hostId !== playerId) throw new Error("Sirf host sell ya unsold kar sakta hai.");
  assertSameLot(state, expectIndex);
  if (state.phase !== "live") throw new Error("Auction live nahi hai.");
  if (mode === "sell" && !state.leaderId) throw new Error("Koi bid nahi hai. Unsold dabao.");
  return resolveDue(
    {
      ...state,
      endsAt: now,
      leaderId: mode === "unsold" ? null : state.leaderId,
    },
    now,
  );
}

export function addPlayer(state: RoomState, incoming: Seat): RoomState {
  if (state.phase !== "lobby") {
    const already = state.players.some((p) => p.id === incoming.id);
    if (already) return state;
    throw new Error("Auction shuru ho chuki hai. Naya owner ab nahi jud sakta.");
  }
  const existing = state.players.find((p) => p.id === incoming.id);
  if (existing) {
    const clash = state.players.some(
      (p) => p.id !== incoming.id && p.team.toLowerCase() === incoming.team.toLowerCase(),
    );
    if (clash) throw new Error("Ye team name pehle se liya hua hai.");
    return stamp({
      ...state,
      players: state.players.map((p) =>
        p.id === incoming.id ? { ...p, name: incoming.name, team: incoming.team } : p,
      ),
      commentary: `${incoming.team} lobby mein hai.`,
    });
  }
  if (state.players.length >= MAX_PLAYERS) throw new Error("Room full hai. Max 10 owners.");
  const clash = state.players.some((p) => p.team.toLowerCase() === incoming.team.toLowerCase());
  if (clash) throw new Error("Ye team name pehle se liya hua hai.");
  return stamp({
    ...state,
    players: [...state.players, incoming],
    commentary: `${incoming.name} — ${incoming.team} join ho gaya.`,
  });
}

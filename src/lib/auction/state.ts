import {
  BID_MS,
  MAX_PLAYERS,
  getKind,
  type AuctionKind,
  type Lot,
} from "./catalog";

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

function pushFeed(state: RoomState, line: string): string[] {
  return [line, ...state.feed].slice(0, 8);
}

function openLot(state: RoomState, now: number): RoomState {
  const lot = lotAt(state);
  if (!lot) {
    return {
      ...state,
      phase: "done",
      commentary: "Auction khatam. Squads neeche hain.",
      endsAt: 0,
      leaderId: null,
    };
  }
  return {
    ...state,
    phase: "live",
    bid: lot.base,
    leaderId: null,
    endsAt: now + BID_MS,
    passed: [],
    commentary: `${lot.name} aaya hai. Base ${lot.base / 100} crore se shuru.`,
  };
}

export function resolveDue(state: RoomState, now: number): RoomState {
  if (state.phase !== "live") return state;
  if (now < state.endsAt) return state;
  const lot = lotAt(state);
  if (!lot) return { ...state, phase: "done", commentary: "Auction khatam." };

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
  return openLot(next, now);
}

export function beginAuction(state: RoomState, playerId: string, now: number): RoomState {
  if (state.hostId !== playerId) throw new Error("Sirf room host auction start kar sakta hai.");
  if (state.phase !== "lobby") throw new Error("Auction pehle se chal rahi hai.");
  if (state.players.length < 2) {
    throw new Error("Kam se kam 2 owners chahiye. Doosra phone room code se join kare.");
  }
  return openLot({ ...state, phase: "live", index: 0 }, now);
}

export function placeBid(state: RoomState, playerId: string, now: number): RoomState {
  const settled = resolveDue(state, now);
  if (settled.phase !== "live") throw new Error("Is lot pe bid band ho chuki hai.");
  const me = settled.players.find((p) => p.id === playerId);
  if (!me) throw new Error("Tum is room mein nahi ho.");
  const rule = rules(settled);
  if (me.squad.length >= rule.maxItems) {
    throw new Error(`${me.team} ke ${rule.maxItems} ${rule.item} poore ho gaye.`);
  }
  const lot = lotAt(settled);
  if (!lot) throw new Error("Koi lot nahi bacha.");
  if (rule.overseas != null && lot.country !== "India") {
    const foreign = me.squad.filter((p) => p.country !== "India").length;
    if (foreign >= rule.overseas) throw new Error(`${me.team} ke ${rule.overseas} overseas players ho chuke hain.`);
  }
  const nextBid = settled.leaderId === null ? lot.base : settled.bid + rule.step;
  if (settled.leaderId === playerId) throw new Error("Tum pehle se leading ho.");
  if (me.purse < nextBid) throw new Error("Purse kam pad raha hai.");
  return {
    ...settled,
    bid: nextBid,
    leaderId: playerId,
    endsAt: now + BID_MS,
    passed: [],
    commentary: `${me.team} ne ${nextBid / 100} crore lagaya.`,
  };
}

export function passLot(state: RoomState, playerId: string, now: number): RoomState {
  const settled = resolveDue(state, now);
  if (settled.phase !== "live") throw new Error("Is lot pe pass band ho chuka hai.");
  const me = settled.players.find((p) => p.id === playerId);
  if (!me) throw new Error("Tum is room mein nahi ho.");
  if (settled.leaderId === playerId) throw new Error("Tum leading ho. Pass nahi kar sakte.");
  const passed = settled.passed ?? [];
  if (passed.includes(playerId)) throw new Error("Tum is player pe pass kar chuke ho.");
  const next: RoomState = {
    ...settled,
    passed: [...passed, playerId],
    endsAt: now + BID_MS,
    commentary: `${me.team} ne pass kiya.`,
  };
  const allPassed = next.players.every((p) => p.id === next.leaderId || next.passed.includes(p.id));
  if (!allPassed) return next;
  return resolveDue({ ...next, endsAt: now }, now);
}

export function forceClose(state: RoomState, playerId: string, now: number, mode: "sell" | "unsold"): RoomState {
  if (state.hostId !== playerId) throw new Error("Sirf host sell ya unsold kar sakta hai.");
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
    return {
      ...state,
      players: state.players.map((p) =>
        p.id === incoming.id ? { ...p, name: incoming.name, team: incoming.team } : p,
      ),
      commentary: `${incoming.team} lobby mein hai.`,
    };
  }
  if (state.players.length >= MAX_PLAYERS) throw new Error("Room full hai. Max 10 owners.");
  const clash = state.players.some((p) => p.team.toLowerCase() === incoming.team.toLowerCase());
  if (clash) throw new Error("Ye team name pehle se liya hua hai.");
  return {
    ...state,
    players: [...state.players, incoming],
    commentary: `${incoming.name} — ${incoming.team} join ho gaya.`,
  };
}

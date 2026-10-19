import { CARS } from "./cars";
import { PLAYERS } from "./players";

export type Lot = {
  name: string;
  /** Country for players, brand for cars and bikes. */
  country: string;
  role: string;
  /** Test, ODI, T20, or a car class. */
  group?: string;
  /** Price in lakh. 100 = ₹1.00 Cr */
  base: number;
};

export const PURSE = 12000;
export const STEP = 25;
export const MAX_SQUAD = 25;
export const MAX_OVERSEAS = 8;
export const BID_MS = 30_000;
export const EXTEND_MS = 30_000;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

export function formatCr(lakh: number): string {
  return `₹${(lakh / 100).toFixed(2)} Cr`;
}


export type AuctionKind = "ipl" | "cars" | "bikes";

export type KindSpec = {
  id: AuctionKind;
  title: string;
  blurb: string;
  purse: number;
  step: number;
  maxItems: number;
  item: string;
  teamLabel: string;
  teamHint: string;
  overseas: number | null;
  bidMs: number;
  lots: Lot[];
};

const BIKES: Lot[] = [
  { name: "Ducati Panigale V4", country: "Ducati", role: "Sport", base: 40 },
  { name: "BMW S 1000 RR", country: "BMW", role: "Sport", base: 28 },
  { name: "Kawasaki Ninja ZX-10R", country: "Kawasaki", role: "Sport", base: 18 },
  { name: "Yamaha YZF-R1", country: "Yamaha", role: "Sport", base: 24 },
  { name: "Honda CBR1000RR", country: "Honda", role: "Sport", base: 20 },
  { name: "Aprilia RSV4", country: "Aprilia", role: "Sport", base: 32 },
  { name: "Harley-Davidson Fat Boy", country: "Harley-Davidson", role: "Cruiser", base: 26 },
  { name: "Royal Enfield Super Meteor", country: "Royal Enfield", role: "Cruiser", base: 4 },
  { name: "Indian Scout", country: "Indian", role: "Cruiser", base: 16 },
  { name: "Triumph Bonneville", country: "Triumph", role: "Cruiser", base: 12 },
  { name: "BMW R 1300 GS", country: "BMW", role: "Adventure", base: 28 },
  { name: "Triumph Tiger 900", country: "Triumph", role: "Adventure", base: 15 },
  { name: "Honda Africa Twin", country: "Honda", role: "Adventure", base: 16 },
  { name: "KTM 1290 Super Adventure", country: "KTM", role: "Adventure", base: 22 },
];

export const KINDS: KindSpec[] = [
  {
    id: "ipl",
    title: "Cricket Auction",
    blurb: "Test, ODI and T20",
    purse: 35000,
    step: 50,
    maxItems: 15,
    item: "players",
    teamLabel: "Team name",
    teamHint: "Pahadi XI",
    overseas: null,
    bidMs: 15_000,
    lots: PLAYERS,
  },
  {
    id: "cars",
    title: "Car Auction",
    blurb: "Hatch, sedan, SUV, sports",
    purse: 25000,
    step: 50,
    maxItems: 15,
    item: "cars",
    teamLabel: "Garage name",
    teamHint: "Night Garage",
    overseas: null,
    bidMs: 10_000,
    lots: CARS,
  },
  {
    id: "bikes",
    title: "Bike Auction",
    blurb: "Sport, cruiser, adventure",
    purse: 5000,
    step: 2,
    maxItems: 5,
    item: "bikes",
    teamLabel: "Crew name",
    teamHint: "Pahadi Riders",
    overseas: null,
    bidMs: 10_000,
    lots: BIKES,
  },
];

export function getKind(id?: string): KindSpec {
  return KINDS.find((kind) => kind.id === id) ?? KINDS[0];
}

export function lotTitle(kind: string | undefined, role: string, group?: string): string {
  if ((kind ?? "ipl") === "ipl") return group || "Test";
  return group || role;
}

export function squadCount(squad: Lot[], lot: Lot, kind?: string): number {
  if ((kind ?? "ipl") === "ipl" && lot.group) return squad.filter((item) => item.group === lot.group).length;
  return squad.length;
}

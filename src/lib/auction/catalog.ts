export type Lot = {
  name: string;
  /** Country for players, brand for cars and bikes. */
  country: string;
  role: string;
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

export const LOTS: Lot[] = [
  { name: "Cameron Green", country: "Australia", role: "Allrounder", base: 200 },
  { name: "Matheesha Pathirana", country: "Sri Lanka", role: "Bowler", base: 200 },
  { name: "Liam Livingstone", country: "England", role: "Allrounder", base: 200 },
  { name: "Venkatesh Iyer", country: "India", role: "Allrounder", base: 200 },
  { name: "Ravi Bishnoi", country: "India", role: "Bowler", base: 200 },
  { name: "Wanindu Hasaranga", country: "Sri Lanka", role: "Allrounder", base: 200 },
  { name: "Devon Conway", country: "New Zealand", role: "Batter", base: 200 },
  { name: "Jake Fraser-McGurk", country: "Australia", role: "Batter", base: 200 },
  { name: "David Miller", country: "South Africa", role: "Batter", base: 200 },
  { name: "Steve Smith", country: "Australia", role: "Batter", base: 200 },
  { name: "Jamie Smith", country: "England", role: "Wicketkeeper", base: 200 },
  { name: "Ben Duckett", country: "England", role: "Batter", base: 200 },
  { name: "Anrich Nortje", country: "South Africa", role: "Bowler", base: 200 },
  { name: "Gus Atkinson", country: "England", role: "Bowler", base: 200 },
  { name: "Jason Holder", country: "West Indies", role: "Allrounder", base: 200 },
  { name: "Rachin Ravindra", country: "New Zealand", role: "Allrounder", base: 200 },
  { name: "Finn Allen", country: "New Zealand", role: "Batter", base: 200 },
  { name: "Josh Inglis", country: "Australia", role: "Wicketkeeper", base: 200 },
  { name: "Mustafizur Rahman", country: "Bangladesh", role: "Bowler", base: 200 },
  { name: "Quinton de Kock", country: "South Africa", role: "Wicketkeeper", base: 100 },
  { name: "Jonny Bairstow", country: "England", role: "Wicketkeeper", base: 100 },
  { name: "Akash Deep", country: "India", role: "Bowler", base: 100 },
  { name: "Rahul Chahar", country: "India", role: "Bowler", base: 100 },
  { name: "Tim Seifert", country: "New Zealand", role: "Wicketkeeper", base: 150 },
  { name: "Matt Henry", country: "New Zealand", role: "Bowler", base: 150 },
  { name: "Prithvi Shaw", country: "India", role: "Batter", base: 75 },
  { name: "Sarfaraz Khan", country: "India", role: "Batter", base: 75 },
  { name: "Rahul Tripathi", country: "India", role: "Batter", base: 75 },
  { name: "Pathum Nissanka", country: "Sri Lanka", role: "Batter", base: 75 },
  { name: "Deepak Hooda", country: "India", role: "Allrounder", base: 75 },
  { name: "Shivam Mavi", country: "India", role: "Bowler", base: 75 },
  { name: "Mayank Agarwal", country: "India", role: "Batter", base: 75 },
  { name: "Kartik Tyagi", country: "India", role: "Bowler", base: 30 },
  { name: "Yash Dhull", country: "India", role: "Batter", base: 30 },
  { name: "Prashant Veer", country: "India", role: "Allrounder", base: 30 },
  { name: "Naman Tiwari", country: "India", role: "Bowler", base: 30 },
];

export function formatCr(lakh: number): string {
  return `₹${(lakh / 100).toFixed(2)} Cr`;
}

const ROLE_ORDER: Record<string, number> = {
  Batter: 0,
  Wicketkeeper: 1,
  Bowler: 2,
  Allrounder: 3,
};
LOTS.sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));

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
  lots: Lot[];
};

const CARS: Lot[] = [
  { name: "BMW M4 Competition", country: "BMW", role: "Sports", base: 1500 },
  { name: "Porsche 911 Carrera", country: "Porsche", role: "Sports", base: 2000 },
  { name: "Mercedes-AMG GT", country: "Mercedes", role: "Sports", base: 2800 },
  { name: "Nissan GT-R", country: "Nissan", role: "Sports", base: 1800 },
  { name: "Toyota Supra", country: "Toyota", role: "Sports", base: 900 },
  { name: "Audi R8", country: "Audi", role: "Sports", base: 2600 },
  { name: "Ford Mustang GT", country: "Ford", role: "Sports", base: 800 },
  { name: "Range Rover Sport", country: "Land Rover", role: "SUV", base: 1800 },
  { name: "Mercedes G-Wagon", country: "Mercedes", role: "SUV", base: 3200 },
  { name: "BMW X7", country: "BMW", role: "SUV", base: 1400 },
  { name: "Toyota Land Cruiser", country: "Toyota", role: "SUV", base: 2100 },
  { name: "Lamborghini Urus", country: "Lamborghini", role: "SUV", base: 4500 },
  { name: "Porsche Cayenne", country: "Porsche", role: "SUV", base: 1600 },
  { name: "Defender 110", country: "Land Rover", role: "SUV", base: 1300 },
  { name: "Mercedes S-Class", country: "Mercedes", role: "Sedan", base: 1900 },
  { name: "BMW 7 Series", country: "BMW", role: "Sedan", base: 1600 },
  { name: "Audi A8", country: "Audi", role: "Sedan", base: 1500 },
  { name: "Bentley Flying Spur", country: "Bentley", role: "Sedan", base: 5500 },
  { name: "Rolls-Royce Ghost", country: "Rolls-Royce", role: "Sedan", base: 7500 },
];

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
    title: "IPL Auction",
    blurb: "Players, 25 squad",
    purse: 12000,
    step: 25,
    maxItems: 25,
    item: "players",
    teamLabel: "Team name",
    teamHint: "Pahadi XI",
    overseas: 8,
    lots: LOTS,
  },
  {
    id: "cars",
    title: "Car Auction",
    blurb: "Sports, SUV, sedan",
    purse: 8000,
    step: 50,
    maxItems: 5,
    item: "cars",
    teamLabel: "Garage name",
    teamHint: "Night Garage",
    overseas: null,
    lots: CARS,
  },
  {
    id: "bikes",
    title: "Bike Auction",
    blurb: "Sport, cruiser, adventure",
    purse: 250,
    step: 2,
    maxItems: 5,
    item: "bikes",
    teamLabel: "Crew name",
    teamHint: "Pahadi Riders",
    overseas: null,
    lots: BIKES,
  },
];

export function getKind(id?: string): KindSpec {
  return KINDS.find((kind) => kind.id === id) ?? KINDS[0];
}

export function lotTitle(kind: string | undefined, role: string): string {
  if ((kind ?? "ipl") === "ipl") {
    if (role === "Bowler") return "Bowlers";
    if (role === "Allrounder") return "Allrounders";
    return "Batters";
  }
  return role;
}

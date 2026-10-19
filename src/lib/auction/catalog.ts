export type Role = "Batter" | "Bowler" | "Allrounder" | "Wicketkeeper";

export type Lot = {
  name: string;
  country: string;
  role: Role;
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

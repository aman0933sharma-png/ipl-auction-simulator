export type SavedItem = {
  name: string;
  country: string;
  role: string;
  group?: string;
  soldFor: number;
};

export type OpenAuction = {
  code: string;
  kind: string;
  phase: "lobby" | "live";
  updatedAt: number;
};

export type SavedSquad = {
  code: string;
  kind: string;
  team: string;
  finishedAt: number;
  purse: number;
  items: SavedItem[];
};

export type Desk = {
  open: OpenAuction[];
  squads: SavedSquad[];
};

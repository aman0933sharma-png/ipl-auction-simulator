create table if not exists auction_rooms (
  code text primary key,
  host_id text not null,
  version integer not null default 1,
  state text not null,
  updated_at timestamptz not null default now()
);

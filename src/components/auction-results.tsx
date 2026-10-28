import { useState } from "react";
import { Crown } from "lucide-react";
import { formatCr, getKind } from "@/lib/auction/catalog";
import type { RoomState, Seat } from "@/lib/auction/state";

const CRICKET_ROLES = ["Batter", "Wicketkeeper", "Allrounder", "Bowler"];
const ROLE_SHORT: Record<string, string> = {
  Batter: "BAT",
  Wicketkeeper: "WK",
  Allrounder: "AR",
  Bowler: "BOWL",
};

export type TeamSummary = {
  seat: Seat;
  spent: number;
  value: number;
  roles: [string, number][];
  groups: [string, number][];
  overseas: number;
  strength: number;
};

/**
 * Strength = squad value at base price (who bagged the bigger names), with a small
 * balance bonus in cricket for having all four roles. Scaled 0–100 against the best team.
 */
function summarize(room: RoomState): TeamSummary[] {
  const rule = getKind(room.kind);
  const roleOrder =
    rule.id === "ipl" ? CRICKET_ROLES : [...new Set(rule.lots.map((lot) => lot.role))];
  const groupOrder = rule.id === "ipl" ? [...new Set(rule.lots.map((lot) => lot.group ?? ""))] : [];
  const raw = room.players.map((seat) => {
    const value = seat.squad.reduce((sum, item) => sum + item.base, 0);
    const roles = roleOrder.map(
      (role) => [role, seat.squad.filter((item) => item.role === role).length] as [string, number],
    );
    const covered = roles.filter(([, n]) => n > 0).length;
    const balance = rule.id === "ipl" ? 1 + 0.05 * covered : 1;
    return {
      seat,
      spent: rule.purse - seat.purse,
      value,
      roles,
      groups: groupOrder.map(
        (g) => [g, seat.squad.filter((item) => item.group === g).length] as [string, number],
      ),
      overseas: seat.squad.filter((item) => item.country !== "India").length,
      strength: value * balance,
    };
  });
  const top = Math.max(1, ...raw.map((t) => t.strength));
  return raw
    .map((t) => ({ ...t, strength: Math.round((t.strength / top) * 100) }))
    .sort((a, b) => b.strength - a.strength || b.seat.squad.length - a.seat.squad.length);
}

export function Results(props: {
  room: RoomState;
  playerId: string;
  onPdf: (seat: Seat) => void;
  onHome: () => void;
}) {
  const rule = getKind(props.room.kind);
  const teams = summarize(props.room);
  const [open, setOpen] = useState<string>(props.playerId);
  const cap = rule.id === "ipl" ? rule.maxItems * 3 : rule.maxItems;

  return (
    <section className="rise grid gap-4" aria-label="Team comparison">
      <div className="glass rounded-[28px] p-5 text-center sm:p-8">
        <p className="font-display text-sm tracking-[0.28em] text-primary">AUCTION COMPLETE</p>
        <h2 className="mt-1 font-display text-4xl">Team comparison</h2>
        <p className="mt-2 text-sm text-muted">{props.room.commentary}</p>
      </div>

      <div className="glass rounded-[28px] p-5">
        <p className="font-display text-2xl">Strength ranking</p>
        <p className="mt-1 text-xs text-muted">
          Squad ki base value se{rule.id === "ipl" ? " (+ role balance bonus)" : ""}. Best team =
          100.
        </p>
        <ol className="mt-4 grid gap-3">
          {teams.map((t, i) => (
            <li key={t.seat.id}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 font-semibold">
                  {i === 0 ? (
                    <Crown className="size-4 text-gold" aria-hidden="true" />
                  ) : (
                    <span className="w-4 text-muted">{i + 1}</span>
                  )}
                  {t.seat.team}
                  {t.seat.id === props.playerId ? (
                    <span className="text-xs font-normal text-muted">· YOU</span>
                  ) : null}
                </span>
                <span className="font-display text-lg tabular-nums">{t.strength}</span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full bg-fg"
                  style={{ width: `${Math.max(3, t.strength)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="glass overflow-x-auto rounded-[28px] p-5">
        <p className="font-display text-2xl">Side by side</p>
        <table className="mt-3 w-full min-w-[300px] text-left text-sm tabular-nums">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 pr-2 font-medium">Team</th>
              <th className="py-1 pr-2 font-medium">{rule.id === "ipl" ? "Players" : rule.item}</th>
              <th className="py-1 pr-2 font-medium">Spent</th>
              <th className="py-1 font-medium">Left</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.seat.id} className="border-t border-line">
                <td className="max-w-[110px] truncate py-2 pr-2 font-semibold">{t.seat.team}</td>
                <td className="py-2 pr-2">
                  {t.seat.squad.length}/{cap}
                </td>
                <td className="py-2 pr-2">{formatCr(t.spent)}</td>
                <td className="py-2 text-gold">{formatCr(t.seat.purse)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {teams.map((t, i) => {
        const expanded = open === t.seat.id;
        const mine = t.seat.id === props.playerId;
        return (
          <article key={t.seat.id} className="glass rounded-3xl p-4">
            <button
              type="button"
              onClick={() => setOpen(expanded ? "" : t.seat.id)}
              aria-expanded={expanded}
              className="flex w-full items-baseline justify-between gap-2 text-left"
            >
              <span>
                <span className="font-display text-2xl">
                  #{i + 1} {t.seat.team}
                </span>
                <span className="block text-sm text-muted">
                  {t.seat.name}
                  {mine ? " · YOU" : ""}
                </span>
              </span>
              <span className="text-sm text-muted">{expanded ? "Band karo" : "Squad dekho"}</span>
            </button>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label="Spent" value={formatCr(t.spent)} />
              <Stat label="Purse left" value={formatCr(t.seat.purse)} />
              <Stat label="Strength" value={String(t.strength)} />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {t.groups.map(([g, n]) => (
                <Chip key={g} text={`${g} ${n}/${rule.maxItems}`} />
              ))}
              {t.roles.map(([role, n]) => (
                <Chip key={role} text={`${ROLE_SHORT[role] ?? role} ${n}`} />
              ))}
              {rule.id === "ipl" ? <Chip text={`Overseas ${t.overseas}`} /> : null}
            </div>

            {expanded ? (
              <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                {t.seat.squad.length === 0 ? (
                  <li className="text-muted">Koi lot nahi liya</li>
                ) : null}
                {t.seat.squad.map((item) => (
                  <li
                    key={`${item.group ?? ""}-${item.name}`}
                    className="flex justify-between gap-2"
                  >
                    <span>
                      {item.name}
                      <span className="text-muted">
                        {" "}
                        · {item.group ? `${item.group} · ` : ""}
                        {item.role}
                        {rule.id === "ipl" && item.country !== "India" ? " · OS" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-gold">
                      {formatCr(item.soldFor)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {mine ? (
              <button
                type="button"
                onClick={() => props.onPdf(t.seat)}
                className="btn-gloss mt-3 min-h-11 w-full rounded-2xl font-semibold"
              >
                Squad PDF
              </button>
            ) : null}
          </article>
        );
      })}

      <button
        type="button"
        onClick={props.onHome}
        className="min-h-12 rounded-2xl border border-line bg-white font-semibold"
      >
        Nayi auction
      </button>
    </section>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-raised/80 px-2 py-2">
      <p className="text-[11px] text-muted">{props.label}</p>
      <p className="font-display text-sm tabular-nums whitespace-nowrap">{props.value}</p>
    </div>
  );
}

function Chip(props: { text: string }) {
  return (
    <span className="rounded-full border border-line bg-white px-2.5 py-1 text-fg">
      {props.text}
    </span>
  );
}

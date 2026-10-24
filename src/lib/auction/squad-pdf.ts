import type { SavedSquad } from "./library";

function money(lakh: number) {
  return `Rs ${(lakh / 100).toFixed(2)} Cr`;
}

function escapePdf(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function page(lines: string[]) {
  const commands = ["BT", "/F1 12 Tf", "48 800 Td", "16 TL"];
  lines.forEach((line, index) => {
    commands.push(`(${escapePdf(line)}) Tj`);
    if (index < lines.length - 1) commands.push("T*");
  });
  commands.push("ET");
  return commands.join("\n");
}

export function downloadSquadPdf(squad: SavedSquad) {
  const lines = [
    "Auction squad",
    `${squad.team}   ${squad.kind.toUpperCase()}   Room ${squad.code}`,
    `Purse left  ${money(squad.purse)}`,
    `${squad.items.length} lots`,
    "",
  ];
  const groups = new Map<string, SavedSquad["items"]>();
  for (const item of squad.items) {
    const key = item.group || item.role || "Squad";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  if (squad.items.length === 0) lines.push("Koi lot nahi mila.");
  for (const [group, items] of groups) {
    lines.push(group);
    for (const item of items) lines.push(`  ${item.name}  -  ${item.country}  -  ${money(item.soldFor)}`);
    lines.push("");
  }

  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 42) pages.push(lines.slice(i, i + 42));
  if (pages.length === 0) pages.push(["Auction squad"]);

  const objects: string[] = [];
  const kids = pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push(`2 0 obj << /Type /Pages /Count ${pages.length} /Kids [${kids}] >> endobj`);
  pages.forEach((chunk, index) => {
    const contentId = 4 + index * 2;
    const pageId = 3 + index * 2;
    const stream = page(chunk);
    objects.push(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> endobj`,
    );
    objects.push(`${contentId} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`);
  });

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += `${object}\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const blob = new Blob([body], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${squad.team}-${squad.code}-squad.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

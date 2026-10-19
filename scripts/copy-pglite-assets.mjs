import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const srcDir = join(root, "node_modules/@electric-sql/pglite/dist");
const files = ["pglite.data", "pglite.wasm", "initdb.wasm"];
const outs = [join(root, ".vercel/output/functions")];

function walk(dir, found) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, found);
    else if (name === "electric-sql__pglite.mjs") found.push(dir);
  }
}

const dirs = [];
for (const out of outs) walk(out, dirs);
if (dirs.length === 0) {
  console.log("[pglite] no bundled function output, skip");
  process.exit(0);
}

for (const dir of dirs) {
  mkdirSync(dir, { recursive: true });
  for (const file of files) {
    copyFileSync(join(srcDir, file), join(dir, file));
  }
  console.log("[pglite] copied wasm data next to", dir);
}

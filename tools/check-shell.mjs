/* Checks the page's shell, offline: npm run check:shell
     1. no id is used twice in index.html
     2. APP.version matches the newest CHANGELOG.md entry and package.json
     3. css/mineski-base.css is byte-identical to the design language's
     4. node --check passes on every module, tool and test
   Exits 1 if anything fails. */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* Every id in index.html must be used once: a heading and a field sharing one silently breaks the field. */
export function duplicateIds(html) {
  const seen = new Map();
  for (const m of html.replace(/<script[\s\S]*?<\/script>/g, "").matchAll(/\sid="([^"]+)"/g)) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
}

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "✓" : "✗"} ${msg}`); if (!cond) failures++; return cond; };
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");

console.log("Page");
const dup = duplicateIds(read("index.html"));
ok(!dup.length, dup.length ? `ids used more than once in index.html: ${dup.join(", ")}` : "every id in index.html is used once");

console.log("Version");
const version = (read("js", "config.js").match(/version: "([^"]+)"/) || [])[1];
const logged = (read("CHANGELOG.md").match(/^## (\S+)/m) || [])[1];
ok(version && version === logged, `APP.version (${version}) is the newest CHANGELOG.md entry (${logged})`);
ok(JSON.parse(read("package.json")).version === version, "package.json has the same version");

console.log("Shared files");
const theirs = join(ROOT, "..", "design-ref", "mineski-design-language", "assets", "mineski-base.css");
if (existsSync(theirs)) ok(read("css", "mineski-base.css") === readFileSync(theirs, "utf8"), "css/mineski-base.css is the design language's, unedited");
else console.log("  - design-ref isn't beside this folder: skipped");

console.log("Scripts");
for (const dir of ["js", "tools", "tests"]) {
  for (const f of readdirSync(join(ROOT, dir)).filter((x) => /\.m?js$/.test(x) && x !== "preview-shim.js")) {
    const r = spawnSync(process.execPath, ["--check", join(ROOT, dir, f)], { encoding: "utf8" });
    if (r.status !== 0) ok(false, `${dir}/${f} doesn't parse: ${(r.stderr || "").split("\n")[0]}`);
  }
}
ok(true, "every script was checked");

console.log(failures ? `\n${failures} problem${failures === 1 ? "" : "s"}.` : "\nAll good.");
process.exit(failures ? 1 : 0);

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

/**
 * Windows-safe runner for the unit suite.
 * Reads the chained `scripts.test` parts from package.json (or TEST_PARTS_FILE)
 * and invokes each command separately so CMD length limits never apply.
 */
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
const raw = pkg.scripts?.["test:parts"] || pkg.scripts?.test || "";
// If test points at this runner, prefer test:parts
const partsSrc =
  /run-unit-tests/.test(pkg.scripts.test || "")
    ? pkg.scripts["test:parts"] || ""
    : pkg.scripts.test || "";
if (!partsSrc) {
  console.error("No test:parts / test script list found in package.json");
  process.exit(1);
}
const parts = partsSrc
  .split(/\s*&&\s*/)
  .map((s) => s.trim())
  .filter(Boolean);

const argStart = process.argv.find((a) => a.startsWith("--start="));
const startAt = Math.max(1, Number((argStart && argStart.split("=")[1]) || process.env.START_AT || "1"));
const stopOnFail = process.env.CONTINUE_ON_FAIL !== "1";
let failed = null;
const started = Date.now();
console.log(`run-unit-tests: ${parts.length} parts, startAt=${startAt}`);

for (let i = startAt - 1; i < parts.length; i++) {
  const cmd = parts[i];
  const label = `[${i + 1}/${parts.length}] ${cmd}`;
  process.stdout.write(label + " ... ");
  const t0 = Date.now();
  const r = spawnSync(cmd, {
    shell: true,
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  });
  const ms = Date.now() - t0;
  if (r.status === 0) {
    console.log(`PASS (${ms}ms)`);
  } else {
    console.log(`FAIL exit=${r.status} (${ms}ms)`);
    const out = `${r.stdout || ""}${r.stderr || ""}`;
    console.error(out.slice(-4000));
    failed = { i: i + 1, cmd, status: r.status };
    if (stopOnFail) break;
  }
}

console.log(
  JSON.stringify(
    {
      total: parts.length,
      failed,
      elapsedMs: Date.now() - started,
    },
    null,
    2
  )
);
process.exit(failed ? 1 : 0);

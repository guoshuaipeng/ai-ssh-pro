const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

/**
 * Windows-safe runner for the unit suite.
 * Reads the chained `test:parts` from package.json and runs every part as its own process
 * (so CMD length limits never apply). Every part still runs; only scheduling changed:
 * - T46: parts run in a worker pool (TEST_JOBS, default min(8, cpus-2); TEST_JOBS=1 = old serial run).
 * - T46: `npx tsx` is resolved once to the local tsx CLI, skipping npx's ~0.5s lookup per part.
 * Parts listed in SERIAL run alone after the pool (they share global state on disk or time-sensitive).
 */
const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const partsSrc = /run-unit-tests/.test(pkg.scripts.test || "") ? pkg.scripts["test:parts"] || "" : pkg.scripts.test || "";
if (!partsSrc) {
  console.error("No test:parts / test script list found in package.json");
  process.exit(1);
}
const parts = partsSrc.split(/\s*&&\s*/).map((s) => s.trim()).filter(Boolean);

const SERIAL = [/test-core-a-evals\.ts/, /test-core-a-scenarios\.ts/];

/** The same tsx that `npx tsx` runs: local node_modules, else ask npx once where its copy lives. */
function findTsxCli() {
  const local = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  if (fs.existsSync(local)) return local;
  const r = spawnSync('npx tsx -e "console.log(process.execArgv.join(String.fromCharCode(10)))"', { shell: true, cwd: root, encoding: "utf8" });
  const pre = (r.stdout || "").split(/\r?\n/).find((l) => /preflight\.cjs$/.test(l.trim()));
  const cli = pre ? path.join(path.dirname(pre.trim()), "cli.mjs") : "";
  return cli && fs.existsSync(cli) ? cli : "";
}
const tsxCli = process.env.TEST_NPX === "1" ? "" : findTsxCli();
const fastTsx = Boolean(tsxCli);
function resolveCmd(cmd) {
  if (!fastTsx) return cmd;
  return cmd.replace(/^npx tsx(?=\s)/, `"${process.execPath}" "${tsxCli}"`);
}

const argStart = process.argv.find((a) => a.startsWith("--start="));
const startAt = Math.max(1, Number((argStart && argStart.split("=")[1]) || process.env.START_AT || "1"));
const stopOnFail = process.env.CONTINUE_ON_FAIL !== "1";
const jobs = Math.max(1, Number(process.env.TEST_JOBS || Math.min(8, Math.max(1, os.cpus().length - 2))));
const started = Date.now();
console.log(`run-unit-tests: ${parts.length} parts, startAt=${startAt}, jobs=${jobs}, fastTsx=${fastTsx}`);

const queue = [];
const serial = [];
for (let i = startAt - 1; i < parts.length; i++) (SERIAL.some((re) => re.test(parts[i])) ? serial : queue).push(i);

let failed = null;
const failures = [];
let passCount = 0;

function runOne(i) {
  return new Promise((resolve) => {
    const cmd = parts[i];
    const t0 = Date.now();
    const child = spawn(resolveCmd(cmd), { shell: true, cwd: root, env: process.env });
    let out = "";
    const keep = (d) => {
      out += d;
      if (out.length > 200000) out = out.slice(-100000);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("close", (status) => {
      const ms = Date.now() - t0;
      const label = `[${i + 1}/${parts.length}] ${cmd} ... `;
      if (status === 0) {
        passCount++;
        console.log(`${label}PASS (${ms}ms)`);
      } else {
        console.log(`${label}FAIL exit=${status} (${ms}ms)`);
        console.error(out.slice(-4000));
        const f = { i: i + 1, cmd, status };
        failures.push(f);
        if (!failed || f.i < failed.i) failed = f;
      }
      resolve();
    });
  });
}

async function pool(list, n) {
  let next = 0;
  async function worker() {
    while (next < list.length) {
      if (failed && stopOnFail) return;
      await runOne(list[next++]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, worker));
}

(async () => {
  await pool(queue, jobs);
  if (!(failed && stopOnFail)) await pool(serial, 1);
  const ran = passCount + failures.length;
  console.log(
    JSON.stringify(
      { total: parts.length, ran, passed: passCount, failed, failures: failures.length > 1 ? failures : undefined, jobs, elapsedMs: Date.now() - started },
      null,
      2
    )
  );
  // Coverage guard: a green run must have executed every scheduled part.
  if (!failed && ran !== parts.length - (startAt - 1)) {
    console.error(`ran ${ran} of ${parts.length - (startAt - 1)} parts`)
    process.exit(1)
  }
  process.exit(failed ? 1 : 0);
})();

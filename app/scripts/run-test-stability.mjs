import { randomInt } from "node:crypto";
import { spawnSync } from "node:child_process";

const vitest = new URL("../node_modules/vitest/vitest.mjs", import.meta.url).pathname;

for (let pass = 1; pass <= 2; pass += 1) {
  const seed = randomInt(1, 2_147_483_647);
  console.log(`Stability pass ${pass}/2 with Vitest seed ${seed}`);

  const result = spawnSync(
    process.execPath,
    [vitest, "run", "--sequence.shuffle", `--sequence.seed=${seed}`],
    { stdio: "inherit" }
  );

  if (result.status !== 0) process.exit(result.status ?? 1);
}

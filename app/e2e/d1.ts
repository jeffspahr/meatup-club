import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appDirectory = fileURLToPath(new URL("..", import.meta.url));
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

export function executeLocalD1File(file: URL) {
  execFileSync(
    npx,
    [
      "wrangler",
      "d1",
      "execute",
      "meatup-club-db",
      "--local",
      `--file=${fileURLToPath(file)}`,
    ],
    {
      cwd: appDirectory,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: "inherit",
    }
  );
}

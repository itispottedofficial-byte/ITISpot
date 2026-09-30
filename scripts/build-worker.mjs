import { spawnSync } from "node:child_process";
// Preserve the existing Cloudflare dashboard command: npx wrangler deploy.
const result = spawnSync("npx", ["opennextjs-cloudflare", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, ITISPOT_RUNTIME: "cloudflare" },
});
process.exit(result.status ?? 1);

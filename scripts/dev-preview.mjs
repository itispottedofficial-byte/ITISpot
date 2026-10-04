import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { preparePreviewData } from "./ui-preview-fixtures.mjs";

const directory = await preparePreviewData();
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3187",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ITISPOT_PREVIEW_DIR: directory,
      ITISPOT_MODE: "demo",
      ITISPOT_RUNTIME: "node",
      APP_ORIGIN: "http://127.0.0.1:3187",
      DATA_DIR: directory + "/demo",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
      TURNSTILE_SECRET_KEY: "",
    },
  },
);
console.log("Preview locale: http://127.0.0.1:3187/?preview=filled");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", async (code) => {
  await rm(directory, { recursive: true, force: true });
  process.exitCode = code ?? 0;
});

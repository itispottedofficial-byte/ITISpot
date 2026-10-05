import { defineConfig } from "@playwright/test";
import { rmSync } from "node:fs";
import { preparePreviewData } from "./scripts/ui-preview-fixtures.mjs";
const previewDirectory = await preparePreviewData();
process.once("exit", () =>
  rmSync(previewDirectory, { recursive: true, force: true }),
);
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3190",
    viewport: { width: 1440, height: 1000 },
    headless: true,
  },
  webServer: [
    {
      command: "node tests/fixtures/account-provider.mjs",
      url: "http://127.0.0.1:3191/health",
      reuseExistingServer: false,
    },
    {
      command: "npx next dev --hostname 127.0.0.1 --port 3190",
      url: "http://127.0.0.1:3190",
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        SUPABASE_URL: "http://127.0.0.1:3191",
        SUPABASE_PUBLISHABLE_KEY: "fixture-public-key",
        SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
        ITISPOT_PREVIEW_DIR: previewDirectory,
        ITISPOT_MODE: "demo",
        ITISPOT_RUNTIME: "node",
        APP_ORIGIN: "http://127.0.0.1:3190",
        DATA_DIR: ".data/e2e-" + Date.now(),
        ITISPOT_DIST_DIR: ".next-e2e",
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
        TURNSTILE_SECRET_KEY: "",
      },
    },
  ],
});

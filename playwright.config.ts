import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/** Astro 7 default — lesson examples use :3000; this app's `npm run dev` is :4321. */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:4321";

/** Cookie session for authenticated specs / CLI. Guest chromium project must not load this. */
export const STORAGE_STATE = path.join(process.cwd(), "playwright/.auth/user.json");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /auth\.setup\.ts/,
    },
    {
      name: "chromium-auth",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      testMatch: /\.auth\.spec\.ts/,
    },
  ],
});

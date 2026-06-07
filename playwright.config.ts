import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3210",
  },
  webServer: {
    command: "npm run dev -- -p 3210",
    url: "http://localhost:3210",
    reuseExistingServer: true,
    timeout: 120000,
  },
  timeout: 120000,
  retries: 0,
});

import { expect, test as setup } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const authFile = path.join(process.cwd(), "playwright/.auth/user.json");

setup("save storageState from /auth/signin", async ({ page }) => {
  await mkdir(path.dirname(authFile), { recursive: true });

  // Sign-in lives at /auth/signin — not /login (lesson example).
  await page.goto("/auth/signin");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  const quickLogin = page.getByRole("button", { name: "Szybkie logowanie (Avolicious)" });
  if (await quickLogin.isVisible()) {
    await Promise.all([page.waitForURL((url) => !url.pathname.startsWith("/auth/")), quickLogin.click()]);
  } else {
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;
    if (!email || !password) {
      throw new Error(
        "No local quick-login button. Set E2E_EMAIL and E2E_PASSWORD, or run against `astro dev` + local Supabase.",
      );
    }
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByLabel("Password").fill(password);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith("/auth/")),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);
  }

  await page.context().storageState({ path: authFile });
});

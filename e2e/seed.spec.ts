import { expect, test } from "@playwright/test";

// risk: test-plan.md #6 — unauthenticated visitor opens /dashboard or /runs/new
// seed: e2e/seed.spec.ts

test.describe("Risk #6 — unauthenticated visitor is sent to sign-in", () => {
  test.afterEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("unauthenticated visitor opening /dashboard or /runs/new is sent to sign-in while /runs stays public", async ({
    page,
  }) => {
    const isolationId = `e2e-guest-${Date.now()}`;

    // Guest opens the signed-in hub — middleware must send them to sign-in, not Your runs.
    await page.goto(`/dashboard?probe=${isolationId}`);
    await expect(page).toHaveURL(/\/auth\/signin/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your runs" })).toHaveCount(0);

    // Guest opens create-run — same gate, still not the organizer form.
    await page.goto(`/runs/new?probe=${isolationId}`);
    await expect(page).toHaveURL(/\/auth\/signin/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create a run" })).toHaveCount(0);

    // /runs stays publicly routable — do not treat every /runs/* path as protected.
    await page.goto("/runs");
    await expect(page).not.toHaveURL(/\/auth\/signin/);
    await expect(page.getByRole("heading", { name: "Active runs" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in" })).toHaveCount(0);
  });
});

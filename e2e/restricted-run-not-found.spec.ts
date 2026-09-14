import { expect, test, type Page, type Response } from "@playwright/test";
import { execFileSync } from "node:child_process";

// risk: test-plan.md #2 — guest/stranger can read a restricted run instead of not-found
// seed: e2e/seed.spec.ts

const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function sql(query: string): string {
  const raw = execFileSync("psql", ["-t", "-A", "-v", "ON_ERROR_STOP=1", DATABASE_URL, "-c", query], {
    encoding: "utf8",
  });
  const line = raw
    .split("\n")
    .map((row) => row.trim())
    .find((row) => row.length > 0 && !row.startsWith("INSERT"));
  return line ?? "";
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function insertFriendsOnlyRun(title: string): string {
  const id = sql(`
    insert into public.runs (organizer_id, title, starts_at, max_participants, visibility, join_mode)
    select p.id, ${sqlLiteral(title)}, now() + interval '2 hours', 8, 'friends_only', 'approval_required'
    from public.profiles p
    where p.is_verified
      and (
        select count(*) from public.runs r
        where r.organizer_id = p.id and r.archived_at is null
      ) < 5
    limit 1
    returning id;
  `);
  if (!id) {
    throw new Error("Could not insert a friends-only fixture (need a verified organizer under the 5-cap).");
  }
  return id;
}

function deleteRun(id: string): void {
  sql(`delete from public.runs where id = ${sqlLiteral(id)};`);
}

async function assertSameNotFoundAsMissing(page: Page, runId: string, response: Response | null): Promise<void> {
  if (response === null) {
    throw new Error(`GET /runs/${runId} produced no response`);
  }
  expect(response.status(), "restricted and missing runs must be 404, never 403").toBe(404);
  await expect(page).toHaveURL(new RegExp(`/runs/${runId}`));
  await expect(page.getByRole("heading", { name: "Run not found" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Forbidden" })).toHaveCount(0);
}

test.describe("Risk #2 — restricted run looks like a missing id", () => {
  test("guest sees the same not-found page for a restricted run as for a missing id, never 403 or body", async ({
    page,
  }) => {
    const missingId = crypto.randomUUID();
    const restrictedTitle = `e2e-${Date.now()}`;
    const restrictedId = insertFriendsOnlyRun(restrictedTitle);

    try {
      // Missing id — the oracle outcome (404 + Run not found, not a 403 body).
      const missingResponse = await page.goto(`/runs/${missingId}`);
      await assertSameNotFoundAsMissing(page, missingId, missingResponse);

      // Restricted friends-only — same hide as missing; unique title must not leak.
      const restrictedResponse = await page.goto(`/runs/${restrictedId}`);
      await assertSameNotFoundAsMissing(page, restrictedId, restrictedResponse);
      expect(restrictedResponse?.status()).toBe(missingResponse?.status());
      await expect(page.getByText(restrictedTitle, { exact: true })).toHaveCount(0);
    } finally {
      deleteRun(restrictedId);
      await page.context().clearCookies();
    }
  });
});

import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const email = "account-qa@example.test";
const password = "Private-qa-password-2026";
const shots = path.resolve(process.cwd(), "../itispot-accounts-preview");
test("optional account: signup, email confirmation, private SSR profile, reset, logout and anonymous Spot", async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir(shots, { recursive: true });
  await page.goto("/profilo");
  await expect(page).toHaveURL(/\/login$/);
  for (const route of ["login", "registrati"]) {
    await page.goto("/" + route);
    await expect(
      page.getByText("Creare un account è facoltativo."),
    ).toBeVisible();
    for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if ([375, 1440].includes(width))
        await page.screenshot({
          path: path.join(shots, `${route}-${width}.png`),
          fullPage: true,
        });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Username", { exact: true }).fill("pixel.qa");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Conferma password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "CREA ACCOUNT", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("troverai un’email");
  let confirmation = await (
    await request.get("http://127.0.0.1:3191/__test/mail?email=" + email)
  ).json();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ACCEDI", exact: true }).click();
  await expect(page.locator(".account-feedback[role=alert]")).toContainText(
    "Conferma la tua email",
  );
  await page.getByRole("button", { name: "Rinvia verifica email" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  confirmation = await (
    await request.get("http://127.0.0.1:3191/__test/mail?email=" + email)
  ).json();
  await page.goto(
    `/auth/confirm?token_hash=${confirmation.token_hash}&type=signup&next=https://evil.test`,
  );
  await page.getByRole("button", { name: "CONFERMA E CONTINUA" }).click();
  await expect(page).toHaveURL(/\/profilo$/);
  await expect(
    page.getByRole("heading", { name: "@pixel.qa", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sidebar-account")).toContainText("@pixel.qa");
  expect(
    (await context.cookies())
      .filter((c) => c.name.startsWith("itispot_user"))
      .every((c) => c.httpOnly && c.sameSite === "Lax"),
  ).toBe(true);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "@pixel.qa", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sidebar-account")).toContainText("@pixel.qa");
  for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if ([375, 1440].includes(width))
      await page.screenshot({
        path: path.join(shots, `profilo-${width}.png`),
        fullPage: true,
      });
  }
  await page.getByLabel("Username", { exact: true }).fill("pixel.renamed");
  await page.getByRole("button", { name: "SALVA USERNAME" }).click();
  await expect(
    page.getByRole("heading", { name: "@pixel.renamed", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/admin/session")).status()).toBe(401);
  expect((await page.request.get("/api/admin/spots")).status()).toBe(401);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "NOVITÀ", exact: true }),
  ).toBeVisible();
  await page.goto("/novita");
  await expect(
    page.getByRole("heading", { name: "NOVITÀ", exact: true }),
  ).toBeVisible();
  await page.goto("/invia");
  await page
    .getByLabel("Il tuo messaggio")
    .fill("Account QA: questo Spot deve restare anonimo.");
  await page.getByRole("checkbox").check();
  const submitted = page.waitForResponse(
    (r) => r.url().endsWith("/api/spots") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "INVIA LO SPOT", exact: true })
    .click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  const record = await response.json();
  expect(Object.keys(record).sort()).toEqual(["id", "status"]);
  expect(record.status).toBe("pending");
  const origin = "http://127.0.0.1:3190";
  expect(
    (
      await request.post("/api/admin/session", { headers: { origin } })
    ).status(),
  ).toBe(200);
  const pending = await (await request.get("/api/admin/spots")).json();
  const saved = pending.spots.find((s: { id: string }) => s.id === record.id);
  expect(saved).not.toHaveProperty("user_id");
  expect(saved).not.toHaveProperty("username");
  expect(
    (
      await request.patch("/api/admin/spots/" + record.id, {
        headers: { origin },
        data: { action: "delete" },
      })
    ).status(),
  ).toBe(200);
  await request.delete("/api/admin/session", { headers: { origin } });

  await page.goto("/profilo");
  await page
    .locator(".account-window-content")
    .getByRole("button", { name: "Logout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/profilo");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "ACCEDI", exact: true }).click();
  await expect(page.locator(".account-feedback[role=alert]")).toContainText(
    "Credenziali non valide",
  );
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ACCEDI", exact: true }).click();
  await expect(page).toHaveURL(/\/profilo$/);
  await page
    .locator(".account-window-content")
    .getByRole("button", { name: "Logout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/password-dimenticata");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "INVIA LINK" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  const recovery = await (
    await request.get("http://127.0.0.1:3191/__test/mail?email=" + email)
  ).json();
  await page.goto(
    `/auth/confirm?token_hash=${recovery.token_hash}&type=recovery`,
  );
  await page.getByRole("button", { name: "CONFERMA E CONTINUA" }).click();
  await expect(page).toHaveURL(/\/reset-password$/);
  await page
    .getByLabel("Nuova password", { exact: true })
    .fill(password + "changed");
  await page
    .getByLabel("Conferma password", { exact: true })
    .fill(password + "changed");
  await page.getByRole("button", { name: "SALVA PASSWORD" }).click();
  await expect(page).toHaveURL(/\/profilo$/);
  expect(errors).toEqual([]);
});

test("SSR refresh persists rotated cookies and keeps profile HTML private", async ({
  page,
  context,
  request,
}) => {
  const expired = await (
    await request.get("http://127.0.0.1:3191/__test/expired")
  ).json();
  await context.addCookies([
    {
      name: "itispot_user",
      value:
        "base64-" + Buffer.from(JSON.stringify(expired)).toString("base64url"),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const response = await page.goto("/profilo");
  // next dev overrides Cache-Control; production no-store is checked after build.
  expect(response!.headers()["cache-control"]).toMatch(/no-store|no-cache/);
  await expect(
    page.getByRole("heading", { name: "@pixel.blue", exact: true }),
  ).toBeVisible();
  const changed = (await context.cookies()).find(
    (c) => c.name === "itispot_user",
  )!;
  expect(changed.value).not.toContain(expired.access_token);
  expect(
    JSON.parse(Buffer.from(changed.value.slice(7), "base64url").toString())
      .expires_at,
  ).toBeGreaterThan(Date.now() / 1000);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "@pixel.blue", exact: true }),
  ).toBeVisible();
});

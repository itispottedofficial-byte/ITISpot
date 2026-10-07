import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
test("comments: anonymous reading, account identity, report, moderation and own deletion", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(120000);
  const origin = "http://127.0.0.1:3190";
  const shots = path.resolve("../itispot-comments-preview");
  await mkdir(shots, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const admin = await browser.newContext({ baseURL: origin });
  expect(
    (
      await admin.request.post("/api/admin/session", { headers: { origin } })
    ).status(),
  ).toBe(200);
  const r = await request.post("/api/spots", {
    headers: { origin },
    multipart: {
      text: "Commenti QA: uno spazio per tutte le voci.",
      consent: "true",
      website: "",
    },
  });
  expect(r.status()).toBe(201);
  const { id } = await r.json();
  await admin.request.patch("/api/admin/spots/" + id, {
    headers: { origin },
    data: { action: "approve" },
  });
  await request.post("http://127.0.0.1:3191/__test/comment-spot", {
    data: { id },
  });
  const feed = "/novita?q=Commenti%20QA";
  await page.goto(feed);
  await page.getByRole("button", { name: /Commenti/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Nessun commento, per ora.", { exact: false }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Scrivi un commento" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Devi accedere per commentare" }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/novita");
  await expect(
    dialog.getByRole("link", { name: "Accedi", exact: true }),
  ).toHaveAttribute("href", "/login");
  await dialog.getByRole("button", { name: "Annulla" }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("preview@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Preview-password-2026");
  await page.getByRole("button", { name: "ACCEDI", exact: true }).click();
  await expect(page).toHaveURL(/\/profilo$/);
  await page.goto(feed);
  await page.getByRole("button", { name: /Commenti/ }).click();
  const content =
    "Ci vediamo in cortile! 🌊 <script>window.commentXss=true</script>\n" +
    "Una voce, una persona. ".repeat(10);
  await dialog.getByLabel("Il tuo commento").fill(content);
  await dialog
    .getByRole("button", { name: "Pubblica", exact: true })
    .dblclick();
  await expect(
    dialog.getByText("Commento pubblicato.", { exact: true }),
  ).toBeVisible();
  await expect(dialog.locator(".comment-item")).toHaveCount(1);
  await expect(dialog.locator(".comment-content")).toHaveText(content);
  expect(
    await page.evaluate(() => Reflect.get(window, "commentXss")),
  ).toBeUndefined();
  expect((await page.request.get("/api/admin/comments")).status()).toBe(401);
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    if (width !== 768)
      await page.screenshot({
        path: path.join(shots, `comments-${width}.png`),
        fullPage: true,
      });
  }
  await dialog.getByRole("button", { name: "Segnala", exact: true }).click();
  await dialog
    .getByLabel("Motivo della segnalazione")
    .fill("Segnalazione locale di collaudo: verifica del pannello.");
  await dialog.getByRole("button", { name: "Invia segnalazione" }).click();
  await expect(
    dialog.getByText("Segnalazione inviata al team.", { exact: true }),
  ).toBeVisible();
  const ap = await admin.newPage();
  await ap.goto("/admin");
  const panel = ap.locator(".admin-comments");
  await expect(panel.getByText("@pixel.blue", { exact: true })).toBeVisible();
  await expect(
    panel.getByText("Segnalazione locale di collaudo:", { exact: false }),
  ).toBeVisible();
  for (const width of [375, 768, 1440]) {
    await ap.setViewportSize({ width, height: 1000 });
    expect(
      await ap.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await panel.screenshot({ path: path.join(shots, "comments-admin.png") });
  await panel.getByRole("button", { name: "Nascondi commento" }).click();
  await expect(
    panel.getByText("Commento nascosto.", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Chiudi commenti" }).click();
  await page.getByRole("button", { name: /Commenti/ }).click();
  await expect(dialog.locator(".comment-item")).toHaveCount(0);
  await panel.getByRole("button", { name: "Ripristina commento" }).click();
  await expect(
    panel.getByText("Commento ripristinato.", { exact: true }),
  ).toBeVisible();
  await page.request.post("/api/account/profile", {
    headers: { origin },
    data: { username: "pixel.comments" },
  });
  await dialog.getByRole("button", { name: "Chiudi commenti" }).click();
  await page.getByRole("button", { name: /Commenti/ }).click();
  await expect(
    dialog.getByText("@pixel.comments", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Elimina", exact: true }).click();
  await dialog.getByRole("button", { name: "Conferma eliminazione" }).click();
  await expect(
    dialog.getByText("Commento eliminato.", { exact: true }),
  ).toBeVisible();
  await expect(dialog.locator(".comment-item")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Chiudi commenti" }).click();
  await expect(page.locator(".comment-open span")).toHaveText("0");
  for (let i = 0; i < 4; i++)
    expect(
      (
        await page.request.post("/api/comments", {
          headers: { origin },
          data: { spot_id: id, content: "Rate check " + i },
        })
      ).status(),
    ).toBe(201);
  expect(
    (
      await page.request.post("/api/comments", {
        headers: { origin },
        data: { spot_id: id, content: "Limited" },
      })
    ).status(),
  ).toBe(429);
  await panel.getByRole("button", { name: "Tutti i commenti" }).click();
  await expect(panel.locator(".comment-item")).toHaveCount(4);
  await panel.getByRole("button", { name: "Elimina commento" }).first().click();
  await panel.getByRole("button", { name: "Conferma eliminazione" }).click();
  await expect(panel.locator(".comment-item")).toHaveCount(3);
  await page.request.post("/api/account/profile", {
    headers: { origin },
    data: { username: "pixel.blue" },
  });
  await page.goto("/invia");
  await expect(page.getByLabel("Il tuo messaggio")).toBeVisible();
  expect(errors).toEqual([]);
  await admin.request.patch("/api/admin/spots/" + id, {
    headers: { origin },
    data: { action: "delete" },
  });
  await admin.close();
});

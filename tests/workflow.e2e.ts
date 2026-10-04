import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
test("mobile submission, private image, moderation and logout", async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|hydrated|Minified React error/i.test(message.text())
    )
      errors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/invia");
  await expect(page).toHaveTitle(/ITISpot/);
  await expect(
    page.getByRole("heading", { name: "ITISpot", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("home-mobile.png"),
    fullPage: true,
    caret: "initial",
  });
  await page.getByLabel("Il tuo messaggio").fill("a".repeat(501));
  await expect(page.getByLabel("Il tuo messaggio")).toHaveValue(
    "a".repeat(500),
  );
  await page
    .getByLabel("Il tuo messaggio")
    .fill("Spot QA: grazie a chi rende questo spazio un bel posto.");
  await page.locator("input[type=file]").setInputFiles({
    name: "huge.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "10 MB" }),
  ).toContainText("10 MB");
  const png = await sharp({
    create: { width: 240, height: 180, channels: 3, background: "#0642ff" },
  })
    .png()
    .toBuffer();
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: png });
  await expect(
    page.getByRole("img", { name: "Anteprima della foto selezionata" }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/spots") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "INVIA LO SPOT", exact: true })
    .click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  await expect(
    page.getByRole("heading", { name: "Detto. Fatto. Anonimo." }),
  ).toBeVisible();
  await expect(page.getByText("Non è stato pubblicato.")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("success-mobile.png"),
    fullPage: true,
    caret: "initial",
  });
  expect((await request.get("/api/admin/images/" + id)).status()).toBe(401);
  expect(await (await request.get("/novita")).text()).not.toContain(
    "Spot QA: grazie a chi rende questo spazio un bel posto.",
  );
  await page.goto("/admin");
  await page.getByRole("button", { name: "ENTRA NELLA DEMO" }).click();
  await expect(
    page.getByText("Spot QA: grazie a chi rende questo spazio un bel posto."),
  ).toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: testInfo.outputPath("admin-mobile.png"),
    fullPage: true,
    caret: "initial",
  });
  const image = page.getByRole("img", {
    name: "Immagine allegata allo Spot",
    exact: true,
  });
  await expect(image).toBeVisible();
  expect(
    await image.evaluate((el) => (el as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Apri foto dello Spot " + id.slice(0, 8) })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Chiudi", exact: true }).click();
  await page.getByRole("button", { name: "Approva", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Spot approvato");
  const publicFeed = await request.get("/novita");
  expect(await publicFeed.text()).toContain(
    "Spot QA: grazie a chi rende questo spazio un bel posto.",
  );
  const publicImage = await request.get("/api/public/spots/" + id + "/image");
  expect(publicImage.status()).toBe(200);
  expect(publicImage.headers()["cache-control"]).toBe("no-store");
  await page.getByRole("button", { name: /Approvati/ }).click();
  await expect(page.getByText("Spot QA:", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Rifiuta", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Spot rifiutato");
  expect(
    (await request.get("/api/public/spots/" + id + "/image")).status(),
  ).toBe(404);
  await page.getByRole("button", { name: /Rifiutati/ }).click();
  await page.getByRole("button", { name: "Archivia", exact: true }).click();
  await page.getByRole("button", { name: /Archivio/ }).click();
  await page.getByRole("button", { name: "Ripristina", exact: true }).click();
  await page.getByRole("button", { name: /Rifiutati/ }).click();
  await page.getByRole("button", { name: "Elimina", exact: true }).click();
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: testInfo.outputPath("admin-desktop.png"),
    fullPage: true,
    caret: "initial",
  });
  await page.getByRole("button", { name: "Elimina", exact: true }).click();
  await page
    .getByRole("button", { name: "Elimina definitivamente", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Spot e immagine eliminati",
  );
  await page.getByRole("button", { name: "Esci", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "ENTRA NELLA DEMO" }),
  ).toBeVisible();
  await page.goto("/");
  await page.screenshot({
    path: testInfo.outputPath("home-desktop.png"),
    fullPage: true,
    caret: "initial",
  });
  expect(errors).toEqual([]);
});
test("HEIC upload survives conversion and stays private", async ({
  request,
}) => {
  const image = await readFile("tests/fixtures/blue-test.heic");
  const r = await request.post("/api/spots", {
    headers: { origin: "http://127.0.0.1:3190" },
    multipart: {
      text: "HEIC QA",
      consent: "true",
      image: { name: "photo.heic", mimeType: "image/heic", buffer: image },
    },
  });
  expect(r.status()).toBe(201);
  expect((await r.json()).status).toBe("pending");
});
test("full-width shells preserve readable content without overflow through ultrawide", async ({
  page,
}) => {
  for (const width of [320, 375, 768, 1024, 1280, 1440, 1728, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/novita", "/invia", "/admin", "/privacy"]) {
      await page.goto(path);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (["/", "/novita", "/invia"].includes(path)) {
        const shell = await page
          .locator(".site-shell,.portal-shell")
          .boundingBox();
        const viewport = await page.evaluate(
          () => document.documentElement.clientWidth,
        );
        expect(shell!.x).toBe(0);
        expect(shell!.width).toBe(viewport);
        expect(shell!.height).toBeGreaterThanOrEqual(900);
        const header = await page
          .locator(".topbar,.portal-header")
          .boundingBox();
        expect(header!.x).toBe(0);
        expect(header!.width).toBe(viewport);
        if (path === "/invia") {
          const form = await page.locator(".spot-window").boundingBox();
          expect(form!.width).toBeLessThanOrEqual(740);
          expect(
            Math.abs(form!.x + form!.width / 2 - viewport / 2),
          ).toBeLessThan(1);
          if (width >= 1600)
            expect(
              await page
                .locator(".site-shell")
                .evaluate(
                  (element) => getComputedStyle(element).backgroundSize,
                ),
            ).toBe("100% auto");
        } else if (width > 700) {
          expect((await page.locator(".portal-sidebar").boundingBox())!.x).toBe(
            0,
          );
        }
      }
    }
  }
});

test("home navigation and public search keep future features inactive", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "NOVITÀ", exact: true }),
  ).toBeVisible();
  for (const label of [
    "Curiosità",
    "Classifiche",
    "Sondaggi",
    "Arcade",
    "Login / Profilo",
  ])
    await expect(
      page.getByRole("button", { name: new RegExp(label + " in arrivo") }),
    ).toBeDisabled();
  await page.getByRole("link", { name: "Tutti gli Spot" }).click();
  await expect(page).toHaveURL(/\/novita$/);
  await page
    .getByLabel("Cerca negli Spot approvati")
    .fill("nessuna corrispondenza QA");
  await page.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nessuno Spot trovato." }),
  ).toBeVisible();
  await expect(page.getByLabel("Cerca negli Spot approvati")).toHaveValue(
    "nessuna corrispondenza QA",
  );
  await page.getByRole("link", { name: "Cancella ricerca" }).click();
  await expect(page).toHaveURL(/\/novita$/);
  await page.getByRole("link", { name: "Invia Spot", exact: true }).click();
  await expect(page).toHaveURL(/\/invia$/);
  await expect(page.getByLabel("Il tuo messaggio")).toBeVisible();
});

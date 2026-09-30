import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
test("mobile submission, private image, moderation and logout", async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
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
  });
  expect((await request.get("/api/admin/images/" + id)).status()).toBe(401);
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
  await page.getByRole("button", { name: /Approvati/ }).click();
  await expect(page.getByText("Spot QA:", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Rifiuta", exact: true }).click();
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
test("no horizontal overflow at small phone, tablet and desktop widths", async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/admin", "/privacy"]) {
      await page.goto(path);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});

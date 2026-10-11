import { test, expect } from "@playwright/test";
test("like login prompt, persisted like and unlike without full reload", async ({
  page,
  browser,
  request,
}) => {
  const origin = "http://127.0.0.1:3190";
  const admin = await browser.newContext({ baseURL: origin });
  await admin.request.post("/api/admin/session", {
    headers: { origin },
    data: { demo: true },
  });
  const r = await request.post("/api/spots", {
    headers: { origin },
    multipart: {
      text: "Likes browser fixture 🌊",
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
  await page.goto("/spotted/" + id);
  await page
    .getByRole("button", { name: "Metti mi piace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Accedi per mettere mi piace" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Annulla" }).click();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("preview@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Preview-password-2026");
  await page.getByRole("button", { name: "ACCEDI", exact: true }).click();
  await expect(page).toHaveURL(/profilo$/);
  await page.goto("/spotted/" + id);
  await page
    .getByRole("button", { name: "Metti mi piace", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Rimuovi mi piace" }),
  ).toHaveText("1");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Rimuovi mi piace" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Rimuovi mi piace" }).click();
  await expect(
    page.getByRole("button", { name: "Metti mi piace", exact: true }),
  ).toHaveText("0");
  expect(
    (
      await page.request.post("/api/likes", {
        headers: { origin },
        data: { spot_id: id, liked: true, user_id: id },
      })
    ).status(),
  ).toBe(400);
  await admin.request.patch("/api/admin/spots/" + id, {
    headers: { origin },
    data: { action: "delete" },
  });
  await admin.close();
});

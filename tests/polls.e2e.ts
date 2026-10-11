import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const shots = "/Users/simonfelletti/Library/Caches/ITISpot/launch-qa";
test("poll admin lifecycle, anonymous vote, double vote and responsive dashboard/archive", async ({
  page,
  browser,
}) => {
  await mkdir(shots, { recursive: true });
  const origin = "http://127.0.0.1:3190",
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const admin = await browser.newContext({ baseURL: origin });
  await admin.request.post("/api/admin/session", {
    headers: { origin },
    data: { demo: true },
  });
  const ap = await admin.newPage();
  await ap.goto("/admin");
  const section = ap.getByRole("region", { name: "Gestione sondaggi" });
  await section
    .getByLabel("Domanda", { exact: true })
    .fill("Quale spazio vorresti a scuola? 🌊");
  await section
    .getByLabel("Opzione 1", { exact: true })
    .fill("Uno spazio per la musica");
  await section
    .getByLabel("Opzione 2", { exact: true })
    .fill("Un giardino per tutti");
  await section.getByRole("button", { name: "Aggiungi opzione" }).click();
  await section
    .getByLabel("Opzione 3", { exact: true })
    .fill("Laboratorio creativo");
  await section.getByRole("button", { name: "Salva bozza" }).click();
  await expect(section.locator(".admin-poll-item")).toHaveCount(1);
  expect((await (await page.request.get("/api/polls")).json()).total).toBe(0);
  await section.getByRole("button", { name: "Pubblica sondaggio" }).click();
  await expect(
    section.getByRole("button", { name: "Chiudi sondaggio" }),
  ).toBeVisible();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Quale spazio vorresti a scuola? 🌊" }),
  ).toBeVisible();
  await page.goto("/sondaggi");
  await page.getByLabel("Un giardino per tutti", { exact: true }).check();
  await page.getByRole("button", { name: "VOTA", exact: true }).dblclick();
  await expect(page.getByText("Voto registrato. Grazie!")).toBeVisible();
  await expect(page.getByText("1 voto in totale")).toBeVisible();
  expect(
    await page.evaluate(() => Reflect.get(window, "pollXss")),
  ).toBeUndefined();
  const data = await (await page.request.get("/api/polls")).json();
  const poll = data.polls[0];
  expect(
    (
      await page.request.post("/api/polls/vote", {
        headers: { origin },
        data: { poll_id: poll.id, option_id: poll.options[0].id },
      })
    ).status(),
  ).toBe(409);
  await page.reload();
  await expect(page.getByText("1 voto in totale")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "VOTA", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.post("/api/admin/polls", {
        headers: { origin },
        data: { id: poll.id, action: "close" },
      })
    ).status(),
  ).toBe(401);
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "itispot_poll_voter",
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Lax");
  await ap.reload();
  await expect(section.getByText("1 voto in totale")).toBeVisible();
  for (const width of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await ap.setViewportSize({ width, height: 1000 });
    for (const route of ["/", "/spotted?preview=filled", "/sondaggi"]) {
      await page.goto(route);
      await expect(page.locator("main")).not.toBeEmpty();
      await expect(
        page.getByRole("status", { name: "Caricamento Spot" }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if ([375, 1440].includes(width))
        await page.screenshot({
          path: `${shots}/${route === "/" ? "home" : route.startsWith("/spotted") ? "spotted" : "polls"}-${width}.png`,
          fullPage: true,
        });
    }
    expect(
      await ap.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if ([375, 1440].includes(width))
      await section.screenshot({ path: `${shots}/admin-polls-${width}.png` });
  }
  await section.getByRole("button", { name: "Chiudi sondaggio" }).click();
  await expect(
    section.getByText("Sondaggio chiuso", { exact: true }),
  ).toBeVisible();
  await page.goto("/sondaggi");
  await expect(page.getByText("Chiuso", { exact: true })).toBeVisible();
  await expect(page.getByText("1 voto in totale")).toBeVisible();
  expect(
    (
      await page.request.post("/api/polls/vote", {
        headers: { origin },
        data: { poll_id: poll.id, option_id: poll.options[0].id },
      })
    ).status(),
  ).toBe(400);
  await section
    .getByLabel("Domanda", { exact: true })
    .fill("Bozza <script>window.pollXss=true</script> da eliminare");
  await section.getByLabel("Opzione 1", { exact: true }).fill("Sì");
  await section.getByLabel("Opzione 2", { exact: true }).fill("No");
  await section.getByRole("button", { name: "Salva bozza" }).click();
  await expect(
    section.getByRole("heading", {
      name: "Bozza <script>window.pollXss=true</script> da eliminare",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await ap.evaluate(() => Reflect.get(window, "pollXss")),
  ).toBeUndefined();
  ap.once("dialog", (d) => d.accept());
  await section.getByRole("button", { name: "Elimina bozza" }).click();
  await expect(section.locator(".admin-poll-item")).toHaveCount(1);
  expect(errors).toEqual([]);
  await admin.close();
});

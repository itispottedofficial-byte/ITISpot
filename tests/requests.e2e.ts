import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
test("requests: private anonymous/account submissions, admin inbox, responsive and no public retrieval", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(10000);
  const origin = "http://127.0.0.1:3190",
    shots = path.resolve("../itispot-requests-preview");
  await mkdir(shots, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const admin = await browser.newContext({ baseURL: origin });
  expect(
    (
      await admin.request.post("/api/admin/session", { headers: { origin } })
    ).status(),
  ).toBe(200);
  const ids: string[] = [];
  try {
    await page.goto("/");
    await page.getByRole("link", { name: "Richieste", exact: true }).click();
    await expect(page).toHaveURL(/\/richieste$/);
    await expect(page).toHaveTitle("Richieste & Suggerimenti — ITISpot");
    await expect(
      page.getByRole("heading", { name: /Richieste &/ }),
    ).toBeVisible();
    await page.getByLabel("Messaggio", { exact: true }).fill("Ciao");
    await page.getByLabel(/Confermo che il contenuto/).check();
    await page
      .getByRole("button", { name: "INVIA RICHIESTA", exact: true })
      .click();
    await expect(
      page.locator(".request-form").getByRole("alert"),
    ).toContainText("da 5 a 1000");
    await page.reload();
    await page.getByLabel(/Confermo che il contenuto/).check();
    const content =
      "Vorrei una guida per orientarmi tra le sezioni. 🌊 日本語 <script>window.requestXss=true</script>";
    await page.getByLabel("Messaggio", { exact: true }).fill(content);
    await page
      .getByLabel("Categoria", { exact: true })
      .selectOption("SUGGESTION");
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width !== 768)
        await page.screenshot({
          path: path.join(shots, `requests-${width}.png`),
          fullPage: true,
        });
    }
    const submissions: unknown[] = [];
    page.on("request", (r) => {
      if (r.url() === origin + "/api/requests" && r.method() === "POST")
        submissions.push(r.postDataJSON());
    });
    await page
      .getByRole("button", { name: "INVIA RICHIESTA", exact: true })
      .dblclick();
    await expect(
      page.getByRole("heading", { name: "Richiesta inviata!" }),
    ).toBeVisible();
    expect(submissions).toHaveLength(1);
    expect(Object.keys(submissions[0] as object).sort()).toEqual([
      "category",
      "content",
      "turnstile",
    ]);
    expect(await page.locator("main").innerText()).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-/i,
    );
    let rows = (await (await admin.request.get("/api/admin/requests")).json())
      .requests;
    expect(rows).toHaveLength(1);
    ids.push(rows[0].id);
    expect(rows[0]).toMatchObject({ status: "NEW", content, admin_note: null });
    for (const url of ["/api/requests", "/api/requests/" + ids[0]]) {
      const r = await page.request.get(url);
      expect([404, 405]).toContain(r.status());
      expect(await r.text()).not.toContain(content);
    }
    expect((await page.request.get("/api/admin/requests")).status()).toBe(401);
    await page.goto("/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill("preview@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("Preview-password-2026");
    await page.getByRole("button", { name: "ACCEDI", exact: true }).click();
    await expect(page).toHaveURL(/\/profilo$/);
    await page.goto("/richieste");
    await page.getByLabel("Categoria", { exact: true }).selectOption("BUG");
    await page
      .getByLabel("Messaggio", { exact: true })
      .fill("La pagina potrebbe spiegare meglio come tornare alla Home.");
    await page.getByLabel(/Confermo che il contenuto/).check();
    await page
      .getByRole("button", { name: "INVIA RICHIESTA", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Richiesta inviata!" }),
    ).toBeVisible();
    rows = (await (await admin.request.get("/api/admin/requests")).json())
      .requests;
    expect(rows).toHaveLength(2);
    ids.splice(0, ids.length, ...rows.map((r: { id: string }) => r.id));
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        "admin_note",
        "category",
        "content",
        "created_at",
        "id",
        "reviewed_at",
        "status",
        "updated_at",
      ]);
    }
    expect((await page.request.get("/api/admin/requests")).status()).toBe(401);
    expect(
      (
        await page.request.patch("/api/admin/requests/" + ids[0], {
          headers: { origin },
          data: { status: "COMPLETED" },
        })
      ).status(),
    ).toBe(401);
    const ap = await admin.newPage();
    ap.setDefaultTimeout(10000);
    ap.on("pageerror", (e) => errors.push(e.message));
    await ap.goto("/admin");
    const panel = ap.locator(".admin-requests");
    await expect(panel.locator(".request-item")).toHaveCount(2);
    const item = panel.locator(".request-item").filter({ hasText: content });
    await item.locator("summary").click();
    await expect(item.locator(".request-content")).toHaveText(content);
    expect(
      await ap.evaluate(() => Reflect.get(window, "requestXss")),
    ).toBeUndefined();
    await item.getByLabel("Stato", { exact: true }).selectOption("REVIEWING");
    await item
      .getByLabel("Nota interna", { exact: false })
      .fill(
        "Nota privata QA: idea da valutare con il team. <script>window.noteXss=true</script>",
      );
    await item.getByRole("button", { name: "Salva richiesta" }).click();
    await expect(panel.getByRole("status")).toHaveText("Richiesta aggiornata.");
    await expect(item.locator(".request-status")).toHaveText("In esame");
    await item.locator("summary").click();
    await expect(item.getByLabel("Nota interna", { exact: false })).toHaveValue(
      /Nota privata QA/,
    );
    expect(
      await ap.evaluate(() => Reflect.get(window, "noteXss")),
    ).toBeUndefined();
    for (const width of [375, 768, 1440]) {
      await ap.setViewportSize({ width, height: 1000 });
      expect(
        await ap.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await panel.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      if (width !== 768)
        await panel.screenshot({
          path: path.join(shots, `requests-admin-${width}.png`),
        });
    }
    for (const [label, count] of [
      ["Nuove", 1],
      ["In esame", 1],
      ["Accettate", 0],
      ["Rifiutate", 0],
      ["Completate", 0],
      ["Tutte", 2],
    ] as const) {
      await panel.getByRole("button", { name: label, exact: true }).click();
      await expect(
        panel.getByRole("button", { name: "Aggiorna richieste" }),
      ).toBeEnabled();
      await expect(panel.locator(".request-item")).toHaveCount(count);
    }
    await item.locator("summary").click();
    await item.getByLabel("Stato", { exact: true }).selectOption("COMPLETED");
    await item.getByRole("button", { name: "Salva richiesta" }).click();
    await expect(item.locator(".request-status")).toHaveText("Completate");
    await item.locator("summary").click();
    await item
      .getByRole("button", { name: "Elimina richiesta", exact: true })
      .click();
    await item
      .getByRole("button", { name: "Conferma eliminazione richiesta" })
      .click();
    await expect(panel.locator(".request-item")).toHaveCount(1);
    await page.goto("/richieste");
    expect(await page.locator("main").innerText()).not.toContain(
      "Nota privata QA",
    );
    await page
      .getByLabel("Messaggio", { exact: true })
      .fill("Ultimo messaggio di test per verificare il limite.");
    await page.getByLabel(/Confermo che il contenuto/).check();
    await page
      .getByRole("button", { name: "INVIA RICHIESTA", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Richiesta inviata!" }),
    ).toBeVisible();
    rows = (await (await admin.request.get("/api/admin/requests")).json())
      .requests;
    ids.push(...rows.map((r: { id: string }) => r.id));
    await page
      .getByRole("button", { name: "Scrivi un’altra richiesta" })
      .click();
    await page
      .getByLabel("Messaggio", { exact: true })
      .fill("Questo messaggio deve essere limitato.");
    await page.getByLabel(/Confermo che il contenuto/).check();
    await page
      .getByRole("button", { name: "INVIA RICHIESTA", exact: true })
      .click();
    await expect(
      page.locator(".request-form").getByRole("alert"),
    ).toContainText("Aspetta 10 minuti");
    await page.goto("/invia");
    await expect(page.getByLabel("Il tuo messaggio")).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    for (const id of new Set(ids))
      await admin.request.delete("/api/admin/requests/" + id, {
        headers: { origin }, timeout:5000,
      }).catch(()=>{});
    await admin.close();
  }
});

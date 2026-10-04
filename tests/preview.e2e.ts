import { expect, test } from "@playwright/test";

test("card text contrast, hover feedback and touch targets stay readable", async ({
  page,
}) => {
  await page.goto("/?preview=filled&featured=b");
  const link = page.getByRole("link", { name: "Tutti gli Spot" });
  await expect(link).toBeVisible();
  const before = await link.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await link.hover();
  expect(
    await link.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe(before);
  const luminance = (values: number[]) => {
    const channels = values.map((value) => {
      const n = value / 255;
      return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const silver = luminance([201, 203, 210]);
  await page.goto("/novita?preview=filled");
  await expect(page.locator(".public-spot-card")).toHaveCount(5);
  for (const selector of [
    ".public-spot-text",
    ".public-spot-meta time",
    ".public-spot-future",
  ]) {
    const color = await page
      .locator(selector)
      .first()
      .evaluate((element) => getComputedStyle(element).color);
    const foreground = luminance(color.match(/\d+/g)!.map(Number));
    expect((silver + 0.05) / (foreground + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  for (const selector of [
    ".portal-search button",
    ".portal-footer nav a",
    ".feed-preview button",
  ]) {
    for (const control of await page.locator(selector).all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test("local mock cards preserve every layout from 320 through 2560 pixels", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  for (const width of [320, 375, 768, 1024, 1280, 1440, 1728, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/novita"]) {
      await page.goto(route + "?preview=filled&featured=d");
      await expect(
        page.getByRole("complementary", { name: "Controlli preview locale" }),
      ).toBeVisible();
      await expect(page.locator(".public-spot-card")).toHaveCount(
        route === "/" ? 1 : 5,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      for (const image of await page.locator(".public-spot-image").all()) {
        await image.scrollIntoViewIfNeeded();
        await expect(image).toBeVisible();
        await expect
          .poll(() =>
            image.evaluate(
              (element: HTMLImageElement) =>
                element.complete && element.naturalWidth > 0,
            ),
          )
          .toBe(true);
        expect(await image.getAttribute("alt")).toBeTruthy();
        expect(
          await image.evaluate(
            (element) => getComputedStyle(element).objectFit,
          ),
        ).toBe("contain");
      }
      for (const card of await page.locator(".public-spot-card").all()) {
        await expect(card.getByText("Anonimo", { exact: true })).toBeVisible();
        expect(
          await card.locator("time").getAttribute("datetime"),
        ).toBeTruthy();
      }
      if (route === "/novita") {
        const long = page
          .locator(".public-spot-text")
          .filter({ hasText: "Oggi in laboratorio" });
        expect((await long.textContent())!.length).toBeGreaterThanOrEqual(480);
        expect(
          await long.evaluate(
            (element) => element.scrollHeight <= element.clientHeight + 1,
          ),
        ).toBe(true);
      }
    }
  }
  expect(errors).toEqual([]);
});

test("all five Home cases, search and keyboard focus work in local preview", async ({
  page,
}) => {
  for (const featured of ["a", "b", "c", "d", "e"]) {
    await page.goto("/?preview=filled&featured=" + featured);
    await expect(page.locator(".public-spot-card")).toHaveCount(1);
    await expect(page.locator(".public-spot-image")).toHaveCount(
      ["b", "d", "e"].includes(featured) ? 1 : 0,
    );
  }
  await page.getByLabel("Cerca negli Spot approvati").fill("playlist");
  await page.getByLabel("Cerca negli Spot approvati").press("Tab");
  await expect(
    page.getByRole("button", { name: "Cerca", exact: true }),
  ).toBeFocused();
  expect(
    await page
      .getByRole("button", { name: "Cerca", exact: true })
      .evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe("solid");
  await page.getByRole("button", { name: "Cerca", exact: true }).press("Enter");
  await expect(page).toHaveURL(/novita.*preview=filled/);
  await expect(page.locator(".public-spot-card")).toHaveCount(1);
  await page.getByRole("link", { name: "Cancella ricerca" }).click();
  await expect(page.locator(".public-spot-card")).toHaveCount(5);
});

test("empty, unavailable and streaming loading states remain understandable", async ({
  page,
}) => {
  for (const route of ["/", "/novita"]) {
    await page.goto(route + "?preview=empty");
    await expect(page.locator(".portal-empty-state h2")).toContainText(
      route === "/" ? "La prima voce" : "La bacheca",
    );
    await page.goto(route + "?preview=error");
    await expect(page.locator(".portal-empty-state")).toContainText(
      route === "/" ? "ci ricolleghiamo" : "Ci ricolleghiamo",
    );
    await page.goto(route + "?preview=loading", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("status", { name: "Caricamento Spot" }),
    ).toBeVisible();
    await expect(page.locator(".public-spot-card")).toHaveCount(
      route === "/" ? 1 : 5,
    );
    await expect(
      page.getByRole("status", { name: "Caricamento Spot" }),
    ).toHaveCount(0);
  }
  await page.goto("/novita");
  await expect(
    page.getByRole("complementary", { name: "Controlli preview locale" }),
  ).toHaveCount(0);
  await expect(page.locator(".public-spot-card")).toHaveCount(0);
});

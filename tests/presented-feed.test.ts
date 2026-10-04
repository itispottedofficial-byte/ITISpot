import { afterEach, expect, it, vi } from "vitest";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { preparePreviewData } from "../scripts/ui-preview-fixtures.mjs";
import { feedHref, presentedFeed, previewState } from "@/lib/presented-feed";
import { publicFeed } from "@/lib/public-spots";

vi.mock("@/lib/public-spots", () => ({
  publicFeed: vi.fn(async () => ({ spots: [], total: 0, available: true })),
}));
let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("requires explicit local configuration and a valid preview mode", () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("ITISPOT_PREVIEW_DIR", "");
  expect(previewState({ preview: "filled" })).toBeUndefined();
  vi.stubEnv("ITISPOT_PREVIEW_DIR", "/tmp/ui-only");
  expect(previewState({})).toBeUndefined();
  expect(previewState({ preview: ["filled"] })).toBeUndefined();
  expect(previewState({ preview: "invalid" })).toBeUndefined();
  expect(previewState({ preview: "filled", featured: "z" })).toEqual({
    mode: "filled",
    featured: "a",
  });
});
it("never serves preview data in production even with forced env, URL and internal props", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ITISPOT_PREVIEW_DIR", "/tmp/ui-only");
  expect(previewState({ preview: "filled" })).toBeUndefined();
  expect(
    await presentedFeed("real query", 2, { mode: "filled", featured: "a" }),
  ).toEqual({ spots: [], total: 0, available: true });
  expect(publicFeed).toHaveBeenCalledWith("real query", 2);
  await expect(preparePreviewData()).rejects.toThrow(
    "Preview disabled in production",
  );
});
it("generates exactly five local cases with safe text and three image proportions", async () => {
  vi.stubEnv("NODE_ENV", "test");
  directory = await preparePreviewData();
  vi.stubEnv("ITISPOT_PREVIEW_DIR", directory);
  const feed = await presentedFeed("", 1, { mode: "filled", featured: "a" });
  expect(feed.total).toBe(5);
  expect(
    feed.spots.every((spot) => spot.text.length <= 500 && !("author" in spot)),
  ).toBe(true);
  expect(feed.spots[2].text.length).toBeGreaterThanOrEqual(480);
  expect(feed.spots[0].imageUrl).toBeNull();
  expect(feed.spots[2].imageUrl).toBeNull();
  const proportions = [];
  for (const spot of feed.spots.filter((spot) => spot.imageUrl)) {
    const meta = await sharp(
      Buffer.from(spot.imageUrl!.split(",")[1], "base64"),
    ).metadata();
    proportions.push(meta.width! / meta.height!);
  }
  expect(proportions).toEqual([1, 0.6, 1200 / 675]);
  const stored = await readFile(path.join(directory, "spots.json"), "utf8");
  expect(stored).not.toMatch(
    /user_id|ip_address|rejection_reason|service_role/,
  );
  expect(publicFeed).not.toHaveBeenCalled();
});
it("handles preview search, featured content, empty and error without touching the repository", async () => {
  vi.stubEnv("NODE_ENV", "test");
  directory = await preparePreviewData();
  vi.stubEnv("ITISPOT_PREVIEW_DIR", directory);
  expect(
    (await presentedFeed("", 1, { mode: "filled", featured: "d" })).spots[0].id,
  ).toMatch(/-d$/);
  expect(
    (await presentedFeed("playlist", 1, { mode: "filled", featured: "a" }))
      .total,
  ).toBe(1);
  expect(await presentedFeed("", 1, { mode: "empty", featured: "a" })).toEqual({
    spots: [],
    total: 0,
    available: true,
  });
  expect(await presentedFeed("", 1, { mode: "error", featured: "a" })).toEqual({
    spots: [],
    total: 0,
    available: false,
  });
  expect(
    feedHref("/novita", { mode: "filled", featured: "e" }, { q: "test" }),
  ).toBe("/novita?preview=filled&featured=e&q=test");
  expect(feedHref("/novita")).toBe("/novita");
  expect(publicFeed).not.toHaveBeenCalled();
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createSpot, updateSpot } from "@/lib/repository";
import { publicFeed } from "@/lib/public-spots";
import { GET as image } from "@/app/api/public/spots/[id]/image/route";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "itispot-public-test-"));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ITISPOT_MODE", "demo");
  vi.stubEnv("DATA_DIR", directory);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});
function photo(id: string) {
  return image(
    new Request("http://localhost/api/public/spots/" + id + "/image"),
    {
      params: Promise.resolve({ id }),
    },
  );
}
it("only exposes approved, unarchived Spots and strips every administrative field", async () => {
  await createSpot("Private pending text");
  const rejected = await createSpot("Private rejected text");
  await updateSpot(rejected.id, "reject");
  const archived = await createSpot("Private archive text");
  await updateSpot(archived.id, "approve");
  await updateSpot(archived.id, "archive");
  const approved = await createSpot("Public approved text");
  await updateSpot(approved.id, "approve");
  const feed = await publicFeed();
  expect(feed.available).toBe(true);
  expect(feed.total).toBe(1);
  expect(feed.spots).toEqual([
    {
      id: approved.id,
      text: approved.text,
      created_at: approved.created_at,
      imageUrl: null,
    },
  ]);
  expect(JSON.stringify(feed)).not.toMatch(
    /Private|reviewed_at|rejection_reason|image_path|archived_at|updated_at|counts/,
  );
});
it("rechecks image eligibility on every request and revokes access after archive, reject or delete", async () => {
  const webp = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#073aff" },
  })
    .webp()
    .toBuffer();
  const spot = await createSpot("Photo test", webp);
  expect((await photo(spot.id)).status).toBe(404);
  await updateSpot(spot.id, "approve");
  const allowed = await photo(spot.id);
  expect(allowed.status).toBe(200);
  expect(allowed.headers.get("content-type")).toBe("image/webp");
  expect(allowed.headers.get("cache-control")).toBe("no-store");
  expect(Buffer.from(await allowed.arrayBuffer())).toEqual(webp);
  expect((await publicFeed()).spots[0].imageUrl).toBe(
    `/api/public/spots/${spot.id}/image`,
  );
  await updateSpot(spot.id, "archive");
  expect((await photo(spot.id)).status).toBe(404);
  expect((await publicFeed()).spots).toEqual([]);
  await updateSpot(spot.id, "restore");
  expect((await photo(spot.id)).status).toBe(200);
  await updateSpot(spot.id, "reject");
  expect((await photo(spot.id)).status).toBe(404);
  await updateSpot(spot.id, "delete");
  expect((await photo(spot.id)).status).toBe(404);
  expect((await photo("../../store.json")).status).toBe(404);
});
it("uses only the approved subset and public columns in the Supabase request", async () => {
  vi.stubEnv("ITISPOT_MODE", "supabase");
  vi.stubEnv("SUPABASE_URL", "https://db.example");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_public_feed_fixture_only");
  const id = "12345678-1234-4234-8234-123456789abc";
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    expect(url.searchParams.get("status")).toBe("eq.approved");
    expect(url.searchParams.get("archived_at")).toBe("is.null");
    expect(url.searchParams.get("select")).toBe(
      "id,text,created_at,image_path",
    );
    expect(url.searchParams.get("text")).toBe("ilike.%100\\%\\_safe%");
    expect(url.searchParams.get("offset")).toBe("24");
    return Response.json(
      [
        {
          id,
          text: "100%_safe",
          created_at: "2026-10-03T12:00:00Z",
          image_path: `${id}.webp`,
          rejection_reason: "Private diagnostics",
        },
      ],
      { headers: { "content-range": "24-24/25" } },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const feed = await publicFeed("100%_safe", 2);
  expect(feed.total).toBe(25);
  expect(Object.keys(feed.spots[0]).sort()).toEqual([
    "created_at",
    "id",
    "imageUrl",
    "text",
  ]);
  expect(JSON.stringify(feed)).not.toContain("Private diagnostics");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("renders a controlled unavailable state without leaking configuration or provider errors", async () => {
  vi.stubEnv("ITISPOT_MODE", "supabase");
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  expect(await publicFeed()).toEqual({ spots: [], total: 0, available: false });
  vi.stubEnv("SUPABASE_URL", "https://db.example");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_public_feed_fixture_only");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { message: "secret provider diagnostics" },
        { status: 503 },
      ),
    ),
  );
  expect(await publicFeed()).toEqual({ spots: [], total: 0, available: false });
});

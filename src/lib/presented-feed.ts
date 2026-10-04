import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { publicFeed, type PublicFeed, type PublicSpot } from "./public-spots";

export type PreviewState = {
  mode: "filled" | "empty" | "error" | "loading";
  featured: string;
};
export type FeedParams = Record<string, string | string[] | undefined>;
export function previewState(params: FeedParams): PreviewState | undefined {
  // Both gates are required. A URL or runtime variable can never enable this in production.
  if (process.env.NODE_ENV === "production" || !process.env.ITISPOT_PREVIEW_DIR)
    return;
  if (
    typeof params.preview !== "string" ||
    !["filled", "empty", "error", "loading"].includes(params.preview)
  )
    return;
  return {
    mode: params.preview as PreviewState["mode"],
    featured:
      typeof params.featured === "string" && /^[a-e]$/.test(params.featured)
        ? params.featured
        : "a",
  };
}
export function feedHref(
  route: "/" | "/novita",
  preview?: PreviewState,
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams({
    ...(preview ? { preview: preview.mode, featured: preview.featured } : {}),
    ...extra,
  });
  return route + (params.size ? "?" + params : "");
}
export async function presentedFeed(
  query = "",
  page = 1,
  preview?: PreviewState,
): Promise<PublicFeed> {
  if (
    !preview ||
    process.env.NODE_ENV === "production" ||
    !process.env.ITISPOT_PREVIEW_DIR
  )
    return publicFeed(query, page);
  if (preview.mode === "empty" || preview.mode === "error")
    return { spots: [], total: 0, available: preview.mode === "empty" };
  if (preview.mode === "loading")
    await new Promise((resolve) => setTimeout(resolve, 2000));
  try {
    const spots = JSON.parse(
      await readFile(
        path.join(process.env.ITISPOT_PREVIEW_DIR, "spots.json"),
        "utf8",
      ),
    ) as PublicSpot[];
    const filtered = spots.filter((spot) =>
      spot.text
        .toLocaleLowerCase("it-IT")
        .includes(query.toLocaleLowerCase("it-IT")),
    );
    const first = filtered.findIndex((spot) =>
      spot.id.endsWith("-" + preview.featured),
    );
    if (first > 0) filtered.unshift(...filtered.splice(first, 1));
    return {
      spots: filtered.slice((page - 1) * 24, page * 24),
      total: filtered.length,
      available: true,
    };
  } catch {
    return { spots: [], total: 0, available: false };
  }
}

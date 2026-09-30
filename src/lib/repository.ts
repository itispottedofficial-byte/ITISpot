import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { mode } from "./config";
import { localTransaction, dataDir } from "./local-store";
import { supabase } from "./supabase";
import type { Action, Spot, SpotFilter, SpotPage } from "./types";

export async function listSpots(
  filter: SpotFilter = "all",
  search = "",
  page = 1,
): Promise<SpotPage> {
  const size = 24;
  if (mode() === "demo")
    return localTransaction((d) => {
      const counts = {
        pending: 0,
        approved: 0,
        rejected: 0,
        archived: 0,
        all: 0,
      };
      for (const spot of d.spots) {
        if (spot.archived_at) counts.archived++;
        else {
          counts[spot.status]++;
          counts.all++;
        }
      }
      const matches = d.spots
        .filter(
          (s) =>
            (filter === "archived"
              ? !!s.archived_at
              : !s.archived_at && (filter === "all" || s.status === filter)) &&
            `${s.text} ${s.id}`.toLowerCase().includes(search.toLowerCase()),
        )
        .sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) ||
            b.id.localeCompare(a.id),
        );
      return {
        spots: matches.slice((page - 1) * size, page * size),
        total: matches.length,
        counts,
      };
    });
  const { data, error } = await supabase().rpc("list_spots_page", {
    p_filter: filter,
    p_search: search,
    p_offset: (page - 1) * size,
    p_limit: size,
  });
  if (error) throw error;
  return data as SpotPage;
}
export async function getSpot(id: string): Promise<Spot | null> {
  if (mode() === "demo")
    return localTransaction((d) => d.spots.find((s) => s.id === id) || null);
  const { data, error } = await supabase()
    .from("spots")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
export async function createSpot(text: string, image?: Buffer): Promise<Spot> {
  const id = randomUUID(),
    now = new Date().toISOString();
  const spot: Spot = {
    id,
    text,
    status: "pending",
    image_path: image ? `${id}.webp` : null,
    created_at: now,
    updated_at: now,
    archived_at: null,
  };
  if (image) await saveImage(spot.image_path!, image);
  try {
    if (mode() === "demo")
      await localTransaction((d) => {
        d.spots.push(spot);
      });
    else {
      const { error } = await supabase().from("spots").insert(spot);
      if (error) throw error;
    }
  } catch (e) {
    if (spot.image_path) await removeImage(spot.image_path).catch(() => {});
    throw e;
  }
  return spot;
}
export function patchFor(action: Exclude<Action, "delete">): Partial<Spot> {
  const now = new Date().toISOString();
  if (action === "archive" || action === "restore")
    return { archived_at: action === "archive" ? now : null, updated_at: now };
  return {
    status: action === "approve" ? "approved" : "rejected",
    updated_at: now,
  };
}
export async function updateSpot(id: string, action: Action) {
  const spot = await getSpot(id);
  if (!spot) return false;
  if (action === "delete" && spot.image_path)
    await removeImage(spot.image_path);
  if (mode() === "demo")
    await localTransaction((d) => {
      if (action === "delete") d.spots = d.spots.filter((s) => s.id !== id);
      else {
        const target = d.spots.find((s) => s.id === id);
        if (target) Object.assign(target, patchFor(action));
      }
    });
  else {
    const query =
      action === "delete"
        ? supabase().from("spots").delete()
        : supabase().from("spots").update(patchFor(action));
    const { error } = await query.eq("id", id);
    if (error) throw error;
  }
  return true;
}
async function saveImage(name: string, image: Buffer) {
  if (mode() === "demo") {
    await mkdir(path.join(dataDir(), "images"), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(path.join(dataDir(), "images", name), image, {
      mode: 0o600,
    });
  } else {
    const { error } = await supabase()
      .storage.from("spot-images")
      .upload(name, image, { contentType: "image/webp", upsert: false });
    if (error) throw error;
  }
}
async function removeImage(name: string) {
  if (mode() === "demo")
    await unlink(path.join(dataDir(), "images", name)).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  else {
    const { error } = await supabase()
      .storage.from("spot-images")
      .remove([name]);
    if (error) throw error;
  }
}
export async function readImage(name: string): Promise<Buffer> {
  if (!/^[a-f0-9-]{36}\.webp$/.test(name)) throw new Error("Invalid image");
  if (mode() === "demo") return readFile(path.join(dataDir(), "images", name));
  const { data, error } = await supabase()
    .storage.from("spot-images")
    .download(name);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

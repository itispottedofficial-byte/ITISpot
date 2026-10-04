import "server-only";
import { mode } from "./config";
import { getSpot, listSpots, readImage } from "./repository";
import { supabase } from "./supabase";
import { idSchema } from "./validation";

// Only this projection may cross the public rendering boundary. The bucket and
// moderation queue retain their existing private permissions.
export interface PublicSpot {
  id: string;
  text: string;
  created_at: string;
  imageUrl: string | null;
}
export interface PublicFeed {
  spots: PublicSpot[];
  total: number;
  available: boolean;
}
function project(spot: {
  id: string;
  text: string;
  created_at: string;
  image_path: string | null;
}): PublicSpot {
  return {
    id: spot.id,
    text: spot.text,
    created_at: spot.created_at,
    imageUrl:
      idSchema.safeParse(spot.id).success &&
      spot.image_path === `${spot.id}.webp`
        ? `/api/public/spots/${spot.id}/image`
        : null,
  };
}
export async function publicFeed(search = "", page = 1): Promise<PublicFeed> {
  const query = search.trim().slice(0, 500);
  const current = Math.min(100000, Math.max(1, Math.floor(page) || 1));
  try {
    if (mode() === "demo") {
      const result = await listSpots("approved", query, current);
      return {
        spots: result.spots
          .filter((spot) => spot.status === "approved" && !spot.archived_at)
          .map(project),
        total: result.total,
        available: true,
      };
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
      return { spots: [], total: 0, available: false };
    let request = supabase()
      .from("spots")
      .select("id,text,created_at,image_path", { count: "exact" })
      .eq("status", "approved")
      .is("archived_at", null);
    // Search is a literal substring, not a user-supplied SQL wildcard pattern.
    if (query)
      request = request.ilike("text", `%${query.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, count, error } = await request
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((current - 1) * 24, current * 24 - 1);
    if (error) return { spots: [], total: 0, available: false };
    return {
      spots: (data || []).map(project),
      total: count || 0,
      available: true,
    };
  } catch {
    return { spots: [], total: 0, available: false };
  }
}
export async function publicImage(id: string): Promise<Buffer | null> {
  if (!idSchema.safeParse(id).success) return null;
  const spot = await getSpot(id);
  if (
    !spot ||
    spot.status !== "approved" ||
    spot.archived_at ||
    spot.image_path !== `${id}.webp`
  )
    return null;
  return readImage(spot.image_path);
}

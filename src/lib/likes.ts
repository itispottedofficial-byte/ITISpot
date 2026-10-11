import "server-only";
import { serverAccountClient } from "./account";
import { accountConfigured } from "./account-client";
import { HttpError } from "./http";
import { commentError } from "./comments";
export type LikeStats = { count: number; liked: boolean };
export async function likeStats(
  ids: string[],
): Promise<Record<string, LikeStats> | null> {
  if (!ids.length || !accountConfigured()) return null;
  try {
    const client = await serverAccountClient();
    const { data, error } = await client.rpc("spot_like_stats", {
      p_spots: ids,
    });
    return error ? null : data;
  } catch {
    return null;
  }
}
export async function setLike(id: string, liked: boolean) {
  if (!accountConfigured())
    throw new HttpError(503, "I mi piace saranno disponibili a breve.");
  const client = await serverAccountClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError && (!authError.status || authError.status >= 500))
    throw new HttpError(503, "Account non disponibili. Riprova.");
  if (!auth.user?.email_confirmed_at)
    throw new HttpError(401, "Accedi per mettere mi piace");
  const { data, error } = await client.rpc("set_spot_like", {
    p_spot: id,
    p_liked: liked,
  });
  commentError(error);
  return data as LikeStats;
}

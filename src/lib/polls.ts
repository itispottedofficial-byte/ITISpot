import "server-only";
import { cookies } from "next/headers";
import { supabase } from "./supabase";
import { HttpError } from "./http";
import { POLL_COOKIE, pollVoter } from "./poll-voter";
import type { Poll, PollPage } from "./poll-validation";
export function pollError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "23505")
    throw new HttpError(409, "Hai già votato in questo sondaggio.");
  if (error.code === "22023" || error.code === "23514")
    throw new HttpError(
      400,
      "Controlla le opzioni e la data: il sondaggio potrebbe essere chiuso o non modificabile.",
    );
  if (error.code === "P0002")
    throw new HttpError(404, "Sondaggio non disponibile.");
  throw new HttpError(
    503,
    "Sondaggi momentaneamente non disponibili. Riprova.",
  );
}
export async function pollsPage(
  admin = false,
  page = 1,
  featured = false,
): Promise<PollPage> {
  const client = supabase();
  const { data, error } = await client.rpc("list_polls", {
    p_admin: admin,
    p_offset: (page - 1) * 12,
    p_featured: featured,
  });
  pollError(error);
  if (!admin) {
    const raw = (await cookies()).get(POLL_COOKIE)?.value;
    await Promise.all(
      (data.polls as Poll[]).map(async (poll) => {
        const hash = pollVoter(raw, poll.id);
        if (hash) {
          const { data: own, error: e } = await client.rpc("poll_projection", {
            p_id: poll.id,
            p_voter: hash,
          });
          pollError(e);
          poll.voted = !!own?.voted;
        }
      }),
    );
  }
  return data;
}

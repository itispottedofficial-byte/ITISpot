import { NextRequest, NextResponse } from "next/server";
import {
  guard,
  failure,
  privateHeaders,
  boundedJson,
  HttpError,
} from "@/lib/http";
import { POLL_COOKIE, pollVoter } from "@/lib/poll-voter";
import { pollVoteSchema } from "@/lib/poll-validation";
import { pollError } from "@/lib/polls";
import { rateLimit } from "@/lib/security";
import { supabase } from "@/lib/supabase";
export async function POST(req: NextRequest) {
  try {
    guard(req);
    const input = pollVoteSchema.safeParse(await boundedJson(req));
    if (!input.success) throw new HttpError(400, "Scegli una risposta valida.");
    const voter = pollVoter(
      req.cookies.get(POLL_COOKIE)?.value,
      input.data.poll_id,
    );
    if (!voter)
      throw new HttpError(
        409,
        "Abilita i cookie e ricarica il sondaggio prima di votare.",
      );
    await rateLimit(req, "poll-vote", 30);
    const { data, error } = await supabase().rpc("vote_poll", {
      p_poll: input.data.poll_id,
      p_option: input.data.option_id,
      p_voter: voter,
    });
    pollError(error);
    return NextResponse.json(data, { status: 201, headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}

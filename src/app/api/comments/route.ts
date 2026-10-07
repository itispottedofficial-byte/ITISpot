import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { commentsClient, commentError } from "@/lib/comments";
import { commentSchema } from "@/lib/comment-validation";
import {
  boundedJson,
  failure,
  guard,
  HttpError,
  privateHeaders,
} from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    const input = z
      .object({
        spot_id: z.string().uuid(),
        page: z.coerce.number().int().min(1).max(5001).default(1),
      })
      .strict()
      .safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!input.success) throw new HttpError(400, "Richiesta non valida.");
    const { client, authenticated } = await commentsClient();
    const { data, error } = await client.rpc("list_comments", {
      p_spot: input.data.spot_id,
      p_offset: (input.data.page - 1) * 20,
    });
    commentError(error);
    return NextResponse.json(
      { ...data, authenticated },
      { headers: privateHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    guard(req);
    const { client } = await commentsClient(true);
    const input = commentSchema.safeParse(await boundedJson(req));
    if (!input.success)
      throw new HttpError(
        400,
        input.error.issues[0]?.message || "Commento non valido.",
      );
    const { error } = await client.rpc("create_comment", {
      p_spot: input.data.spot_id,
      p_content: input.data.content,
    });
    commentError(error);
    return NextResponse.json(
      { ok: true },
      { status: 201, headers: privateHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}

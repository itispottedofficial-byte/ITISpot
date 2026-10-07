import { NextRequest, NextResponse } from "next/server";
import { commentsClient, commentError } from "@/lib/comments";
import { reportSchema } from "@/lib/comment-validation";
import { idSchema } from "@/lib/validation";
import {
  boundedJson,
  failure,
  guard,
  HttpError,
  privateHeaders,
} from "@/lib/http";
type Context = { params: Promise<{ id: string }> };
export async function DELETE(req: NextRequest, context: Context) {
  try {
    guard(req);
    const { client } = await commentsClient(true);
    const { id } = await context.params;
    if (!idSchema.safeParse(id).success)
      throw new HttpError(400, "Commento non valido.");
    const { data, error } = await client.rpc("delete_own_comment", {
      p_comment: id,
    });
    commentError(error);
    if (!data)
      throw new HttpError(404, "Commento non trovato o non eliminabile.");
    return NextResponse.json({ ok: true }, { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest, context: Context) {
  try {
    guard(req);
    const { client } = await commentsClient(true);
    const { id } = await context.params;
    if (!idSchema.safeParse(id).success)
      throw new HttpError(400, "Commento non valido.");
    const input = reportSchema.safeParse(await boundedJson(req));
    if (!input.success)
      throw new HttpError(400, "Scrivi un motivo da 3 a 300 caratteri.");
    const { data, error } = await client.rpc("report_comment", {
      p_comment: id,
      p_reason: input.data.reason,
    });
    commentError(error, 600);
    return NextResponse.json(
      {
        ok: true,
        message: data
          ? "Segnalazione inviata al team."
          : "Hai già segnalato questo commento.",
      },
      { headers: privateHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}

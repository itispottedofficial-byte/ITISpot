import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/security";
import { supabase } from "@/lib/supabase";
import { commentError } from "@/lib/comments";
import { commentModerationSchema } from "@/lib/comment-validation";
import {
  boundedJson,
  failure,
  guard,
  HttpError,
  privateHeaders,
} from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const input = z
      .object({
        filter: z.enum(["reported", "hidden", "all"]).default("reported"),
        page: z.coerce.number().int().min(1).max(5001).default(1),
      })
      .strict()
      .safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!input.success) throw new HttpError(400, "Filtro non valido.");
    const { data, error } = await supabase().rpc("admin_comments_page", {
      p_filter: input.data.filter,
      p_offset: (input.data.page - 1) * 20,
    });
    commentError(error);
    return NextResponse.json(data, { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(req: NextRequest) {
  try {
    guard(req);
    await requireAdmin(req);
    const input = commentModerationSchema.safeParse(await boundedJson(req));
    if (!input.success) throw new HttpError(400, "Azione non valida.");
    const { data, error } = await supabase().rpc("moderate_comment", {
      p_comment: input.data.id,
      p_action: input.data.action,
    });
    commentError(error);
    if (!data) throw new HttpError(404, "Commento non trovato.");
    return NextResponse.json({ ok: true }, { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}

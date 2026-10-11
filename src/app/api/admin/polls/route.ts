import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  guard,
  failure,
  privateHeaders,
  boundedJson,
  HttpError,
} from "@/lib/http";
import { pollActionSchema } from "@/lib/poll-validation";
import { pollError, pollsPage } from "@/lib/polls";
import { requireAdmin } from "@/lib/security";
import { supabase } from "@/lib/supabase";
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const input = z
      .object({ page: z.coerce.number().int().min(1).max(8334).default(1) })
      .strict()
      .safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!input.success) throw new HttpError(400, "Pagina non valida.");
    return NextResponse.json(await pollsPage(true, input.data.page), {
      headers: privateHeaders,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    guard(req);
    await requireAdmin(req);
    const input = pollActionSchema.safeParse(await boundedJson(req, 8192));
    if (!input.success)
      throw new HttpError(
        400,
        "Inserisci domanda, da 2 a 6 opzioni diverse e una data valida.",
      );
    const v = input.data;
    const { data, error } = await supabase().rpc("admin_poll", {
      p_id: v.id || null,
      p_action: v.action,
      p_question: v.action === "save" ? v.question : null,
      p_options: v.action === "save" ? v.options : null,
      p_closes_at: v.action === "save" ? v.closes_at : null,
    });
    pollError(error);
    return NextResponse.json(
      { ok: true, id: data },
      { headers: privateHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}

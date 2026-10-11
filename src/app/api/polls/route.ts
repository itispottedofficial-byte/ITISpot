import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { failure, privateHeaders, HttpError } from "@/lib/http";
import { pollsPage } from "@/lib/polls";
export async function GET(req: NextRequest) {
  try {
    const p = z
      .object({ page: z.coerce.number().int().min(1).max(8334).default(1) })
      .strict()
      .safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!p.success) throw new HttpError(400, "Pagina non valida.");
    return NextResponse.json(await pollsPage(false, p.data.page), {
      headers: privateHeaders,
    });
  } catch (e) {
    return failure(e);
  }
}

import { z } from "zod";
import { HttpError } from "@/lib/http";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { listSpots } from "@/lib/repository";
import { failure, privateHeaders } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const query = z
      .object({
        filter: z
          .enum(["pending", "approved", "rejected", "archived", "all"])
          .default("all"),
        search: z.string().trim().max(500).default(""),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!query.success)
      throw new HttpError(400, "Filtri di ricerca non validi.");
    const result = await listSpots(
      query.data.filter,
      query.data.search,
      query.data.page,
    );
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}

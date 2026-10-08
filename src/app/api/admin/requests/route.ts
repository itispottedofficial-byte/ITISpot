import { NextRequest, NextResponse } from "next/server";
import { failure, HttpError, privateHeaders } from "@/lib/http";
import { requestFilterSchema } from "@/lib/request-validation";
import { listRequests } from "@/lib/requests";
import { requireAdmin } from "@/lib/security";
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const input = requestFilterSchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!input.success) throw new HttpError(400, "Filtro non valido.");
    return NextResponse.json(
      await listRequests(input.data.filter, input.data.page),
      { headers: privateHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}

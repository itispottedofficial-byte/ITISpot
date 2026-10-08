import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  boundedJson,
  failure,
  guard,
  HttpError,
  privateHeaders,
} from "@/lib/http";
import { requestUpdateSchema } from "@/lib/request-validation";
import { deleteRequest, updateRequest } from "@/lib/requests";
import { requireAdmin } from "@/lib/security";
type Context = { params: Promise<{ id: string }> };
async function target(req: NextRequest, context: Context) {
  guard(req);
  await requireAdmin(req);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(400, "Richiesta non valida.");
  return id;
}
export async function PATCH(req: NextRequest, context: Context) {
  try {
    const id = await target(req, context);
    const input = requestUpdateSchema.safeParse(await boundedJson(req, 16384));
    if (!input.success)
      throw new HttpError(
        400,
        "Controlla lo stato e la nota interna (massimo 2000 caratteri).",
      );
    await updateRequest(id, input.data);
    return NextResponse.json({ ok: true }, { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: NextRequest, context: Context) {
  try {
    await deleteRequest(await target(req, context));
    return NextResponse.json({ ok: true }, { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}

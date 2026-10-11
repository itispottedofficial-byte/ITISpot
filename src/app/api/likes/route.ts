import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  boundedJson,
  failure,
  guard,
  HttpError,
  privateHeaders,
} from "@/lib/http";
import { setLike } from "@/lib/likes";
export async function POST(req: NextRequest) {
  try {
    guard(req);
    const parsed = z
      .object({ spot_id: z.uuid(), liked: z.boolean() })
      .strict()
      .safeParse(await boundedJson(req));
    if (!parsed.success) throw new HttpError(400, "Richiesta non valida.");
    return NextResponse.json(
      await setLike(parsed.data.spot_id, parsed.data.liked),
      { headers: privateHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}

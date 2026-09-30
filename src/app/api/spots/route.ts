import { NextRequest, NextResponse } from "next/server";
import { submissionSchema } from "@/lib/validation";
import { createSpot } from "@/lib/repository";
import { sanitizeImage } from "@/lib/images";
import {
  guard,
  boundedForm,
  failure,
  HttpError,
  privateHeaders,
} from "@/lib/http";
import { rateLimit, verifyTurnstile } from "@/lib/security";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    guard(req);
    await rateLimit(req);
    const form = await boundedForm(req);
    for (const key of ["text", "consent", "website", "image", "turnstile"])
      if (form.getAll(key).length > 1)
        throw new HttpError(400, "Invio duplicato o non valido.");
    const result = submissionSchema.safeParse({
      text: form.get("text"),
      consent: form.get("consent"),
      website: form.get("website") || "",
    });
    if (!result.success)
      throw new HttpError(400, result.error.issues[0].message);
    await verifyTurnstile(String(form.get("turnstile") || ""));
    const file = form.get("image");
    let image: Buffer | undefined;
    if (file !== null) {
      if (!(file instanceof File))
        throw new HttpError(400, "Allegato non valido.");
      image = await sanitizeImage(file);
    }
    const spot = await createSpot(result.data.text, image);
    return NextResponse.json(
      { id: spot.id, status: spot.status },
      { status: 201, headers: privateHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}

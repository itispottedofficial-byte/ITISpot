import { NextRequest, NextResponse } from "next/server";
import {
  boundedJson,
  failure,
  guard,
  HttpError,
  privateHeaders,
} from "@/lib/http";
import { requestSubmissionSchema } from "@/lib/request-validation";
import { createRequest } from "@/lib/requests";
import { rateLimit, verifyTurnstile } from "@/lib/security";
// No public GET, row lookup or account association.
export async function POST(req: NextRequest) {
  try {
    guard(req);
    await rateLimit(req, "requests", 3);
    const input = requestSubmissionSchema.safeParse(
      await boundedJson(req, 16384),
    );
    if (!input.success)
      throw new HttpError(
        400,
        "Controlla la categoria e scrivi un messaggio da 5 a 1000 caratteri, senza campi aggiuntivi.",
      );
    await verifyTurnstile(input.data.turnstile, "request-submit");
    await createRequest(input.data.category, input.data.content);
    return NextResponse.json(
      { ok: true },
      { status: 201, headers: privateHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}

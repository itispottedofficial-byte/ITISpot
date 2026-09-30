import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { assertConfigured, ConfigurationError } from "./config";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export const privateHeaders = { "Cache-Control": "private, no-store" };
export function guard(req: NextRequest) {
  assertConfigured();
  const expected = new URL(process.env.APP_ORIGIN || req.nextUrl.origin).origin;
  if (
    req.headers.get("origin") !== expected ||
    req.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new HttpError(
      403,
      "Richiesta non autorizzata. Apri ITISpot dal suo indirizzo ufficiale.",
    );
}
async function boundedBody(req: NextRequest, max: number): Promise<Uint8Array> {
  if (Number(req.headers.get("content-length") || 0) > max)
    throw new HttpError(413, "La richiesta supera il limite consentito.");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Richiesta vuota.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel();
        throw new HttpError(413, "La richiesta supera il limite consentito.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Uint8Array(Buffer.concat(chunks));
}
export async function boundedForm(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data;"))
    throw new HttpError(415, "Formato di invio non valido.");
  const body = await boundedBody(req, 10 * 1024 * 1024 + 64 * 1024);
  try {
    return await new Response(body as BodyInit, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new HttpError(400, "Invio non valido. Riprova.");
  }
}
export async function boundedJson(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "Formato di richiesta non valido.");
  const body = await boundedBody(req, 4096);
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new HttpError(400, "Richiesta non valida.");
  }
}
export function failure(e: unknown) {
  if (e instanceof HttpError)
    return NextResponse.json(
      { error: e.message },
      {
        status: e.status,
        headers: {
          ...privateHeaders,
          ...(e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {}),
        },
      },
    );
  if (e instanceof ConfigurationError) {
    console.error("ITISpot configuration missing:", e.fields.join(", "));
    return NextResponse.json(
      {
        error:
          "ITISpot è in preparazione. Gli invii saranno disponibili a breve.",
      },
      { status: 503, headers: privateHeaders },
    );
  }
  console.error(
    "ITISpot request failed:",
    e instanceof Error ? e.name : "ProviderError",
  );
  return NextResponse.json(
    { error: "Servizio momentaneamente non disponibile. Riprova tra poco." },
    { status: 503, headers: privateHeaders },
  );
}

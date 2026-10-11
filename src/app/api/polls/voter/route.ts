import { NextRequest, NextResponse } from "next/server";
import { guard, failure, privateHeaders } from "@/lib/http";
import { ensureVoter } from "@/lib/poll-voter";
export async function POST(req: NextRequest) {
  try {
    guard(req);
    const response = NextResponse.json(
      { ok: true },
      { headers: privateHeaders },
    );
    ensureVoter(req, response);
    return response;
  } catch (e) {
    return failure(e);
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  guard,
  failure,
  HttpError,
  privateHeaders,
  boundedJson,
} from "@/lib/http";
import { mode, adminIds } from "@/lib/config";
import {
  demoSession,
  setSession,
  requireAdmin,
  rateLimit,
  verifyTurnstile,
} from "@/lib/security";
import { supabase } from "@/lib/supabase";
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return NextResponse.json(
      { authenticated: true, mode: mode() },
      { headers: privateHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    guard(req);
    await rateLimit(req, "login", 10);
    let token: string;
    if (mode() === "demo") token = demoSession();
    else {
      const body = await boundedJson(req);
      if (!body || typeof body !== "object")
        throw new HttpError(400, "Credenziali non valide.");
      const { email, password, turnstile } = body;
      await verifyTurnstile(
        typeof turnstile === "string" ? turnstile : "",
        "admin-login",
      );
      if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        email.length > 254 ||
        password.length > 256
      )
        throw new HttpError(400, "Credenziali non valide.");
      const { data, error } = await supabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.user || !adminIds().includes(data.user.id))
        throw new HttpError(
          401,
          "Credenziali non valide o accesso non autorizzato.",
        );
      token = data.session!.access_token;
    }
    const response = NextResponse.json(
      { ok: true },
      { headers: privateHeaders },
    );
    setSession(response, token);
    return response;
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: NextRequest) {
  try {
    guard(req);
    const token = req.cookies.get("itispot_session")?.value;
    if (mode() === "supabase" && token) {
      const { error } = await supabase().auth.admin.signOut(token, "local");
      if (error && error.status !== 401 && error.status !== 403) throw error;
    }
    const r = NextResponse.json({ ok: true }, { headers: privateHeaders });
    setSession(r, "", 0);
    return r;
  } catch (e) {
    return failure(e);
  }
}

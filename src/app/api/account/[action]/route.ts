import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accountConfigured } from "@/lib/account-client";
import { serverAccountClient, authError } from "@/lib/account";
import {
  boundedJson,
  failure,
  guard,
  HttpError,
  privateHeaders,
} from "@/lib/http";
import { rateLimit } from "@/lib/security";
import {
  signupSchema,
  loginSchema,
  forgotSchema,
  resetSchema,
  profileSchema,
} from "@/lib/account-validation";

const confirmation = z
  .object({
    token_hash: z.string().regex(/^[a-zA-Z0-9_-]{20,256}$/),
    type: z.enum(["signup", "recovery"]),
  })
  .strict();
const message =
  "Se l’indirizzo può ricevere questa richiesta, troverai un’email con il prossimo passaggio. Controlla anche lo spam; se hai già un account, puoi accedere o recuperare la password.";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action: string }> },
) {
  try {
    guard(request);
    if (!accountConfigured())
      throw new HttpError(
        503,
        "Gli account sono in preparazione. Puoi continuare a usare ITISpot senza registrarti.",
      );
    const { action } = await context.params;
    if (
      ![
        "signup",
        "login",
        "logout",
        "forgot",
        "resend",
        "reset",
        "profile",
        "confirm",
      ].includes(action)
    )
      throw new HttpError(404, "Operazione non disponibile.");
    await rateLimit(
      request,
      `account-${action}`,
      ["forgot", "resend"].includes(action) ? 3 : action === "signup" ? 5 : 10,
    );
    const body = await boundedJson(request);
    const client = await serverAccountClient();
    const origin = new URL(process.env.APP_ORIGIN!).origin;
    let result: Record<string, unknown> = { ok: true };
    if (action === "signup") {
      const input = signupSchema.parse(body);
      const username = input.username.toLowerCase();
      const existing = await client
        .from("profiles")
        .select("username")
        .eq("username", username)
        .maybeSingle();
      if (existing.error)
        throw new HttpError(
          503,
          "Le registrazioni sono in preparazione. Riprova tra poco.",
        );
      if (existing.data)
        throw new HttpError(409, "Questo username è già in uso.");
      const { error } = await client.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: { username },
          emailRedirectTo: `${origin}/auth/confirm`,
        },
      });
      authError(
        error,
        "Registrazione non riuscita. Controlla i dati o prova un altro username.",
      );
      result = { ok: true, message };
    } else if (action === "login") {
      const input = loginSchema.parse(body);
      const { data, error } = await client.auth.signInWithPassword(input);
      authError(error);
      if (!data.user?.email_confirmed_at)
        throw new HttpError(401, "Conferma la tua email prima di accedere.");
      result = { ok: true, redirect: "/profilo" };
    } else if (action === "resend") {
      const input = forgotSchema.parse(body);
      const { error } = await client.auth.resend({
        type: "signup",
        email: input.email,
        options: { emailRedirectTo: `${origin}/auth/confirm` },
      });
      if (
        error &&
        (!error.status || error.status >= 500 || error.status === 429)
      )
        authError(error);
      result = { ok: true, message };
    } else if (action === "forgot") {
      const input = forgotSchema.parse(body);
      const { error } = await client.auth.resetPasswordForEmail(input.email, {
        redirectTo: `${origin}/auth/confirm`,
      });
      // Identical response for unknown and existing emails; infrastructure failures remain explicit.
      if (
        error &&
        (!error.status || error.status >= 500 || error.status === 429)
      )
        authError(error);
      result = { ok: true, message };
    } else if (action === "confirm") {
      const input = confirmation.parse(body);
      const { error } = await client.auth.verifyOtp(input);
      authError(
        error,
        "Il link è scaduto o è già stato usato. Richiedi una nuova email.",
      );
      result = {
        ok: true,
        redirect: input.type === "recovery" ? "/reset-password" : "/profilo",
      };
    } else if (action === "logout") {
      const { error } = await client.auth.signOut({ scope: "local" });
      authError(error, "Non è stato possibile uscire. Riprova.");
      result = { ok: true, redirect: "/login" };
    } else {
      const { data, error } = await client.auth.getUser();
      if (
        error &&
        (!error.status || error.status >= 500 || error.status === 429)
      )
        authError(error);
      if (error || !data.user?.email_confirmed_at)
        throw new HttpError(401, "Accedi per gestire il tuo profilo.");
      if (action === "profile") {
        const input = profileSchema.parse(body);
        const { data: updated, error: updateError } = await client
          .from("profiles")
          .update({ username: input.username.toLowerCase() })
          .eq("id", data.user.id)
          .select("username")
          .single();
        if (updateError?.code === "23505")
          throw new HttpError(409, "Questo username è già in uso.");
        if (updateError || !updated)
          throw new HttpError(
            503,
            "Non è stato possibile aggiornare il profilo.",
          );
        result = {
          ok: true,
          message: "Username aggiornato.",
          username: updated.username,
        };
      } else {
        const input = resetSchema.parse(body);
        const { error: updateError } = await client.auth.updateUser({
          password: input.password,
        });
        authError(
          updateError,
          "Password non valida o uguale a quella precedente.",
        );
        result = {
          ok: true,
          message: "Password aggiornata. Puoi tornare al tuo profilo.",
          redirect: "/profilo",
        };
      }
    }
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message || "Controlla i dati inseriti." },
        { status: 400, headers: privateHeaders },
      );
    return failure(error);
  }
}

import { z } from "zod";

const reserved = [
  "admin",
  "administrator",
  "moderator",
  "mod",
  "itispot",
  "official",
  "support",
  "system",
  "root",
];
export function reservedUsername(value: string) {
  if (
    value
      .split(/[._]/)
      .some((part) =>
        reserved.includes(part.toLowerCase().replace(/[0-9]/g, "")),
      )
  )
    return true;
  const compact = value.toLowerCase().replace(/[._]/g, "");
  const letters = compact.replace(/[0-9]/g, "");
  const leet = compact
    .replace(
      /[013457]/g,
      (c) =>
        ({ "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t" })[c]!,
    )
    .replace(/[0-9]/g, "");
  return reserved.some(
    (name) => letters === name || leet === name || compact === name,
  );
}
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Usa almeno 3 caratteri.")
  .max(20, "Usa al massimo 20 caratteri.")
  .regex(/^[A-Za-z0-9._]+$/, "Usa solo lettere, numeri, punto e underscore.")
  .refine((value) => !reservedUsername(value), "Questo username è riservato.");
export const passwordSchema = z
  .string()
  .min(10, "Usa almeno 10 caratteri per la password.")
  .max(128, "La password è troppo lunga.");
const email = z
  .email("Inserisci un’email valida.")
  .max(254)
  .transform((v) => v.trim());
export const signupSchema = z
  .object({
    username: usernameSchema,
    email,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .strict()
  .refine((v) => v.password === v.confirmPassword, {
    message: "Le password non coincidono.",
    path: ["confirmPassword"],
  });
export const loginSchema = z
  .object({ email, password: z.string().min(1).max(256) })
  .strict();
export const forgotSchema = z.object({ email }).strict();
export const resetSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .strict()
  .refine((v) => v.password === v.confirmPassword, {
    message: "Le password non coincidono.",
    path: ["confirmPassword"],
  });
export const profileSchema = z.object({ username: usernameSchema }).strict();

export type AccountProfile = {
  username: string;
  avatar_key: string | null;
  created_at: string;
};

import { z } from "zod";
export const REQUEST_CATEGORIES = {
  SUGGESTION: "Suggerimento",
  FEATURE_REQUEST: "Richiesta funzione",
  BUG: "Problema / Bug",
  REPORT: "Segnalazione",
  OTHER: "Altro",
} as const;
export const REQUEST_STATUSES = {
  NEW: "Nuove",
  REVIEWING: "In esame",
  ACCEPTED: "Accettate",
  REJECTED: "Rifiutate",
  COMPLETED: "Completate",
} as const;
export const categorySchema = z.enum(
  Object.keys(REQUEST_CATEGORIES) as [
    keyof typeof REQUEST_CATEGORIES,
    ...(keyof typeof REQUEST_CATEGORIES)[],
  ],
);
export const requestStatusSchema = z.enum(
  Object.keys(REQUEST_STATUSES) as [
    keyof typeof REQUEST_STATUSES,
    ...(keyof typeof REQUEST_STATUSES)[],
  ],
);
const plainText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .refine(
      (v) => Array.from(v).length >= min && Array.from(v).length <= max,
      `Scrivi da ${min} a ${max} caratteri.`,
    )
    .refine(
      // Control characters are rejected intentionally; normal Unicode is preserved.
      // eslint-disable-next-line no-control-regex
      (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),
      "Il testo contiene caratteri non validi.",
    );
export const requestSubmissionSchema = z
  .object({
    category: categorySchema,
    content: plainText(5, 1000),
    turnstile: z.string().max(2048).default(""),
  })
  .strict();
export const requestUpdateSchema = z
  .object({
    status: requestStatusSchema.optional(),
    admin_note: plainText(0, 2000).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Scegli una modifica.");
export const requestFilterSchema = z
  .object({
    filter: z.union([requestStatusSchema, z.literal("ALL")]).default("ALL"),
    page: z.coerce.number().int().min(1).max(5001).default(1),
  })
  .strict();
export type PrivateRequest = {
  id: string;
  category: keyof typeof REQUEST_CATEGORIES;
  content: string;
  status: keyof typeof REQUEST_STATUSES;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  admin_note: string | null;
};
export type RequestPage = { requests: PrivateRequest[]; total: number };

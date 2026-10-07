import { z } from "zod";
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .refine(
      (v) => Array.from(v).length >= min && Array.from(v).length <= max,
      `Scrivi da ${min} a ${max} caratteri.`,
    )
    .refine(
      (v) =>
        Array.from(v).every((char) => {
          const n = char.codePointAt(0)!;
          return (n >= 32 && n !== 127) || [9, 10, 13].includes(n);
        }),
      "Il testo contiene caratteri non validi.",
    );
export const commentSchema = z
  .object({ spot_id: z.string().uuid(), content: text(1, 500) })
  .strict();
export const reportSchema = z.object({ reason: text(3, 300) }).strict();
export const commentModerationSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum(["hide", "restore", "delete"]),
  })
  .strict();
export interface PublicComment {
  id: string;
  content: string;
  created_at: string;
  username: string;
  avatar_key: string | null;
  own: boolean;
}
export interface CommentPage {
  comments: PublicComment[];
  total: number;
  authenticated: boolean;
}
export interface ModeratedComment extends PublicComment {
  spot_id: string;
  status: "visible" | "hidden";
  reports: { reason: string; created_at: string }[];
  report_count: number;
}

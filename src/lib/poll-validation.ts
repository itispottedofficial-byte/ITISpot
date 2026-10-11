import { z } from "zod";
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
export const pollDraftSchema = z
  .object({
    id: z.uuid().optional(),
    action: z.literal("save"),
    question: text(5, 300),
    options: z.array(text(1, 150)).min(2).max(6),
    closes_at: z.iso.datetime({ offset: true }).nullable().default(null),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.options.map((s) => s.toLowerCase())).size === v.options.length,
    "Le opzioni devono essere diverse.",
  );
export const pollActionSchema = z.union([
  pollDraftSchema,
  z
    .object({
      id: z.uuid(),
      action: z.enum(["publish", "close", "feature", "delete"]),
    })
    .strict(),
]);
export const pollVoteSchema = z
  .object({ poll_id: z.uuid(), option_id: z.uuid() })
  .strict();
export interface Poll {
  id: string;
  question: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  featured: boolean;
  created_at: string;
  closes_at: string | null;
  voted: boolean;
  total: number;
  options: { id: string; label: string; votes: number }[];
}
export interface PollPage {
  polls: Poll[];
  total: number;
}
// Largest remainder method: displayed integer percentages sum to exactly 100.
export function pollPercentages(
  options: Poll["options"],
  total: number,
): number[] {
  if (total <= 0) return options.map(() => 0);
  const raw = options.map((o) => (100 * o.votes) / total),
    result = raw.map(Math.floor);
  const order = raw
    .map((v, i) => ({ i, rest: v - result[i] }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  const remaining = 100 - result.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remaining && i < order.length; i++) result[order[i].i]++;
  return result;
}

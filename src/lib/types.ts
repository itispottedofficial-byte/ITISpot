export type SpotStatus = "pending" | "approved" | "rejected";
export interface Spot {
  id: string;
  text: string;
  status: SpotStatus;
  image_path: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
}
export type Action = "approve" | "reject" | "archive" | "restore" | "delete";

export type SpotFilter = SpotStatus | "archived" | "all";
export interface SpotPage {
  spots: Spot[];
  total: number;
  counts: Record<SpotFilter, number>;
}

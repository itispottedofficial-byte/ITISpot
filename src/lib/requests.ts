import "server-only";
import { randomUUID } from "node:crypto";
import { mode } from "./config";
import { localTransaction } from "./local-store";
import { supabase } from "./supabase";
import { HttpError } from "./http";
import type { PrivateRequest, RequestPage } from "./request-validation";
const columns =
  "id,category,content,status,created_at,updated_at,reviewed_at,admin_note";
export async function createRequest(
  category: PrivateRequest["category"],
  content: string,
) {
  if (mode() === "demo") {
    await localTransaction((d) => {
      const now = new Date().toISOString();
      (d.requests ||= []).push({
        id: randomUUID(),
        category,
        content,
        status: "NEW",
        created_at: now,
        updated_at: now,
        reviewed_at: null,
        admin_note: null,
      });
    });
    return;
  }
  // Deliberately no account client, auth lookup, caller ID, or returned row.
  const { error } = await supabase()
    .from("requests")
    .insert({ category, content });
  if (error) throw error;
}
export async function listRequests(
  filter: PrivateRequest["status"] | "ALL",
  page: number,
): Promise<RequestPage> {
  const offset = (page - 1) * 20;
  if (mode() === "demo")
    return localTransaction((d) => {
      const rows = (d.requests || [])
        .filter((r) => filter === "ALL" || r.status === filter)
        .sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) ||
            b.id.localeCompare(a.id),
        );
      return { requests: rows.slice(offset, offset + 20), total: rows.length };
    });
  let query = supabase().from("requests").select(columns, { count: "exact" });
  if (filter !== "ALL") query = query.eq("status", filter);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + 19);
  if (error) throw error;
  return { requests: data as PrivateRequest[], total: count || 0 };
}
export async function updateRequest(
  id: string,
  patch: { status?: PrivateRequest["status"]; admin_note?: string | null },
) {
  if (mode() === "demo")
    return localTransaction((d) => {
      const row = d.requests?.find((r) => r.id === id);
      if (!row) throw new HttpError(404, "Richiesta non trovata.");
      const now = new Date().toISOString();
      if (patch.status !== undefined && patch.status !== row.status) {
        row.status = patch.status;
        row.reviewed_at = patch.status === "NEW" ? null : now;
      }
      if (patch.admin_note !== undefined)
        row.admin_note = patch.admin_note || null;
      row.updated_at = now;
    });
  const { data, error } = await supabase()
    .from("requests")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new HttpError(404, "Richiesta non trovata.");
}
export async function deleteRequest(id: string) {
  if (mode() === "demo")
    return localTransaction((d) => {
      if (!d.requests?.some((r) => r.id === id))
        throw new HttpError(404, "Richiesta non trovata.");
      d.requests = d.requests.filter((r) => r.id !== id);
    });
  const { data, error } = await supabase()
    .from("requests")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new HttpError(404, "Richiesta non trovata.");
}

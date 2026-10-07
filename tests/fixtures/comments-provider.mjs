import { commentsDatabase } from "./comments-database.mjs";
const db = await commentsDatabase();
let queue = Promise.resolve();
const calls = {
  list_comments: ["p_spot", "p_offset"],
  comment_counts: ["p_spots"],
  create_comment: ["p_spot", "p_content"],
  delete_own_comment: ["p_comment"],
  report_comment: ["p_comment", "p_reason"],
  admin_comments_page: ["p_filter", "p_offset"],
  moderate_comment: ["p_comment", "p_action"],
};
export function commentsRequest({ url, body, user, users, service, send }) {
  const job = queue
    .catch(() => {})
    .then(async () => {
      try {
        if (url.pathname === "/__test/comment-spot") {
          await db.query(
            "insert into spots(id,text) values($1,$2) on conflict(id) do nothing",
            [body.id, body.text || "Local comments fixture"],
          );
          await db.query(
            "update spots set status=$2,archived_at=case when $3::boolean then now() else null end where id=$1",
            [body.id, body.status || "approved", !!body.archived],
          );
          return send(200, { ok: true });
        }
        const fn = url.pathname.split("/").at(-1);
        if (!calls[fn]) return send(404, { code: "P0002" });
        for (const u of users.values()) {
          await db.query(
            "insert into auth.users(id,raw_user_meta_data) values($1,$2) on conflict(id) do nothing",
            [u.id, { username: u.username }],
          );
          await db.query("update profiles set username=$2 where id=$1", [
            u.id,
            u.username,
          ]);
        }
        const data = await db.transaction(async (tx) => {
          await tx.exec(
            `set local role ${service ? "service_role" : user ? "authenticated" : "anon"}`,
          );
          await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
            user?.id || "",
          ]);
          const keys = calls[fn];
          return (
            await tx.query(
              `select public.${fn}(${keys.map((_, i) => "$" + (i + 1)).join(",")}) as data`,
              keys.map((k) => body[k]),
            )
          ).rows[0].data;
        });
        return send(200, data);
      } catch (e) {
        return send(e.code === "42501" ? 403 : 400, {
          code: e.code || "fixture_error",
        });
      }
    });
  queue = job;
  return job;
}

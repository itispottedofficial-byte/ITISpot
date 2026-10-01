// Read-only provider preflight. Never submits Spots or contacts Turnstile/Images.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

async function main() {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ADMIN_USER_IDS",
  ];
  const missing = required.filter((name) => !process.env[name]?.trim());
  assert.equal(
    missing.length,
    0,
    `Configure in .env.local: ${missing.join(", ")}`,
  );
  const url = new URL(process.env.SUPABASE_URL);
  assert(
    url.protocol === "https:" && !url.username && !url.password,
    "Use the project's HTTPS URL.",
  );
  const adminIds = process.env.ADMIN_USER_IDS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  assert(
    adminIds.length > 0 && adminIds.every((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      ),
    ),
    "ADMIN_USER_IDS must contain Auth UUIDs.",
  );
  const db = createClient(url.origin, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.timeout(15000),
          cache: "no-store",
        }),
    },
  });
  const columns =
    "id,text,status,image_path,created_at,updated_at,archived_at,reviewed_at,rejection_reason";
  const rows = await db.from("spots").select(columns).limit(0);
  assert(
    !rows.error,
    "Spot schema unavailable; apply all migrations and check the server key.",
  );
  const limits = await db
    .from("rate_limits")
    .select("key,count,reset_at")
    .limit(0);
  assert(!limits.error, "Rate-limit table unavailable.");
  const queue = await db.rpc("list_spots_page", {
    p_filter: "pending",
    p_search: crypto.randomUUID(),
    p_offset: 0,
    p_limit: 1,
  });
  assert(
    !queue.error && Array.isArray(queue.data?.spots),
    "Moderation RPC unavailable.",
  );
  // Do not print rows, counts, admin emails, key values or raw provider errors.
  console.log("OK: schema and moderation RPC accessible to backend.");
  const bucket = await db.storage.getBucket("spot-images");
  assert(
    !bucket.error && bucket.data,
    "Private spot-images bucket unavailable.",
  );
  assert.equal(bucket.data.public, false, "spot-images must be private.");
  assert.equal(
    Number(bucket.data.file_size_limit),
    10485760,
    "Expected 10 MiB limit.",
  );
  assert.deepEqual(
    bucket.data.allowed_mime_types,
    ["image/webp"],
    "Only sanitized WebP belongs in Storage.",
  );
  console.log("OK: private bucket, MIME restriction and size limit.");
  for (const id of adminIds) {
    const user = await db.auth.admin.getUserById(id);
    assert(
      !user.error && user.data.user?.email_confirmed_at,
      "An allowlisted Auth user is missing or has no confirmed email.",
    );
  }
  console.log(
    "OK: allowlisted Auth users exist and their emails are confirmed.",
  );
  console.log(
    "No data written. Still run verify.sql for RLS. Public submission remains blocked until Turnstile is configured in a later step.",
  );
}

main().catch((error) => {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "Supabase check failed: verify network, project availability and configuration. No credentials logged.",
  );
  process.exitCode = 1;
});

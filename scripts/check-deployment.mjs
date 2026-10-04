import assert from "node:assert/strict";

// Read-only routing checks plus an intentionally invalid submission. Never creates a Spot.
const origin = new URL(process.argv[2] || "http://127.0.0.1:3188").origin;
async function check(path, statuses, options) {
  const response = await fetch(origin + path, {
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    ...options,
  });
  const bytes = await response.arrayBuffer();
  const body = new TextDecoder().decode(bytes);
  assert(
    statuses.includes(response.status),
    `${path}: unexpected HTTP ${response.status}`,
  );
  assert(!body.includes("error code: 1042"), `${path}: Cloudflare 1042`);
  console.log(`${options?.method || "GET"} ${path}: ${response.status}`);
  return { response, body, bytes };
}
for (const path of ["/", "/novita", "/invia", "/admin", "/privacy"]) {
  const { response, body } = await check(path, [200]);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(body, /ITISpot/);
}
for (const path of [
  "/itispot-chrome.png",
  "/y2k-background.png",
  "/favicon.svg",
]) {
  const { response, bytes } = await check(path, [200]);
  assert.match(response.headers.get("content-type") || "", /^image\//);
  assert(bytes.byteLength > 100);
}
for (const path of [
  "/api/admin/session",
  "/api/admin/spots",
  "/api/admin/images/00000000-0000-4000-8000-000000000000",
]) {
  const { response, body } = await check(path, [401, 503]);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.equal(typeof JSON.parse(body).error, "string");
}
const { body } = await check("/api/spots", [400, 403, 415, 429, 503], {
  method: "POST",
  headers: { Origin: origin },
});
assert.equal(typeof JSON.parse(body).error, "string");
console.log(
  "Routing, assets and protected API checks passed; no Spot submitted.",
);

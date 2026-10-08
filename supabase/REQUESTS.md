# Richieste V1

Private inbox at `/richieste`, linked from the portal sidebar. No public request listing, detail URL, receipt UUID or account association. Only the current admin allowlist/session authorizes `/api/admin/requests`.

## Manual rollout (no automatic migration/deploy)

1. In the existing Supabase project SQL Editor, execute **supabase/migrations/20261008000100_requests.sql**, after existing Spot/account/comment migrations.
2. Execute **supabase/verify.sql**. The new final result must be `ITISpot requests, grants, RLS and metadata checks passed`.
3. Perform a separate authorized remote integration check before deployment: anonymous and logged-in submission, private access with both client roles, admin list/status/note/delete, Turnstile and rate limit. Remove only test records.

No new environment variables, bucket, Auth setting or Turnstile widget. Existing runtime Supabase service key, admin allowlist, origin, rate secret/trusted IP and Turnstile configuration apply. Keep secrets server-only. Do not run the schema bootstrap on a different project by mistake.

## Model and security

`requests`: random UUID, stable category (`SUGGESTION`, `FEATURE_REQUEST`, `BUG`, `REPORT`, `OTHER`), plain text content (5–1000 Unicode code points), status (`NEW`, `REVIEWING`, `ACCEPTED`, `REJECTED`, `COMPLETED`), created/updated/reviewed timestamps, private admin note (max 2000 code points). No author, email, IP, user agent, fingerprint, or Spot/profile foreign key.

Public `POST /api/requests` accepts only `category`, `content`, `turnstile`. Strict schema rejects unknown fields, including any identity, status, notes, timestamps or IDs. Success returns only `{ok:true}`. The required respectful-content checkbox is a UI acknowledgement, not stored personal data or a security boundary. React renders content as plain text, never HTML. Request body is capped at 16 KiB (Unicode + Turnstile); no attachments.

Same origin is required. The existing HMAC-based limiter uses **requests** scope, **3 attempts / 600 seconds**, regardless of login. Invalid attempts also consume the limit, before external verification. No new IP collection: the hashed limiter key exists only in the existing quota store, not in the request record. Turnstile uses the existing component and strict hostname verifier with action **request-submit**; Spot/admin actions remain unchanged. Public submission never reads account auth/cookies. The existing production verifier is reused unchanged; only its accepted action type includes request-submit. Local test-mode changes are not part of this release.

RLS enabled, no client table or column grants; a restrictive false policy prevents client access even if permissive policies/grants are accidentally added. No request RPC exposed. Service role has SELECT/DELETE, INSERT(category,content), UPDATE(status,admin_note) only. Metadata trigger uses invoker rights and empty search_path, always initializes NEW, timestamps and empty note, preserves immutable content/category/id/creation date. A status change sets reviewed_at; return to NEW clears it; note-only edits preserve it.

Admin filters and pagination return 20 rows, newest first; internal note and management IDs travel only through private no-store admin responses. Updates do not replace unrelated fields. Delete requires explicit confirmation in the UI. Requests are retained until admin deletion; do not promise absolute anonymity. There is no personal request history, reply or notification flow.

## Local verification

Demo requests share the existing private local transaction store (`requests` optional array for backward compatibility). Never usable in production demo mode. PostgreSQL RLS/grants/constraints/triggers are exercised in isolated PGlite, plus actual route handlers and Playwright application workflows. These checks are local evidence, not a claim that the new migration has been installed remotely. Real provider email/account/Spot state is not changed.

## Files for this step

New:
- src/app/richieste/page.tsx
- src/app/api/requests/route.ts
- src/app/api/admin/requests/route.ts
- src/app/api/admin/requests/[id]/route.ts
- src/components/RequestForm.tsx
- src/components/AdminRequests.tsx
- src/lib/request-validation.ts
- src/lib/requests.ts
- supabase/migrations/20261008000100_requests.sql
- supabase/REQUESTS.md
- tests/requests-api.test.ts
- tests/requests-database.test.ts
- tests/requests-provider.test.ts
- tests/requests.e2e.ts

Updated:
- src/app/globals.css (scoped request styles and responsive navigation link)
- src/app/privacy/page.tsx (private requests disclosure)
- src/components/PortalShell.tsx (navigation link)
- src/components/AdminDashboard.tsx (mount private requests panel only)
- src/components/Turnstile.tsx (allow request-submit action type)
- src/lib/security.ts (allow request-submit action type)
- src/lib/http.ts (optional boundedJson cap; all existing callers keep 4096 bytes)
- src/lib/local-store.ts (optional requests collection; existing demo state preserved)
- src/proxy.ts (include /richieste in existing account-shell refresh matcher)
- supabase/schema.sql (generated from migrations)
- supabase/verify.sql (append Requests read-only audit)
- tests/workflow.e2e.ts (scope the original Spot layout check to exclude the new panel)

Pre-existing uncommitted Turnstile test-mode/config/docs changes were preserved; they are not new Requests functionality. No commit, deploy, or remote SQL operation was performed.

## Local acceptance evidence

Lint/typecheck: passed. Vitest: 186 tests passed (42 new Requests tests). Playwright: 12 tests passed, including one new Requests workflow and existing Spot/account/comments/Home regressions. Next.js build, OpenNext build and schema synchronization check passed. Requests form/admin checked at 375/768/1440px without horizontal overflow. Screenshots are outside the repository in `../itispot-requests-preview/`.

Turnstile action/hostname/missing/invalid/reused-token cases use controlled provider responses; actual production provider + Requests-table integration still requires the manual migration and subsequent authorized remote QA. RLS and grants ran against a real isolated PostgreSQL engine (PGlite), not the remote project. The existing OpenNext experimental Node middleware warning remains non-blocking for builds; production Requests runtime is not claimed tested. Available local service secret and fixture markers were absent from compiled client assets.

## Release scope — 2026-10-08

The Requests-only release is validated separately from the uncommitted local Turnstile test-mode work. It contains 170 automatic tests and 12 browser tests; the additional 16 local Turnstile simulation tests are deliberately excluded together with their implementation. Remote Supabase migration and audit were applied manually and remote Requests flows were tested with the local app. Real production Turnstile acceptance is checked after deployment on the public domain, without dummy keys or verifier changes.

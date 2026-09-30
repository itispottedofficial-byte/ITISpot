import "server-only";
import { z } from "zod";
export class ConfigurationError extends Error {
  constructor(public fields: string[]) {
    super("ITISpot configuration incomplete");
  }
}
export function mode(): "demo" | "supabase" {
  const value =
    process.env.ITISPOT_MODE ||
    (process.env.NODE_ENV === "production" ? "supabase" : "demo");
  if (value !== "demo" && value !== "supabase")
    throw new ConfigurationError(["ITISPOT_MODE"]);
  return value;
}
export const adminIds = () =>
  (process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
export function turnstileSiteKey(): string {
  // Dynamic lookup reads the key at request time on Workers, not only at build time.
  const environment = process.env;
  return environment["NEXT_PUBLIC_TURNSTILE_SITE_KEY"] || "";
}
export function configurationIssues(): string[] {
  if (mode() === "demo")
    return process.env.NODE_ENV === "production" ? ["ITISPOT_MODE"] : [];
  const issues: string[] = [];
  for (const key of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ADMIN_USER_IDS",
    "APP_ORIGIN",
    "RATE_LIMIT_SECRET",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
    "TURNSTILE_HOSTNAME",
    "TRUSTED_IP_HEADER",
  ]) {
    if (!process.env[key]?.trim()) issues.push(key);
  }
  if (
    !adminIds().length ||
    adminIds().some((id) => !z.uuid().safeParse(id).success)
  )
    issues.push("ADMIN_USER_IDS");
  if ((process.env.RATE_LIMIT_SECRET || "").length < 32)
    issues.push("RATE_LIMIT_SECRET");
  for (const key of ["APP_ORIGIN", "SUPABASE_URL"]) {
    try {
      const url = new URL(process.env[key]!);
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/"
      )
        issues.push(key);
      if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
        issues.push(key);
      if (!["http:", "https:"].includes(url.protocol)) issues.push(key);
    } catch {
      issues.push(key);
    }
  }
  try {
    if (
      new URL(process.env.APP_ORIGIN!).hostname !==
      process.env.TURNSTILE_HOSTNAME
    )
      issues.push("TURNSTILE_HOSTNAME");
  } catch {
    /* handled above */
  }
  return [...new Set(issues)];
}
export function assertConfigured() {
  const issues = configurationIssues();
  if (issues.length) throw new ConfigurationError(issues);
}

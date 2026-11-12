import { createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "sh_admin";

export function adminToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  return pw ? createHash("sha256").update("stack.here:" + pw).digest("hex") : null;
}

export function passwordMatches(input: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(pw).digest();
  return timingSafeEqual(a, b);
}

/** "open": no password set in dev. "ok": signed in. "login": needs password. "disabled": production without a password. */
export function adminState(cookieValue: string | undefined): "open" | "ok" | "login" | "disabled" {
  const token = adminToken();
  if (!token) return process.env.NODE_ENV === "production" ? "disabled" : "open";
  return cookieValue === token ? "ok" : "login";
}

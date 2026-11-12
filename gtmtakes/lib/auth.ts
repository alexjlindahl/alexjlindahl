import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "gt_admin";

const digest = (s: string) => createHash("sha256").update(s).digest();

export function adminConfigured(): boolean {
  return !!process.env.ADMIN_PASSWORD;
}

export function passwordMatches(input: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  return !!pw && timingSafeEqual(digest(input), digest(pw));
}

/** Cookie value: a hash derived from the password, so changing the password signs everyone out. */
export function adminToken(): string {
  return digest(`gtmtakes-admin:${process.env.ADMIN_PASSWORD ?? ""}`).toString("hex");
}

export async function isAdmin(): Promise<boolean> {
  if (!adminConfigured()) return false;
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  return !!c && timingSafeEqual(digest(c), digest(adminToken()));
}

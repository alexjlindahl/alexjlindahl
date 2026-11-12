import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminToken, passwordMatches } from "@/lib/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const ok = passwordMatches(String(form.get("password") ?? ""));
  const res = NextResponse.redirect(new URL(ok ? "/insights" : "/insights?error=1", req.url), 303);
  if (ok) {
    res.cookies.set(ADMIN_COOKIE, adminToken()!, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
  }
  return res;
}

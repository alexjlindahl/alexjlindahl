"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminToken, isAdmin, passwordMatches } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { TOPICS } from "@/lib/scoring";
import { autoSchedule, refreshPatterns, scheduleTake, tomorrow, unscheduleTake } from "@/lib/takes";

export async function login(form: FormData) {
  if (!passwordMatches(String(form.get("password") ?? ""))) redirect("/admin?error=1");
  (await cookies()).set(ADMIN_COOKIE, adminToken(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 7, path: "/" });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin");
}

async function guard() {
  if (!(await isAdmin())) redirect("/admin");
}

const id = (form: FormData) => {
  const n = Number(form.get("id"));
  if (!Number.isInteger(n)) throw new Error("bad id");
  return n;
};

/** Saves the edited statement/topic and sets the status given by the clicked button. */
export async function reviewTake(form: FormData) {
  await guard();
  const db = await getDb();
  const takeId = id(form);
  const statement = String(form.get("statement") ?? "").trim();
  const topic = String(form.get("topic") ?? "");
  const status = String(form.get("status") ?? "");
  if (statement && (TOPICS as readonly string[]).includes(topic)) {
    await db.run("UPDATE takes SET statement = ?, topic = ? WHERE id = ?", [statement, topic, takeId]);
  }
  if (["approved", "rejected", "candidate"].includes(status)) {
    // Scheduled takes keep their slot; un-approve by removing them from the lineup first.
    await db.run("UPDATE takes SET status = ? WHERE id = ? AND id NOT IN (SELECT take_id FROM daily_takes)", [status, takeId]);
  }
  revalidatePath("/admin");
}

export async function addToTomorrow(form: FormData) {
  await guard();
  await scheduleTake(tomorrow(), id(form));
  revalidatePath("/admin");
}

export async function removeFromTomorrow(form: FormData) {
  await guard();
  await unscheduleTake(tomorrow(), id(form));
  revalidatePath("/admin");
}

export async function autoFillTomorrow() {
  await guard();
  await refreshPatterns();
  await autoSchedule(tomorrow());
  revalidatePath("/admin");
}

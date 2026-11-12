import { redirect } from "next/navigation";
import { today } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default function Results() {
  redirect(`/results/${today()}`);
}

import { redirect } from "next/navigation";
import { homeForSession } from "@/lib/backend";

/** Reparte por rol: el operador a su panel, el usuario de un spa a su portal. */
export default async function Home() {
  redirect((await homeForSession()) ?? "/login");
}

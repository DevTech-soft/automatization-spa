import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/backend";

/**
 * Para las páginas de plata del portal: el equipo vuelve a la portada en vez de
 * ver el 403 del backend (que igual las protege).
 */
export async function requireOwner() {
  const viewer = await getPortalUser();
  if (viewer?.role !== "owner") {
    redirect("/portal");
  }
  return viewer;
}

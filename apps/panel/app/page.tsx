import { redirect } from "next/navigation";

export default function Home() {
  // El layout de (app) rebota a /login si no hay sesión.
  redirect("/dashboard");
}

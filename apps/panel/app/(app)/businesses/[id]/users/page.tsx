import type { BusinessUserDto } from "@spa/shared";
import { adminGet } from "@/lib/backend";
import { UsersPanel } from "./users-panel";

/**
 * Usuarios del portal del cliente (docs/PANEL-OPERADOR.md F7): quién del spa
 * puede entrar a ver sus citas, clientas y conversaciones. Los crea el operador;
 * no hay invitación por correo.
 */
export default async function UsersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const users = await adminGet<BusinessUserDto[]>(`/admin/businesses/${id}/users`);

  return <UsersPanel businessId={id} users={users} />;
}

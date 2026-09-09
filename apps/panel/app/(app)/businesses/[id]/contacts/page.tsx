import type { ClientContactDto } from "@spa/shared";
import { adminGet } from "@/lib/backend";
import { ContactsList } from "./contacts-list";

/**
 * Contactos del dueño del negocio (docs/PANEL-OPERADOR.md §4): a quién llamar
 * por cobros, soporte o renovación. No son las clientas del spa — esas viven en
 * la pestaña de Actividad.
 */
export default async function ContactsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contacts = await adminGet<ClientContactDto[]>(`/admin/businesses/${id}/contacts`);

  return <ContactsList businessId={id} contacts={contacts} />;
}

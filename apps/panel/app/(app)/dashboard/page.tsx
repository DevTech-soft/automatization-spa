import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOperator } from "@/lib/backend";

export default async function DashboardPage() {
  const operator = await getOperator();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Panel de operador</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Sesión iniciada como {operator?.email}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Próximamente</CardTitle>
          <CardDescription>
            Este es el esqueleto del panel (F3b). Los siguientes entregables
            agregan negocios, marca, onboarding y dashboards de cartera.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-[var(--color-fg-muted)]">Usuario</dt>
              <dd className="font-mono text-xs">{operator?.userId}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-fg-muted)]">Organización activa</dt>
              <dd className="font-mono text-xs">{operator?.activeOrganizationId ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

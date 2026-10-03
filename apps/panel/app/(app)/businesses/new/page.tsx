import { BusinessForm } from "../business-form";
import { PageHeader } from "@/components/page-header";

export default function NewBusinessPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="Nuevo negocio" breadcrumbs={[{ href: "/businesses", label: "Negocios" }]} />
      <BusinessForm />
    </div>
  );
}

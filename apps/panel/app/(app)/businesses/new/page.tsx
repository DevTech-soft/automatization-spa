import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BusinessForm } from "../business-form";

export default function NewBusinessPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Link
        href="/businesses"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ChevronLeft className="size-4" />
        Negocios
      </Link>
      <h1 className="text-2xl font-semibold">Nuevo negocio</h1>
      <BusinessForm />
    </div>
  );
}

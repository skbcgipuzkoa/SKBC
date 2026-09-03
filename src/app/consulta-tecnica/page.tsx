import { unstable_noStore as noStore } from "next/cache";
import { hasInternalAccess } from "@/lib/auth";
import { buildConsultationOptions } from "@/lib/technical-consultation-core";
import { loadConsultationTechniques } from "@/lib/technical-consultation";
import { TechnicalConsultationClient } from "./TechnicalConsultationClient";

export const dynamic = "force-dynamic";

export default async function ConsultaTecnicaPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  noStore();
  const [params, techniques, canEdit] = await Promise.all([
    searchParams,
    loadConsultationTechniques(),
    hasInternalAccess()
  ]);

  return (
    <main className="consult-page">
      <TechnicalConsultationClient
        initialTechniques={techniques}
        options={buildConsultationOptions(techniques)}
        canEdit={canEdit}
        initialSaved={params.saved === "technique"}
      />
    </main>
  );
}

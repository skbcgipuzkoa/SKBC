import { unstable_noStore as noStore } from "next/cache";
import { SidebarNav } from "@/app/components/SidebarNav";
import { hasInternalAccess } from "@/lib/auth";
import { buildConsultationOptions, isKnownAdultGrade, limitTechniquesByMaxGrade } from "@/lib/technical-consultation-core";
import { loadConsultationTechniques } from "@/lib/technical-consultation";
import { TechnicalConsultationClient } from "./TechnicalConsultationClient";

export const dynamic = "force-dynamic";

export default async function ConsultaTecnicaPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; maxGrade?: string }>;
}) {
  noStore();
  const [params, techniques, canEdit] = await Promise.all([
    searchParams,
    loadConsultationTechniques(),
    hasInternalAccess()
  ]);

  const maxGrade = params.maxGrade && isKnownAdultGrade(params.maxGrade) ? params.maxGrade : null;
  const visibleTechniques = canEdit ? techniques : limitTechniquesByMaxGrade(techniques, maxGrade);
  const content = (
    <TechnicalConsultationClient
      initialTechniques={visibleTechniques}
      options={buildConsultationOptions(visibleTechniques)}
      canEdit={canEdit}
      maxGrade={canEdit ? null : maxGrade}
      initialSaved={params.saved === "technique"}
    />
  );

  if (canEdit) {
    return (
      <div className="shell">
        <SidebarNav current="/consulta-tecnica" />
        <main className="main consult-page consult-page-admin">
          {content}
        </main>
      </div>
    );
  }

  return (
    <main className="consult-page">
      {content}
    </main>
  );
}

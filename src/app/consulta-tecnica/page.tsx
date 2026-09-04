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
  searchParams: Promise<{ saved?: string; maxGrade?: string; returnTo?: string }>;
}) {
  noStore();
  const [params, techniques, canEdit] = await Promise.all([
    searchParams,
    loadConsultationTechniques(),
    hasInternalAccess()
  ]);

  const maxGrade = params.maxGrade && isKnownAdultGrade(params.maxGrade) ? params.maxGrade : null;
  const returnToFicha = canEdit ? null : safeFichaReturnUrl(params.returnTo);
  const visibleTechniques = canEdit ? techniques : limitTechniquesByMaxGrade(techniques, maxGrade);
  const content = (
    <TechnicalConsultationClient
      initialTechniques={visibleTechniques}
      options={buildConsultationOptions(visibleTechniques)}
      canEdit={canEdit}
      maxGrade={canEdit ? null : maxGrade}
      returnToFicha={returnToFicha}
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

function safeFichaReturnUrl(value?: string) {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (/^\/ficha\/[A-Za-z0-9_-]+$/.test(decoded)) return decoded;
  } catch {
    return null;
  }
  return null;
}

import { unstable_noStore as noStore } from "next/cache";
import { buildConsultationOptions, isKnownAdultGrade, limitTechniquesByMaxGrade } from "@/lib/technical-consultation-core";
import { loadConsultationTechniques } from "@/lib/technical-consultation";
import { TechnicalConsultationClient } from "@/app/consulta-tecnica/TechnicalConsultationClient";

export const dynamic = "force-dynamic";

export default async function StudentConsultaTecnicaPage({
  searchParams
}: {
  searchParams: Promise<{ maxGrade?: string; returnTo?: string }>;
}) {
  noStore();
  const [params, techniques] = await Promise.all([searchParams, loadConsultationTechniques()]);
  const maxGrade = params.maxGrade && isKnownAdultGrade(params.maxGrade) ? params.maxGrade : null;
  const returnToFicha = safeFichaReturnUrl(params.returnTo);
  const visibleTechniques = limitTechniquesByMaxGrade(techniques, maxGrade);

  return (
    <main className="consult-page student-tool-page">
      <TechnicalConsultationClient
        initialTechniques={visibleTechniques}
        options={buildConsultationOptions(visibleTechniques)}
        canEdit={false}
        maxGrade={maxGrade}
        returnToFicha={returnToFicha}
      />
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

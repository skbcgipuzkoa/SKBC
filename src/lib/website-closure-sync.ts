import { createAdminClient } from "@/lib/supabase/admin";
import type { WebsiteItem } from "@/lib/website-content";

const closures = [
  ["2026-08-01", "VACACIONES", ["Verano 2026", "Vacaciones de verano 2026"]],
  ["2026-12-08", "PUENTE DICIEMBRE", ["Puente diciembre 2026"]],
  ["2026-12-24", "VACACIONES DE NAVIDAD", ["Navidad 2026", "Vacaciones de Navidad 2026"]],
  ["2027-08-07", "VACACIONES", ["Verano 2027", "Vacaciones de verano 2027"]],
  ["2027-12-14", "PUENTE DICIEMBRE", ["Puente diciembre 2027"]],
  ["2027-12-23", "VACACIONES DE NAVIDAD", ["Navidad 2027", "Vacaciones de Navidad 2027"]]
] as const;

export async function prepareClosureSync(original: WebsiteItem) {
  if (original.source === "management") return;
  const definition = closures.find(([date, title, aliases]) =>
    original.managementClosure === aliases[0] ||
    (original.start === date && original.languages?.es?.title.trim().toUpperCase() === title)
  );
  if (!definition) return;

  const aliases = definition[2];
  const database = createAdminClient();
  const { data, error } = await database.from("skbc_calendar_closures")
    .select("id,starts_on,ends_on")
    .eq("active", true).eq("applies_to", "all").in("title", [...aliases]).limit(2);
  if (error || data?.length !== 1) {
    throw new Error("No se encontró un único cierre activo en gestión. Revisa el calendario del club.");
  }
  const closure = data[0];

  return {
    key: aliases[0],
    async apply(start: string, end: string) {
      if (closure.starts_on === start && closure.ends_on === end) return;
      const result = await database.from("skbc_calendar_closures")
        .update({ starts_on: start, ends_on: end, updated_at: new Date().toISOString() })
        .eq("id", closure.id).eq("active", true)
        .eq("starts_on", closure.starts_on).eq("ends_on", closure.ends_on)
        .select("id").maybeSingle();
      if (result.error || !result.data) {
        throw new Error("La web se publicó, pero gestión no pudo actualizar el cierre. Recarga y vuelve a publicar para sincronizarlo.");
      }
    }
  };
}

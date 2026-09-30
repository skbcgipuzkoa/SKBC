"use client";

import { useMemo, useState } from "react";
import { adultGrades, kidsGrades } from "@/lib/grades";
import { splitContactValues } from "@/lib/member-contacts";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  hiddenFields?: Record<string, string>;
  error?: boolean | string;
  saved?: boolean;
  initial?: {
    firstName?: string;
    lastName?: string | null;
    ikaId?: string | null;
    grade?: string | null;
    joinedOn?: string | null;
    birthDate?: string | null;
    class?: "kids" | "adults";
    status?: "active" | "inactive";
    familyEmail?: string | null;
    guardianName?: string | null;
    guardianPhone?: string | null;
    studentPhone?: string | null;
    address?: string | null;
    siteUrl?: string | null;
    examHistory?: string | null;
    freeTrialEnabled?: boolean | null;
    freeTrialStartedOn?: string | null;
    freeTrialEndsOn?: string | null;
  };
};

export function KenshiForm({ action, submitLabel, hiddenFields = {}, initial, error, saved }: Props) {
  const [memberClass, setMemberClass] = useState<"kids" | "adults">(initial?.class ?? "adults");
  const gradeOptions = useMemo(() => (memberClass === "kids" ? kidsGrades : adultGrades), [memberClass]);
  const [familyEmail, familyEmail2 = ""] = splitContactValues(initial?.familyEmail, "email");
  const [guardianName, guardianName2 = ""] = splitContactValues(initial?.guardianName);
  const [guardianPhone, guardianPhone2 = ""] = splitContactValues(initial?.guardianPhone);

  return (
    <form action={action} className="edit-form" encType="multipart/form-data">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="form-grid">
        <label>Nombre<input name="firstName" defaultValue={initial?.firstName ?? ""} required /></label>
        <label>Apellidos<input name="lastName" defaultValue={initial?.lastName ?? ""} /></label>
        <label>ID IKA<input name="ikaId" defaultValue={initial?.ikaId ?? ""} placeholder="Ej. IKA-000193 o 193" /></label>
        <label>
          Grado
          <select name="grade" defaultValue={gradeOptions.includes(initial?.grade ?? "") ? initial?.grade ?? "" : ""}>
            <option value="">Sin grado</option>
            {gradeOptions.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </select>
        </label>
        <label>Fecha ingreso<input name="joinedOn" type="date" defaultValue={initial?.joinedOn ?? ""} /></label>
        <label>Fecha nacimiento<input name="birthDate" type="date" defaultValue={initial?.birthDate ?? ""} /></label>
        <label>
          Clase
          <select name="class" value={memberClass} onChange={(event) => setMemberClass(event.target.value as "kids" | "adults")}>
            <option value="kids">Ninos</option>
            <option value="adults">Adultos</option>
          </select>
        </label>
        <label>
          Estado
          <select name="status" defaultValue={initial?.status ?? "active"}>
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
          </select>
        </label>
        {memberClass === "kids" ? (
          <fieldset className="wide guardian-contacts">
            <legend>Contactos familiares</legend>
            <div className="guardian-contact-grid">
              <section>
                <strong>Tutor 1</strong>
                <label>Nombre<input name="guardianName" defaultValue={guardianName ?? ""} /></label>
                <label>Email<input name="familyEmail" type="email" defaultValue={familyEmail ?? ""} /></label>
                <label>Telefono<input name="guardianPhone" defaultValue={guardianPhone ?? ""} /></label>
              </section>
              <section>
                <strong>Tutor 2</strong>
                <label>Nombre<input name="guardianName2" defaultValue={guardianName2} /></label>
                <label>Email<input name="familyEmail2" type="email" defaultValue={familyEmail2} /></label>
                <label>Telefono<input name="guardianPhone2" defaultValue={guardianPhone2} /></label>
              </section>
            </div>
          </fieldset>
        ) : (
          <>
            <label>Email alumno<input name="familyEmail" type="email" defaultValue={familyEmail ?? ""} /></label>
            <input type="hidden" name="familyEmail2" value={familyEmail2} />
            <input type="hidden" name="guardianName" value={guardianName ?? ""} />
            <input type="hidden" name="guardianName2" value={guardianName2} />
            <input type="hidden" name="guardianPhone" value={guardianPhone ?? ""} />
            <input type="hidden" name="guardianPhone2" value={guardianPhone2} />
          </>
        )}
        <label>{memberClass === "kids" ? "Telefono alumno (opcional)" : "Telefono alumno"}<input name="studentPhone" defaultValue={initial?.studentPhone ?? ""} /></label>
        <label>Foto perfil<input name="profilePhoto" type="file" accept="image/*" /></label>
        <label className="checkbox-line">
          <input type="checkbox" name="freeTrialEnabled" defaultChecked={initial?.freeTrialEnabled ?? false} />
          Aplicar aviso de mes gratis
        </label>
        <label>Inicio mes gratis<input name="freeTrialStartedOn" type="date" defaultValue={initial?.freeTrialStartedOn ?? initial?.joinedOn ?? ""} /></label>
        <label>Primer cobro posible<input name="freeTrialEndsOn" type="date" defaultValue={initial?.freeTrialEndsOn ?? ""} /></label>
        <label className="wide">Direccion<input name="address" defaultValue={initial?.address ?? ""} /></label>
        <label className="wide">URL material grado<input name="siteUrl" defaultValue={initial?.siteUrl ?? ""} /></label>
        <label className="wide">Historial examenes<textarea name="examHistory" rows={4} defaultValue={initial?.examHistory ?? ""} /></label>
      </div>
      <div className="form-actions">
        <button type="submit">{submitLabel}</button>
        {saved ? <span className="save-ok">Guardado</span> : null}
        {error ? <span className="form-error">{typeof error === "string" ? error : "No se pudo guardar"}</span> : null}
      </div>
    </form>
  );
}

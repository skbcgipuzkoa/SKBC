"use client";

import { useMemo, useState } from "react";
import { adultGrades, kidsGrades } from "@/lib/grades";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  hiddenFields?: Record<string, string>;
  error?: boolean;
  saved?: boolean;
  initial?: {
    firstName?: string;
    lastName?: string | null;
    ikaId?: string | null;
    grade?: string | null;
    joinedOn?: string | null;
    class?: "kids" | "adults";
    status?: "active" | "inactive";
    familyEmail?: string | null;
    guardianName?: string | null;
    guardianPhone?: string | null;
    studentPhone?: string | null;
    address?: string | null;
    siteUrl?: string | null;
    examHistory?: string | null;
  };
};

export function KenshiForm({ action, submitLabel, hiddenFields = {}, initial, error, saved }: Props) {
  const [memberClass, setMemberClass] = useState<"kids" | "adults">(initial?.class ?? "adults");
  const gradeOptions = useMemo(() => (memberClass === "kids" ? kidsGrades : adultGrades), [memberClass]);

  return (
    <form action={action} className="edit-form">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="form-grid">
        <label>Nombre<input name="firstName" defaultValue={initial?.firstName ?? ""} required /></label>
        <label>Apellidos<input name="lastName" defaultValue={initial?.lastName ?? ""} /></label>
        <label>ID IKA<input name="ikaId" defaultValue={initial?.ikaId ?? ""} placeholder="Opcional" /></label>
        <label>
          Grado
          <select name="grade" defaultValue={gradeOptions.includes(initial?.grade ?? "") ? initial?.grade ?? "" : ""}>
            <option value="">Sin grado</option>
            {gradeOptions.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </select>
        </label>
        <label>Fecha ingreso<input name="joinedOn" type="date" defaultValue={initial?.joinedOn ?? ""} /></label>
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
        <label>Email familia<input name="familyEmail" defaultValue={initial?.familyEmail ?? ""} /></label>
        <label>Tutor<input name="guardianName" defaultValue={initial?.guardianName ?? ""} /></label>
        <label>Telefono tutor<input name="guardianPhone" defaultValue={initial?.guardianPhone ?? ""} /></label>
        <label>Telefono alumno<input name="studentPhone" defaultValue={initial?.studentPhone ?? ""} /></label>
        <label className="wide">Direccion<input name="address" defaultValue={initial?.address ?? ""} /></label>
        <label className="wide">URL material grado<input name="siteUrl" defaultValue={initial?.siteUrl ?? ""} /></label>
        <label className="wide">Historial examenes<textarea name="examHistory" rows={4} defaultValue={initial?.examHistory ?? ""} /></label>
      </div>
      <div className="form-actions">
        <button type="submit">{submitLabel}</button>
        {saved ? <span className="save-ok">Guardado</span> : null}
        {error ? <span className="form-error">No se pudo guardar</span> : null}
      </div>
    </form>
  );
}

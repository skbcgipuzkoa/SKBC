import { UserPlus } from "lucide-react";
import { addDojoGuestAction, addProvisionalAttendanceAction } from "@/app/actions";

export function ProvisionalAttendanceForm({ classId, group, returnTo, dojo }: { classId: string; group: "kids" | "adults"; returnTo: string; dojo?: string }) {
  return (
    <details className="provisional-attendance">
      <summary><UserPlus size={16} aria-hidden="true" /> Anadir invitado</summary>
      <form action={dojo ? addDojoGuestAction.bind(null, dojo) : addProvisionalAttendanceAction} className="inline-form">
        <input name="classId" type="hidden" value={classId} />
        <input name="group" type="hidden" value={group} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <label>Nombre<input name="displayName" required minLength={2} placeholder="Nombre y apellidos" /></label>
        <button className="primary-link" type="submit">Anadir asistencia</button>
      </form>
      <p className="muted">Se guardara como provisional hasta completar su ficha.</p>
    </details>
  );
}

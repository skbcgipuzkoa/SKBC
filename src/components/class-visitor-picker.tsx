"use client";

import { useState } from "react";
import { Users } from "lucide-react";

export type VisitorOption = { id: string; name: string };
export type VisitorGroup = { slug: string; name: string; members: VisitorOption[] };

export function ClassVisitorPicker({ groups, action }: {
  groups: VisitorGroup[];
  action: (form: FormData) => Promise<void>;
}) {
  const [origin, setOrigin] = useState("");
  const selected = groups.find(group => group.slug === origin);
  return <details className="provisional-attendance">
    <summary><Users size={16} aria-hidden="true" /> Kenshis de otros dojos</summary>
    <form action={action} className="inline-form">
      <label>Dojo de origen
        <select name="origin" required value={origin} onChange={event => setOrigin(event.target.value)}>
          <option value="">Seleccionar dojo</option>
          {groups.map(group => <option key={group.slug} value={group.slug}>{group.name}</option>)}
        </select>
      </label>
      {selected && <fieldset key={origin}>
        <legend>Kenshis</legend>
        {selected.members.length ? selected.members.map(member => <label key={member.id}>
          <input name="member" type="checkbox" value={member.id} /> {member.name}
        </label>) : <p>No hay kenshis disponibles para esta clase.</p>}
      </fieldset>}
      <button className="primary-link" disabled={!selected?.members.length}>Añadir a asistencia</button>
    </form>
  </details>;
}

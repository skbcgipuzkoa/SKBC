"use client";

import { Search, Users } from "lucide-react";
import { useMemo, useState } from "react";

export type EmailRecipientOption = {
  id: string;
  name: string;
  group: "kids" | "adults";
  email: string;
};

export function EmailRecipientPicker({ members }: { members: EmailRecipientOption[] }) {
  const [audience, setAudience] = useState("all_active");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es");
    return term ? members.filter((member) => `${member.name} ${member.email}`.toLocaleLowerCase("es").includes(term)) : members;
  }, [members, query]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return <div className="email-recipient-field">
    <label>
      Destinatarios
      <select name="audience" value={audience} onChange={(event) => setAudience(event.target.value)}>
        <option value="all_active">Todos los kenshis activos</option>
        <option value="adults">Solo adultos activos</option>
        <option value="kids">Solo ninos activos</option>
        <option value="exam_ready">Aptos para examen</option>
        <option value="exam_upcoming">Proximos a examen</option>
        <option value="inactive">Inactivos</option>
        <option value="selected">Seleccionar kenshis</option>
      </select>
    </label>
    {audience === "selected" ? <div className="email-recipient-picker">
      <div className="email-recipient-picker-head"><span><Users size={16} /> {selected.size} seleccionados</span>{selected.size ? <button type="button" onClick={() => setSelected(new Set())}>Limpiar</button> : null}</div>
      <label className="email-recipient-search"><Search size={16} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o email" /></label>
      <div className="email-recipient-options">
        {visible.map((member) => <label className="email-recipient-option" key={member.id}>
          <input name="memberIds" type="checkbox" value={member.id} checked={selected.has(member.id)} onChange={() => toggle(member.id)} />
          <span><strong>{member.name}</strong><small>{member.group === "kids" ? "Ninos" : "Adultos"} · {member.email}</small></span>
        </label>)}
        {!visible.length ? <p className="muted">No hay coincidencias.</p> : null}
      </div>
      {!selected.size ? <p className="form-hint">Selecciona al menos un kenshi para enviar.</p> : null}
    </div> : null}
  </div>;
}

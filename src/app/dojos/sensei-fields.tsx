"use client";

import { useState } from "react";

export type SenseiOption = { id: string; name: string; contact: string; photo: string | null };

export function DojoSenseiFields({ members, initial }: {
  members: SenseiOption[];
  initial: { id: string; name: string; contact: string; photo: string };
}) {
  const [id, setId] = useState(initial.id);
  const member = members.find(option => option.id === id);
  return <>
    <label>Tipo de sensei
      <select value={id ? "member" : "external"} onChange={event => setId(event.target.value === "member" ? members[0]?.id ?? "" : "")}>
        <option value="external">Sensei externo o nombre manual</option>
        <option value="member" disabled={!members.length}>Miembro de SKBC</option>
      </select>
    </label>
    {member ? <>
      <label>Miembro de SKBC<select name="sensei_member" value={id} onChange={event => setId(event.target.value)}>
        {members.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select></label>
      <label>Contacto <input readOnly value={member.contact} /></label>
      {member.photo && <img src={member.photo} alt={member.name} width={72} height={72} />}
    </> : <>
      <label>Nombre del sensei <input name="sensei" maxLength={160} defaultValue={initial.id ? "" : initial.name} /></label>
      <label>Contacto <input name="contact" maxLength={240} defaultValue={initial.id ? "" : initial.contact} /></label>
      <label>Foto del sensei (URL) <input name="sensei_photo" type="url" defaultValue={initial.id ? "" : initial.photo} /></label>
    </>}
  </>;
}

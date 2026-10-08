"use client";

import { useMemo, useState } from "react";
import { addFamilyUnitMembersAction, createFamilyUnitAction, removeFamilyUnitMemberAction } from "@/app/actions";
import type { FamilyUnitContext } from "@/lib/family-units";

type Option = { id: string; legacy_id: string | null; display_name: string; class: "kids" | "adults"; status: "active" };

export function FamilyUnitManager({ context, options, currentMemberId, legacyId }: { context: FamilyUnitContext; options: Option[]; currentMemberId: string; legacyId: string }) {
  const [query, setQuery] = useState("");
  const currentIds = new Set(context.billing.members.map((member) => member.id));
  const available = useMemo(() => options.filter((member) => !currentIds.has(member.id) && `${member.display_name} ${member.legacy_id ?? ""}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"))), [options, query, context.billing.compositionSignature]);
  const action = context.unitId ? addFamilyUnitMembersAction : createFamilyUnitAction;

  return <section className="card family-unit-card" id="unidad-familiar">
    <div className="section-heading-row">
      <div><p className="eyebrow">Cuotas</p><h2>Unidad familiar</h2><p className="muted">Una sola cuota y una sola hoja de cobro para todos los miembros activos.</p></div>
      <a className="secondary-button" href={`/kenshis/${encodeURIComponent(legacyId)}/hoja-cobro`} target="_blank" rel="noreferrer">Ver hoja de cobro</a>
    </div>
    <div className="family-unit-summary">
      <div><span>Miembros</span><strong>{context.billing.members.length}</strong></div>
      <div><span>Cuotas base</span><strong>{money(context.billing.baseTotalCents)}</strong></div>
      <div><span>Descuento</span><strong>-{money(context.billing.discountCents)}</strong></div>
      <div><span>Cuota familiar</span><strong>{money(context.billing.totalCents)}</strong></div>
      <div><span>Primer cobro unificado</span><strong>{dateLabel(context.billing.billingOn)}</strong></div>
    </div>
    <div className="family-member-list">
      {context.billing.members.map((member) => <article key={member.id} className={member.isNewest ? "is-newest" : ""}>
        <div><strong>{member.display_name}</strong><small>{member.class === "kids" ? "Ninos" : "Adultos"} · {money(member.baseFeeCents)}{member.isNewest ? " · Ultima incorporacion" : ""}</small></div>
        {context.unitId ? <form action={removeFamilyUnitMemberAction} onSubmit={(event) => { if (!window.confirm(`Quitar a ${member.display_name} de esta unidad familiar?`)) event.preventDefault(); }}>
          <input type="hidden" name="unitId" value={context.unitId} /><input type="hidden" name="memberId" value={member.id} /><input type="hidden" name="legacyId" value={legacyId} />
          <button className="secondary-button" type="submit">Quitar</button>
        </form> : null}
      </article>)}
    </div>
    <form action={action} className="family-add-form">
      <input type="hidden" name="memberId" value={currentMemberId} /><input type="hidden" name="legacyId" value={legacyId} />
      {context.unitId ? <input type="hidden" name="unitId" value={context.unitId} /> : null}
      <label>Buscar kenshi activo<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o ID SKBC" /></label>
      <div className="family-member-options">
        {available.slice(0, 30).map((member) => <label key={member.id}><input type="checkbox" name="memberIds" value={member.id} /><span><strong>{member.display_name}</strong><small>{member.class === "kids" ? "Ninos" : "Adultos"}</small></span></label>)}
        {!available.length ? <p className="muted">No hay kenshis disponibles con esa búsqueda.</p> : null}
      </div>
      <button type="submit">{context.unitId ? "Anadir miembros" : "Crear unidad familiar"}</button>
    </form>
  </section>;
}

function money(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function dateLabel(value: string | null) {
  if (!value) return "Fecha pendiente";
  return new Intl.DateTimeFormat("es-ES").format(new Date(`${value}T00:00:00`));
}

import { Banknote, Bell, CheckCircle2, FileText, LogOut, Printer, Users } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { SubmitButton } from "@/app/components/SubmitButton";
import { correctTreasuryWorkflowAction, logoutTreasuryAction, manageTreasuryAccessAction, updateMemberBillingAction, updateTreasuryWorkflowAction } from "@/app/tesoreria/actions";
import { CopyLinkButton } from "@/components/copy-link-button";
import { familyLabel, getTreasuryFamilies } from "@/lib/treasury";
import { getTreasuryAccessSettings, getTreasuryActor } from "@/lib/treasury-auth";

export const dynamic = "force-dynamic";

export default async function TreasuryPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const actor = await getTreasuryActor();
  const params = await searchParams;
  if (!actor) {
    return <main className="treasury-locked"><img src="/skbc-icon.png" alt="SKBC Gipuzkoa" /><h1>Tesorería SKBC</h1><p>Acceso privado exclusivo para la gestión económica del club.</p>{params.error ? <p className="form-error">El enlace de acceso no es válido o ha caducado.</p> : null}<a className="primary-button" href="/tesoreria/admin">Acceder como Álvaro</a></main>;
  }

  const [families, accessSettings] = await Promise.all([
    getTreasuryFamilies(),
    actor === "alvaro" ? getTreasuryAccessSettings() : Promise.resolve(null)
  ]);
  const expectedCents = families.reduce((sum, family) => sum + family.billing.totalCents, 0);
  const includedMembers = families.reduce((sum, family) => sum + family.billing.members.length, 0);
  const exemptMembers = families.reduce((sum, family) => sum + family.members.filter((member) => member.billing_enabled === false).length, 0);
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date();
  soon.setDate(soon.getDate() + 14);
  const soonDate = soon.toISOString().slice(0, 10);
  const alerts = families.filter((family) => {
    const end = family.billing.newestMember?.trialEndsOn;
    if (!end) return false;
    return family.task?.status === "delivered" || Boolean(end <= soonDate && family.task?.status !== "received" && family.task?.status !== "active");
  });

  const content = (
    <main className="main treasury-main">
      <div className="topbar">
        <div><p className="eyebrow">Información económica compartida</p><h1>Tesorería SKBC</h1><p className="muted">Acceso como {actor === "alvaro" ? "Álvaro" : "Tesorero"}. Los cambios quedan registrados automáticamente.</p></div>
        {actor === "tesorero" ? <form action={logoutTreasuryAction}><button className="icon-button" type="submit" title="Cerrar acceso" aria-label="Cerrar acceso"><LogOut size={18} /></button></form> : null}
      </div>

      {params.saved ? <p className="save-ok">Información económica actualizada correctamente.</p> : null}
      {params.error && params.error !== "access" ? <p className="form-error">No se ha podido guardar el cambio.</p> : null}

      {actor === "alvaro" && accessSettings ? <section className="card treasury-access-manager">
        <div className="section-heading-row"><div><p className="eyebrow">Acceso compartido</p><h2>Enlace privado del tesorero</h2><p className="muted">Solo permite consultar y gestionar Tesorería. Al generar uno nuevo, el enlace anterior deja de funcionar.</p></div><span className={`state-badge ${accessSettings.enabled ? "state-completada" : "state-pendiente"}`}>{accessSettings.enabled ? "Activo" : "Desactivado"}</span></div>
        <div className="treasury-link-row">
          <input aria-label="Enlace privado del tesorero" readOnly value={`https://skbc.vercel.app/tesoreria/acceso?token=${accessSettings.token}`} />
          <CopyLinkButton value={`https://skbc.vercel.app/tesoreria/acceso?token=${accessSettings.token}`} />
        </div>
        <div className="notice-action-row">
          <form action={manageTreasuryAccessAction}><input type="hidden" name="operation" value={accessSettings.enabled ? "deactivate" : "activate"} /><SubmitButton pendingLabel="Guardando...">{accessSettings.enabled ? "Desactivar enlace" : "Activar enlace"}</SubmitButton></form>
          <form action={manageTreasuryAccessAction}><input type="hidden" name="operation" value="regenerate" /><SubmitButton pendingLabel="Generando...">Generar enlace nuevo</SubmitButton></form>
        </div>
        {accessSettings.updatedAt ? <p className="treasury-last-action">Último cambio por Álvaro · {dateTime(accessSettings.updatedAt)}</p> : <p className="treasury-last-action">Enlace original incorporado al sistema. Se guardará en Supabase al modificarlo.</p>}
      </section> : null}

      <section className="grid stats compact treasury-stats">
        <article className="card"><Banknote size={20} /><h2>Cuota mensual prevista</h2><div className="metric">{money(expectedCents)}</div></article>
        <article className="card"><Users size={20} /><h2>Incluidos en cuota</h2><div className="metric">{includedMembers}</div></article>
        <article className="card"><CheckCircle2 size={20} /><h2>Exentos</h2><div className="metric">{exemptMembers}</div></article>
        <article className={alerts.length ? "card attention-card" : "card"}><Bell size={20} /><h2>Avisos</h2><div className="metric">{alerts.length}</div></article>
      </section>

      <section className={alerts.length ? "card attention-card" : "card"}>
        <div className="section-heading-row"><div><p className="eyebrow">Seguimiento</p><h2>Avisos de tesorería</h2><p className="muted">Meses gratuitos próximos a terminar y hojas entregadas pendientes de devolución.</p></div>{alerts.some((family) => family.billing.newestMember?.trialEndsOn && family.billing.newestMember!.trialEndsOn! <= today) ? <a className="secondary-button" href="/avisos/hojas-cobro" target="_blank"><Printer size={17} /> Imprimir hojas vencidas</a> : null}</div>
        {alerts.length ? <div className="treasury-alert-list">{alerts.map((family) => <a key={family.key} href={`#family-${family.key}`}><strong>{familyLabel(family)}</strong><span>{family.task?.status === "delivered" ? "Hoja entregada: faltan los datos bancarios" : `Fin del mes gratuito: ${date(family.billing.newestMember?.trialEndsOn)}`}</span></a>)}</div> : <p className="muted">No hay gestiones urgentes.</p>}
      </section>

      <section className="card treasury-directory">
        <div className="section-heading-row"><div><p className="eyebrow">Situación actual</p><h2>Familias y cuotas</h2><p className="muted">Aquí se indica quién se incluirá en la cuota. En las nuevas altas, el cobro no queda activo hasta completar la entrega de la hoja, recibir los datos bancarios y pulsar Activar cobro.</p></div><span className="state-badge state-completada">{families.length} unidades</span></div>
        <div className="treasury-family-list">
          {families.map((family) => {
            const subject = family.billing.newestMember;
            const hasOnboardingWorkflow = Boolean(subject?.trialEndsOn);
            const status = hasOnboardingWorkflow ? family.task?.status ?? "pending" : family.billing.members.length ? "active" : "exempt";
            return <details id={`family-${family.key}`} className={`treasury-family treasury-status-${status}`} key={family.key} open={status === "delivered"}>
              <summary><span><strong>{familyLabel(family)}</strong><small>{family.members.length} miembros · {family.billing.members.length} incluidos al cobrar</small></span><b>{money(family.billing.totalCents)}</b><span className={`state-badge treasury-badge-${status}`}>{statusLabel(status)}</span></summary>
              <div className="treasury-family-body">
                <div className="treasury-members">
                  {family.members.map((member) => <form action={updateMemberBillingAction} key={member.id} className={member.billing_enabled === false ? "treasury-member exempt" : "treasury-member"}>
                    <input type="hidden" name="memberId" value={member.id} />
                    <span><strong>{member.display_name}</strong><small>{member.class === "kids" ? "Niños" : "Adultos"}{member.free_trial_enabled ? ` · Mes gratis hasta ${date(member.free_trial_ends_on)}` : ""}</small></span>
                    <label>Al iniciar el cobro<select name="billingEnabled" defaultValue={member.billing_enabled === false ? "false" : "true"}><option value="true">Incluir en la cuota</option><option value="false">Exento de cuota</option></select></label>
                    <label>Nota<input name="billingNote" defaultValue={member.billing_note ?? ""} placeholder="Motivo opcional" /></label>
                    <SubmitButton pendingLabel="Guardando...">Guardar</SubmitButton>
                  </form>)}
                </div>
                {subject && hasOnboardingWorkflow ? <div className="treasury-workflow">
                  <div><h3>Hoja y alta de cobro</h3><p className="muted">Nueva incorporación: {subject.display_name} · Primer cobro: {date(family.billing.billingOn)}</p></div>
                  <div className="notice-action-row">
                    {subject.legacy_id ? <a className="secondary-button" href={`/kenshis/${subject.legacy_id}/hoja-cobro`} target="_blank"><FileText size={17} /> Abrir hoja</a> : null}
                    {status === "pending" || status === "generated" ? <WorkflowButton memberId={subject.id} status="delivered" label="Marcar hoja entregada" /> : null}
                    {status === "delivered" ? <WorkflowButton memberId={subject.id} status="received" label="Datos bancarios recibidos" /> : null}
                    {status === "received" ? <WorkflowButton memberId={subject.id} status="active" label="Activar cobro" /> : null}
                  </div>
                  {actor === "alvaro" ? <form action={correctTreasuryWorkflowAction} className="treasury-correction-form">
                    <input type="hidden" name="memberId" value={subject.id} />
                    <label>Corregir estado<select name="status" defaultValue={status}><option value="pending">Pendiente de preparar</option><option value="generated">Hoja preparada</option><option value="delivered">Hoja entregada</option><option value="received">Datos bancarios recibidos</option><option value="active">Cobro activo</option></select></label>
                    <label>Motivo<input name="note" placeholder="Motivo de la corrección" /></label>
                    <SubmitButton pendingLabel="Corrigiendo...">Aplicar corrección</SubmitButton>
                  </form> : null}
                  {family.task?.last_actor ? <p className="treasury-last-action">Último cambio por {actorLabel(family.task.last_actor)} · {dateTime(family.task.updated_at)}{family.task.note ? ` · ${family.task.note}` : ""}</p> : null}
                </div> : family.billing.members.length ? <p className="treasury-current-note">Cuota ordinaria actual. No requiere seguimiento de hoja de alta.</p> : <p className="muted">Esta unidad no tiene ninguna cuota activa.</p>}
                {family.events.length ? <details className="treasury-history"><summary>Ver historial</summary><ul>{family.events.map((event) => <li key={event.id}><span>{eventLabel(event.action)}{event.note ? ` · ${event.note}` : ""}</span><small>{actorLabel(event.actor)} · {dateTime(event.created_at)}</small></li>)}</ul></details> : null}
              </div>
            </details>;
          })}
        </div>
      </section>
    </main>
  );

  return actor === "alvaro" ? <div className="shell"><SidebarNav current="/tesoreria/admin" />{content}</div> : <div className="treasury-shell">{content}</div>;
}

function WorkflowButton({ memberId, status, label }: { memberId: string; status: string; label: string }) {
  return <form action={updateTreasuryWorkflowAction}><input type="hidden" name="memberId" value={memberId} /><input type="hidden" name="status" value={status} /><SubmitButton pendingLabel="Guardando...">{label}</SubmitButton></form>;
}

function money(cents: number) { return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100); }
function date(value?: string | null) { return value ? new Intl.DateTimeFormat("es-ES").format(new Date(`${value}T12:00:00`)) : "-"; }
function dateTime(value: string) { return new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function actorLabel(actor: string) { return actor === "tesorero" ? "Tesorero" : "Álvaro"; }
function statusLabel(status: string) { return ({ pending: "Pendiente de preparar", generated: "Hoja preparada", delivered: "Esperando devolución", received: "Datos recibidos", active: "Cobro activo", exempt: "Sin cuota" } as Record<string, string>)[status] ?? status; }
function eventLabel(action: string) { return ({ pending: "Devuelto a pendiente", generated: "Hoja preparada", delivered: "Hoja entregada", received: "Datos bancarios recibidos", active: "Cobro activado", billing_enabled: "Incluido en cuota", billing_disabled: "Exento de cuota" } as Record<string, string>)[action] ?? action; }

import { BarChart3, LogOut } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { generateWeeklySummary } from "@/lib/weekly-summary";
import { redirect } from "next/navigation";

export default async function WeeklySummaryPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const query = await searchParams;
  const requestedPeriod = validPeriod(query.from, query.to);
  const latest = await generateWeeklySummary(requestedPeriod ? { period: requestedPeriod } : undefined);
  return <div className="shell"><SidebarNav current="/resumen-semanal" /><main className="main">
    <div className="topbar"><div><p className="eyebrow">Gestion</p><h1>Resumen semanal</h1></div><form action={logoutAction}><button className="icon-button" aria-label="Salir"><LogOut size={18} /></button></form></div>
    <section className="card">
      <h2>Consultar otro periodo</h2>
      <form className="form-grid" method="get">
        <label>Desde<input name="from" type="date" required defaultValue={requestedPeriod?.start ?? latest.period.start} /></label>
        <label>Hasta<input name="to" type="date" required defaultValue={requestedPeriod?.end ?? latest.period.end} /></label>
        <button className="primary-link" type="submit">Calcular resumen</button>
      </form>
      {query.from || query.to ? requestedPeriod ? <a className="text-link" href="/resumen-semanal">Volver a la ultima semana</a> : <p className="save-error">El periodo indicado no es valido.</p> : null}
    </section>
    <section className="control-hero control-ok"><div><span className="tag">{latest.period.start} a {latest.period.end}</span><h2>{requestedPeriod ? "El periodo de un vistazo" : "La semana de un vistazo"}</h2><p className="muted">Se calcula al abrir la pantalla; no se almacena un historial.</p></div><BarChart3 size={32} /></section>
      <section className="grid stats compact"><Metric label="Clases" value={latest.payload.classes} /><Metric label="Asistencias" value={latest.payload.attendance} /><Metric label="Kenshis" value={latest.payload.uniqueAttendees} /><Metric label="Pendientes" value={latest.payload.pendingProvisionals + latest.payload.importantNotes} /></section>
      <section className="card detail-list"><h2>Detalle</h2><p><strong>Ninos:</strong> {latest.payload.kidsAttendance} asistencias</p><p><strong>Adultos:</strong> {latest.payload.adultAttendance} asistencias</p><p><strong>Altas:</strong> {latest.payload.newMembers} kenshis y {latest.payload.newProvisionals} invitados</p><p><strong>Seguimiento:</strong> {latest.payload.pendingProvisionals} provisionales y {latest.payload.importantNotes} notas importantes</p><p><strong>Clases pendientes:</strong> {latest.payload.openClasses} abiertas y {latest.payload.correctedClasses} en correccion</p></section>
  </main></div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <article className="card"><h2>{label}</h2><div className="metric">{value}</div></article>; }

function validPeriod(from?: string, to?: string) {
  if (!from && !to) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? "") || from! > to!) return null;
  const days = Math.floor((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
  return days <= 730 ? { start: from!, end: to! } : null;
}

import { BarChart3, LogOut } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { generateWeeklySummary } from "@/lib/weekly-summary";
import { redirect } from "next/navigation";

export default async function WeeklySummaryPage() {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const latest = await generateWeeklySummary();
  return <div className="shell"><SidebarNav current="/resumen-semanal" /><main className="main">
    <div className="topbar"><div><p className="eyebrow">Gestion</p><h1>Resumen semanal</h1></div><form action={logoutAction}><button className="icon-button" aria-label="Salir"><LogOut size={18} /></button></form></div>
    <section className="control-hero control-ok"><div><span className="tag">{latest.period.start} a {latest.period.end}</span><h2>La semana de un vistazo</h2><p className="muted">Se calcula al abrir la pantalla; no se almacena un historial.</p></div><BarChart3 size={32} /></section>
      <section className="grid stats compact"><Metric label="Clases" value={latest.payload.classes} /><Metric label="Asistencias" value={latest.payload.attendance} /><Metric label="Kenshis" value={latest.payload.uniqueAttendees} /><Metric label="Pendientes" value={latest.payload.pendingProvisionals + latest.payload.importantNotes} /></section>
      <section className="card detail-list"><h2>Detalle</h2><p><strong>Ninos:</strong> {latest.payload.kidsAttendance} asistencias</p><p><strong>Adultos:</strong> {latest.payload.adultAttendance} asistencias</p><p><strong>Altas:</strong> {latest.payload.newMembers} kenshis y {latest.payload.newProvisionals} invitados</p><p><strong>Seguimiento:</strong> {latest.payload.pendingProvisionals} provisionales y {latest.payload.importantNotes} notas importantes</p><p><strong>Clases pendientes:</strong> {latest.payload.openClasses} abiertas y {latest.payload.correctedClasses} en correccion</p></section>
  </main></div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <article className="card"><h2>{label}</h2><div className="metric">{value}</div></article>; }

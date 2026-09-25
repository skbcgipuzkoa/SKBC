import { BarChart3, LogOut } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateWeeklySummary, type WeeklySummaryPayload } from "@/lib/weekly-summary";
import { redirect } from "next/navigation";

type Summary = { id: string; period_start: string; period_end: string; payload: WeeklySummaryPayload; created_at: string };

export default async function WeeklySummaryPage() {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const supabase = createAdminClient();
  let [{ data: summaries }, { data: deliveries }] = await Promise.all([
    supabase.from("weekly_summaries").select("id,period_start,period_end,payload,created_at").order("period_start", { ascending: false }).limit(12).returns<Summary[]>(),
    supabase.from("notification_deliveries").select("delivery_key,status,error_message,delivered_at").eq("channel", "telegram").order("created_at", { ascending: false }).limit(12)
  ]);
  if (!summaries?.length) {
    await generateWeeklySummary();
    [{ data: summaries }, { data: deliveries }] = await Promise.all([
      supabase.from("weekly_summaries").select("id,period_start,period_end,payload,created_at").order("period_start", { ascending: false }).limit(12).returns<Summary[]>(),
      supabase.from("notification_deliveries").select("delivery_key,status,error_message,delivered_at").eq("channel", "telegram").order("created_at", { ascending: false }).limit(12)
    ]);
  }
  const deliveryByKey = new Map((deliveries ?? []).map((row) => [row.delivery_key, row]));
  const latest = summaries?.[0];
  return <div className="shell"><SidebarNav current="/resumen-semanal" /><main className="main">
    <div className="topbar"><div><p className="eyebrow">Gestion</p><h1>Resumen semanal</h1></div><form action={logoutAction}><button className="icon-button" aria-label="Salir"><LogOut size={18} /></button></form></div>
    {latest ? <><section className="control-hero control-ok"><div><span className="tag">{latest.period_start} a {latest.period_end}</span><h2>La semana de un vistazo</h2><p className="muted">Panel y Telegram comparten exactamente los mismos datos.</p></div><BarChart3 size={32} /></section>
      <section className="grid stats compact"><Metric label="Clases" value={latest.payload.classes} /><Metric label="Asistencias" value={latest.payload.attendance} /><Metric label="Kenshis" value={latest.payload.uniqueAttendees} /><Metric label="Pendientes" value={latest.payload.pendingProvisionals + latest.payload.importantNotes} /></section>
      <section className="card detail-list"><h2>Detalle</h2><p><strong>Ninos:</strong> {latest.payload.kidsAttendance} asistencias</p><p><strong>Adultos:</strong> {latest.payload.adultAttendance} asistencias</p><p><strong>Altas:</strong> {latest.payload.newMembers} kenshis y {latest.payload.newProvisionals} invitados</p><p><strong>Seguimiento:</strong> {latest.payload.pendingProvisionals} provisionales y {latest.payload.importantNotes} notas importantes</p><p><strong>Clases pendientes:</strong> {latest.payload.openClasses} abiertas y {latest.payload.correctedClasses} en correccion</p></section></> : <section className="card"><h2>Aun no hay resumen</h2><p className="muted">El primero se generara el lunes a las 08:00.</p></section>}
    <section className="card"><h2>Historial</h2><div className="stack-list">{(summaries ?? []).map((summary) => { const delivery = deliveryByKey.get(`weekly:${summary.period_start}`); return <article className="list-card" key={summary.id}><div><h3>{summary.period_start} a {summary.period_end}</h3><p className="muted">{summary.payload.classes} clases · {summary.payload.attendance} asistencias · {summary.payload.uniqueAttendees} kenshis</p></div><span className="tag">Telegram: {delivery?.status ?? "pendiente"}</span></article>; })}</div></section>
  </main></div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <article className="card"><h2>{label}</h2><div className="metric">{value}</div></article>; }

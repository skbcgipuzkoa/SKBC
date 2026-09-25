import { LogOut, UserRoundCheck } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { convertProvisionalMemberAction, logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export default async function ProvisionalesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const query = await searchParams;
  const supabase = createAdminClient();
  const [{ data: provisionals }, { data: attendance }, { data: members }] = await Promise.all([
    supabase.from("provisional_members").select("id,display_name,class,status,converted_at,created_at,converted_member_id").order("created_at", { ascending: false }),
    supabase.from("provisional_attendance").select("provisional_member_id,attended_on"),
    supabase.from("members").select("id,display_name,class,legacy_id").eq("status", "active").order("display_name")
  ]);
  const rows = provisionals ?? [];
  const datesByProvisional = new Map<string, string[]>();
  for (const item of attendance ?? []) datesByProvisional.set(item.provisional_member_id, [...(datesByProvisional.get(item.provisional_member_id) ?? []), item.attended_on]);

  return <div className="shell">
    <SidebarNav current="/provisionales" />
    <main className="main">
      <div className="topbar"><div><p className="eyebrow">Seguimiento</p><h1>Invitados provisionales</h1></div><form action={logoutAction}><button className="icon-button" aria-label="Salir"><LogOut size={18} /></button></form></div>
      {query.saved ? <p className="save-ok">Invitado convertido. Sus asistencias ya pertenecen al kenshi.</p> : null}
      {query.error ? <p className="save-error">No se ha podido completar la conversion.</p> : null}
      <section className="card"><h2>Pendientes</h2><p className="muted">Completa su ficha sin perder las clases que ya han recibido.</p>
        <div className="stack-list">{rows.filter((row) => row.status === "pending").map((row) => {
          const dates = (datesByProvisional.get(row.id) ?? []).sort();
          return <article className="list-card" key={row.id}><div><span className="tag">{row.class === "kids" ? "Ninos" : "Adultos"}</span><h3>{row.display_name}</h3><p className="muted">{dates.length} clase{dates.length === 1 ? "" : "s"}{dates.length ? ` · ultima ${dates.at(-1)}` : ""}</p></div>
            <form action={convertProvisionalMemberAction} className="inline-form"><input type="hidden" name="provisionalId" value={row.id} /><label>Convertir en kenshi<select name="memberId" required defaultValue=""><option value="" disabled>Selecciona kenshi...</option>{(members ?? []).filter((member) => member.class === row.class).map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select></label><button className="primary-link" type="submit"><UserRoundCheck size={16} /> Convertir</button></form>
          </article>;
        })}{!rows.some((row) => row.status === "pending") ? <p className="muted">No hay invitados pendientes.</p> : null}</div>
      </section>
      <section className="card"><h2>Convertidos</h2><div className="stack-list">{rows.filter((row) => row.status === "converted").slice(0, 30).map((row) => <article className="list-card" key={row.id}><div><h3>{row.display_name}</h3><p className="muted">Convertido el {row.converted_at?.slice(0, 10) ?? "-"}</p></div></article>)}</div></section>
    </main>
  </div>;
}

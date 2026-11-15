import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { driveImageUrl } from "@/lib/drive";
import { redirect } from "next/navigation";

const good = ["EXCELENTE", "MUY BUENA", "BUENA", "NORMAL", "A MEJORAR"];
const behaviorFields = [
  { name: "attitude", label: "Actitud", options: good },
  { name: "attention", label: "Atención", options: good },
  { name: "respect", label: "Respeto", options: ["10", "9", "8", "7", "BUENO", "NORMAL", "A MEJORAR"] },
  { name: "effort", label: "Esfuerzo", options: ["EXCELENTE", "MUY BUENO", "BUENO", "POCO A POCO MEJORANDO", "A MEJORAR"] },
  { name: "companionship", label: "Compañerismo", options: good }
] as const;
const path = "/kenshis/notas-de-clase";

function todayInMadrid() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
}

async function save(memberId: string, form: FormData) {
  "use server";
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const date = form.get("mode") === "schedule" ? String(form.get("date") ?? "") : todayInMadrid();
  const note = String(form.get("note") ?? "").trim();
  const behavior = Object.fromEntries([...behaviorFields.map(field => field.name), "observation"]
    .map(name => [name, String(form.get(name) ?? "").trim() || null]));
  if (!note || !/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect(`${path}?error=1#${memberId}`);
  const { error } = await createAdminClient().rpc("publish_class_notes", {
    p_member: memberId, p_date: date, p_note: note, p_behavior: behavior
  });
  redirect(`${path}?${error ? "error=1" : "saved=1"}#${memberId}`);
}

export default async function ClassNotes({ searchParams }: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const { saved, error } = await searchParams;
  const db = createAdminClient();
  const today = todayInMadrid();
  const { data: members, error: memberError } = await db.from("members")
    .select("id,display_name,photo_url").eq("class", "kids").eq("status", "active").order("display_name");
  if (memberError) throw memberError;
  const children = await Promise.all(members.map(async member => {
    const [note, behavior] = await Promise.all([
      db.from("child_notes").select("note,note_date,legacy_id,updated_at")
        .eq("member_id", member.id).eq("visible_family", true)
        .order("note_date", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("child_behavior_reports").select("attitude,attention,respect,effort,companionship,observation,updated_at")
        .eq("member_id", member.id)
        .order("report_date", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false }).limit(1).maybeSingle()
    ]);
    if (note.error || behavior.error) throw note.error ?? behavior.error;
    return { member, note: note.data, behavior: behavior.data };
  }));

  return <main className="main">
    <div className="topbar"><h1>Notas de clase</h1><a className="secondary-link" href="/kenshis">Volver a Kenshis</a></div>
    {error && <p role="alert">No se pudo guardar. Revisa la nota y la fecha de publicación.</p>}
    {saved && <p role="status">Cambios guardados.</p>}
    {!children.length && <p>No hay niños activos.</p>}
    {children.map(({ member, note, behavior }) => {
      const photo = driveImageUrl(member.photo_url);
      const scheduled = note?.legacy_id?.startsWith("CLASS-NOTES-") && note.note_date && note.note_date > today ? note.note_date : null;
      const updated = [note?.updated_at, behavior?.updated_at].filter((value): value is string => Boolean(value)).sort().at(-1);
      return <details className="card maintenance-panel" key={member.id} id={member.id}>
        <summary>
          {photo && <img className="mini-avatar" src={photo} alt="" />}
          {" "}{member.display_name} · {scheduled ? `Programada para el ${scheduled.split("-").reverse().join("/")}` : "Publicada"}
          {" · "}Última modificación {updated ? new Date(updated).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" }) : "—"}
        </summary>
        <form className="edit-form" action={save.bind(null, member.id)}>
          <label>Nota del sensei<textarea name="note" defaultValue={note?.note ?? ""} rows={4} required /></label>
          <fieldset>
            <legend>Comportamiento en clase</legend>
            <div className="form-grid">{behaviorFields.map(({ name, label, options }) => {
              const value = behavior?.[name] ?? "";
              return <label key={name}>{label}<select name={name} defaultValue={value}>
                <option value="">—</option>
                {value && !options.some(option => option === value) && <option>{value}</option>}
                {options.map(option => <option key={option}>{option}</option>)}
              </select></label>;
            })}</div>
            <label>Observación<textarea name="observation" defaultValue={behavior?.observation ?? ""} rows={3} /></label>
          </fieldset>
          <label>Fecha de publicación<input type="date" name="date" min={today} defaultValue={scheduled ?? ""} /></label>
          <div className="form-actions">
            <button name="mode" value="now">Publicar ahora</button>
            <button name="mode" value="schedule">Programar publicación</button>
          </div>
        </form>
      </details>;
    })}
  </main>;
}

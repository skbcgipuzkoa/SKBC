import { redirect } from "next/navigation";
import { ClassVisitorPicker } from "./class-visitor-picker";
import { requireDojo } from "@/lib/dojo-access";
import { prepareVisitorPlan } from "@/lib/visitor-plan";
import { withIndividualWorkSnapshot } from "@/lib/individual-work-snapshot";

async function add(host: string, classId: string, group: string, back: string, planning: boolean, form: FormData) {
  "use server";
  const { db } = await requireDojo(host, true);
  const members = [...new Set(form.getAll("member").map(String))];
  let error: unknown = null;
  let planFailed = false;
  try {
    const { data: session, error: classError } = await db.from("classes").select("id")
      .eq("id", classId).eq("dojo_slug", host).eq("closed", false).eq("status", "pending").maybeSingle();
    if (classError || !session || !members.length) throw classError ?? new Error("Clase o selección no disponible.");
    await withIndividualWorkSnapshot(classId, async () => {
      const result = await db.rpc(planning ? "plan_class_visitors" : "add_class_visitors", {
        p_host: host, p_class: classId, p_origin: String(form.get("origin") ?? ""), p_members: members
      });
      if (result.error) throw result.error;
      if (!planning && group === "adults") {
        try { await prepareVisitorPlan(host, classId, true); }
        catch (cause) {
          console.error("Error extending visitor plan", cause);
          planFailed = true;
        }
      }
    });
  } catch (cause) { error = cause; }
  const url = new URL(back, "https://skbc.vercel.app");
  url.searchParams.delete("saved");
  url.searchParams.delete("error");
  if (error || planFailed) url.searchParams.set("error", planFailed ? "visitor-plan" : "visitors");
  else url.searchParams.set("saved", "visitors");
  redirect(url.pathname + url.search + url.hash);
}

export async function ClassVisitorForm({ host, classId, group, returnTo, planning = false }: {
  host: string; classId: string; group: string; returnTo: string; planning?: boolean;
}) {
  const { db } = await requireDojo(host);
  const [dojos, members, attendance] = await Promise.all([
    db.from("dojos").select("slug,name").is("archived_at", null).neq("slug", host).order("name"),
    db.from("dojo_memberships").select("dojo_slug,member_id,members!inner(display_name,class)")
      .neq("dojo_slug", host).eq("status", "active").eq("members.class", group)
      .returns<{ dojo_slug: string; member_id: string; members: { display_name: string } }[]>(),
    db.from("attendance_logs").select("member_id").eq("class_id", classId)
  ]);
  if (dojos.error || members.error || attendance.error) throw new Error("No se pudieron cargar los visitantes.");
  const present = new Set(attendance.data.map(row => row.member_id));
  const groups = dojos.data.map(dojo => ({
    ...dojo,
    members: members.data.filter(row => row.dojo_slug === dojo.slug && !present.has(row.member_id))
      .map(row => ({ id: row.member_id, name: row.members.display_name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
  }));
  return <ClassVisitorPicker groups={groups} action={add.bind(null, host, classId, group, returnTo, planning)} />;
}

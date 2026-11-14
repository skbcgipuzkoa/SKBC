import { redirect } from "next/navigation";
import { ClassVisitorPicker } from "./class-visitor-picker";
import { requireDojo } from "@/lib/dojo-access";

async function add(host: string, classId: string, back: string, form: FormData) {
  "use server";
  const { db } = await requireDojo(host, true);
  const members = [...new Set(form.getAll("member").map(String))];
  const { error } = await db.rpc("add_class_visitors", {
    p_host: host, p_class: classId, p_origin: String(form.get("origin") ?? ""), p_members: members
  });
  const url = new URL(back, "https://skbc.vercel.app");
  url.searchParams.set(error || !members.length ? "error" : "saved", "visitors");
  redirect(url.pathname + url.search + url.hash);
}

export async function ClassVisitorForm({ host, classId, group, returnTo }: {
  host: string; classId: string; group: string; returnTo: string;
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
  return <ClassVisitorPicker groups={groups} action={add.bind(null, host, classId, returnTo)} />;
}

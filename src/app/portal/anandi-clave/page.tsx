import { redirect } from "next/navigation";
import { hasAnandiAccess, readAnandiAccess, setAnandiCredentials } from "@/lib/anandi-auth";
import { requireDojo } from "@/lib/dojo-access";

const path = "/portal/anandi-clave";

async function save(form: FormData) {
  "use server";
  await requireDojo("anandi", true);
  const password = String(form.get("password") ?? "");
  const disable = form.get("mode") === "disable";
  const valid = (disable || password === form.get("confirm")) &&
    await setAnandiCredentials(String(form.get("username") ?? ""), password, String(form.get("current") ?? ""), disable);
  redirect(path + (valid ? "?saved=1" : "?error=1"));
}

export default async function AccessSettings({ searchParams }: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  if (!(await hasAnandiAccess())) redirect("/portal/acceso");
  await requireDojo("anandi");
  const access = await readAnandiAccess();
  const { error, saved } = await searchParams;
  return <main className="main">
    <a href="/portal/anandi">Volver a Anandi</a>
    <h1>Credenciales de Anandi</h1>
    {error && <p role="alert">Revisa el usuario y las contraseñas.</p>}
    {saved && <p role="status">Acceso actualizado.</p>}
    <form action={save} className="filters">
      {access?.username && <label>Contraseña actual <input name="current" type="password" required maxLength={256} /></label>}
      <label>Usuario <input name="username" defaultValue={access?.username ?? ""} required minLength={2} maxLength={40} /></label>
      <label>Contraseña nueva <input name="password" type="password" required minLength={8} maxLength={256} /></label>
      <label>Repetir contraseña <input name="confirm" type="password" required minLength={8} maxLength={256} /></label>
      <button>Guardar credenciales</button>
      {access?.username && <button name="mode" value="disable" formNoValidate>Entrar solo con el enlace</button>}
    </form>
  </main>;
}

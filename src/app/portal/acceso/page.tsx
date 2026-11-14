import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function login(form: FormData) {
  "use server";
  const slug = String(form.get("dojo") ?? "");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) redirect("/portal/acceso?error=1");
  const client = await createClient();
  const { error } = await client.auth.signInWithPassword({
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? "")
  });
  if (error) redirect(`/portal/acceso?dojo=${slug}&error=1`);
  redirect(`/portal/${slug}`);
}

export default async function PortalLogin({ searchParams }: {
  searchParams: Promise<{ dojo?: string; error?: string }>;
}) {
  const { dojo, error } = await searchParams;
  return (
    <main className="main">
      <h1>Acceso del sensei</h1>
      {error && <p role="alert">Revisa los datos de acceso.</p>}
      <form action={login} className="filters">
        <label>Dojo <input name="dojo" required defaultValue={dojo ?? "anandi"} /></label>
        <label>Correo <input name="email" type="email" required autoComplete="username" /></label>
        <label>Contraseña <input name="password" type="password" required autoComplete="current-password" /></label>
        <button className="primary-link">Entrar</button>
      </form>
    </main>
  );
}

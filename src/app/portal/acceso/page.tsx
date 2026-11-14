import { redirect } from "next/navigation";
import { grantAnandiAccess } from "@/lib/anandi-auth";

async function login(form: FormData) {
  "use server";
  if (!(await grantAnandiAccess(String(form.get("password") ?? "")))) {
    redirect("/portal/acceso?error=1");
  }
  redirect("/portal/anandi");
}

export default async function PortalLogin({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="main">
      <h1>Acceso al dojo de Anandi</h1>
      {error && <p role="alert">No se pudo iniciar sesión. Revisa la contraseña.</p>}
      <form action={login} className="filters">
        <label>Contraseña <input name="password" type="password" required autoComplete="current-password" /></label>
        <button className="primary-link">Entrar</button>
      </form>
    </main>
  );
}

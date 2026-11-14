import { redirect } from "next/navigation";
import { enterAnandi } from "@/lib/anandi-auth";

async function login(token: string, form: FormData) {
  "use server";
  const result = await enterAnandi(token, String(form.get("username") ?? ""), String(form.get("password") ?? ""));
  if (result === "ok") redirect("/portal/anandi");
  if (result === "invalid") redirect("/portal/acceso");
  redirect(`/portal/acceso?enlace=${token}&error=${result}`);
}

export default async function PortalLogin({ searchParams }: {
  searchParams: Promise<{ enlace?: string; error?: string }>;
}) {
  const { enlace, error } = await searchParams;
  const token = enlace ?? "";
  return <main className="main">
    <h1>Acceso a Anandi</h1>
    {error && <p role="alert">{error === "limited" ? "Espera unos minutos y vuelve a intentarlo." : "Revisa el usuario y la contraseña."}</p>}
    {/^[a-f0-9]{64}$/.test(token) ? <form action={login.bind(null, token)}>
      <label>Usuario <input name="username" autoComplete="username" /></label>
      <label>Contraseña <input name="password" type="password" autoComplete="current-password" /></label>
      <button>Entrar</button>
    </form> : <p>Abre el enlace privado que te dio el administrador.</p>}
  </main>;
}

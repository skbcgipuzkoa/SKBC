import { CalendarCheck, GraduationCap, LockKeyhole, Trophy, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";

const stats = [
  { label: "Alumnos", value: "46", icon: Users },
  { label: "Tecnicas adultos", value: "500+", icon: GraduationCap },
  { label: "Pestanas legacy", value: "48", icon: CalendarCheck },
  { label: "Migracion", value: "Fase 1", icon: Trophy }
];

const workflows = [
  {
    title: "Dia de clase",
    body: "Crear clase, generar plan tecnico, pasar asistencia, marcar tecnicas y cerrar clase."
  },
  {
    title: "Ficha del alumno",
    body: "Portal personal con actividad, progreso tecnico, pendientes, examenes y cursos."
  },
  {
    title: "Automatizaciones",
    body: "Rankings, hitos, diplomas, PDFs, cache de fichas y archivado controlado."
  }
];

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await hasInternalAccess()) {
    redirect("/kenshis");
  }

  const params = await searchParams;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Plataforma paralela</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a aria-current="page" href="/">
            Panel
          </a>
          <a href="/kenshis">Kenshis</a>
          <a href="/clases">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/auditoria">Auditoria</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Nuevo sistema Vercel + Supabase</p>
            <h1>Panel interno privado para SKBC Gipuzkoa</h1>
          </div>
          <span className="status">Legacy intacto</span>
        </div>

        <section className="login-panel">
          <div>
            <LockKeyhole aria-hidden="true" size={22} />
            <h2>Acceso admin e instructores</h2>
            <p className="muted">
              Los alumnos siguen usando sus fichas actuales. Este panel es solo para gestion interna.
            </p>
          </div>
          <form action={loginAction} className="login-form">
            <label htmlFor="code">Codigo interno</label>
            <div className="login-row">
              <input id="code" name="code" type="password" autoComplete="current-password" required />
              <button type="submit">Entrar</button>
            </div>
            {params.error ? <p className="form-error">Codigo incorrecto.</p> : null}
          </form>
        </section>

        <section className="grid stats" aria-label="Resumen">
          {stats.map((item) => {
            const Icon = item.icon;
            return (
              <article className="card" key={item.label}>
                <Icon aria-hidden="true" size={20} />
                <h2>{item.label}</h2>
                <div className="metric">{item.value}</div>
              </article>
            );
          })}
        </section>

        <h2 className="section-title">Flujos a replicar</h2>
        <section className="grid workflow">
          {workflows.map((item) => (
            <article className="card" key={item.title}>
              <span className="tag">Legacy auditado</span>
              <h2>{item.title}</h2>
              <p className="muted">{item.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

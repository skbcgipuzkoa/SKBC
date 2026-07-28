import { CalendarCheck, GraduationCap, Trophy, Users } from "lucide-react";

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

export default function Home() {
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
          <a href="/alumnos">Alumnos</a>
          <a href="/clases">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Nuevo sistema Vercel + Supabase</p>
            <h1>Base inicial para migrar SKBC sin tocar el sistema actual</h1>
          </div>
          <span className="status">Legacy intacto</span>
        </div>

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

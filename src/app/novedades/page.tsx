import { CheckCircle2, LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";

const novedades = [
  {
    title: "Plan tecnico adulto",
    body: "Desde una clase adulta sin plan puedes generar el plan tecnico con reglas replicadas del motor legacy.",
    href: "/clases"
  },
  {
    title: "Marcado de tecnicas realizadas",
    body: "En el detalle de una clase puedes marcar cada tecnica del plan como realizada o no realizada.",
    href: "/clases"
  },
  {
    title: "Cierre de clase adulta",
    body: "Al cerrar una clase se generan asignaciones, historial tecnico del dojo e historial tecnico por kenshi en Supabase nuevo.",
    href: "/clases"
  },
  {
    title: "Importacion visible",
    body: "Nueva pantalla con estado de hojas legacy, filas importadas y tablas normalizadas.",
    href: "/importacion"
  },
  {
    title: "Fichas infantiles normalizadas",
    body: "Ranking, notas, avisos, comportamiento y cache infantil ya estan en tablas nuevas.",
    href: "/kenshis?class=kids"
  }
];

export default async function NovedadesPage() {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/kenshis">Kenshis</a>
          <a href="/clases">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/examenes">Examenes</a>
          <a href="/cursos">Cursos</a>
          <a href="/pedidos-cinturones">Cinturones</a>
          <a href="/proximos-examenes">Proximos examenes</a>
          <a href="/rankings">Rankings</a>
          <a href="/auditoria">Auditoria</a>
          <a href="/importacion">Importacion</a>
          <a href="/novedades" aria-current="page">Novedades</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Ultimos bloques incorporados</p>
            <h1>Novedades</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className="grid workflow">
          {novedades.map((item) => (
            <article className="card" key={item.title}>
              <CheckCircle2 aria-hidden="true" size={20} />
              <h2>{item.title}</h2>
              <p className="muted">{item.body}</p>
              <a className="text-link" href={item.href}>Abrir</a>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

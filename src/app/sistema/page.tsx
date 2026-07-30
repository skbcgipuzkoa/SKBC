import { Activity, Database, LogOut, Newspaper } from "lucide-react";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";

const systemItems = [
  {
    title: "Auditoria",
    body: "Control del modo paralelo, sincronizacion con el archivo viejo, fallos y revisiones internas.",
    href: "/auditoria",
    icon: Activity
  },
  {
    title: "Importacion",
    body: "Estado de hojas legacy importadas, filas copiadas y datos normalizados desde el archivo viejo.",
    href: "/importacion",
    icon: Database
  },
  {
    title: "Novedades",
    body: "Resumen de bloques incorporados al sistema nuevo durante la construccion.",
    href: "/novedades",
    icon: Newspaper
  }
];

export default async function SistemaPage() {
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
          <a href="/sistema" aria-current="page">Sistema</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Herramientas internas</p>
            <h1>Sistema</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className="grid workflow">
          {systemItems.map((item) => {
            const Icon = item.icon;
            return (
              <a className="card system-card" href={item.href} key={item.title}>
                <Icon aria-hidden="true" size={22} />
                <h2>{item.title}</h2>
                <p className="muted">{item.body}</p>
                <span className="text-link">Abrir</span>
              </a>
            );
          })}
        </section>
      </main>
    </div>
  );
}

import {
  BarChart3,
  CalendarCheck,
  GraduationCap,
  KeyRound,
  LockKeyhole,
  Medal,
  NotebookTabs,
  ShieldCheck,
  Trophy,
  UserPlus,
  Users
} from "lucide-react";
import { loginAction, logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type ClassPreview = {
  legacy_id: string | null;
  class_date: string;
  name: string;
  class_group: "kids" | "adults";
  closed: boolean;
  plan_generated: boolean;
};

const moduleGroups = [
  {
    title: "Trabajo diario",
    items: [
      { label: "Nueva clase", href: "/clases/nueva", icon: CalendarCheck, tone: "primary" },
      { label: "Calendario", href: "/clases", icon: NotebookTabs },
      { label: "Kenshis", href: "/kenshis", icon: Users },
      { label: "Nuevo kenshi", href: "/kenshis/nuevo", icon: UserPlus }
    ]
  },
  {
    title: "Seguimiento",
    items: [
      { label: "Proximos examenes", href: "/proximos-examenes", icon: Medal },
      { label: "Examenes", href: "/examenes", icon: GraduationCap },
      { label: "Rankings", href: "/rankings", icon: Trophy },
      { label: "Cursos", href: "/cursos", icon: BarChart3 }
    ]
  },
  {
    title: "Sistema",
    items: [
      { label: "Tecnicas", href: "/tecnicas", icon: GraduationCap },
      { label: "Cinturones", href: "/pedidos-cinturones", icon: Medal },
      { label: "Sistema", href: "/sistema", icon: ShieldCheck }
    ]
  }
];

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [isAuthed, params] = await Promise.all([hasInternalAccess(), searchParams]);
  if (!isAuthed) return <LoginHome error={params.error} />;

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const [
    { count: activeMembers },
    { count: adultMembers },
    { count: kidsMembers },
    { count: openClasses },
    { data: todayClasses },
    { data: nextClasses }
  ] = await Promise.all([
    supabase.from("members").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("status", "active").eq("class", "adults"),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("status", "active").eq("class", "kids"),
    supabase.from("classes").select("id", { count: "exact", head: true }).eq("closed", false),
    supabase
      .from("classes")
      .select("legacy_id,class_date,name,class_group,closed,plan_generated")
      .eq("class_date", today)
      .order("name")
      .returns<ClassPreview[]>(),
    supabase
      .from("classes")
      .select("legacy_id,class_date,name,class_group,closed,plan_generated")
      .gte("class_date", today)
      .order("class_date")
      .limit(5)
      .returns<ClassPreview[]>()
  ]);

  const stats = [
    { label: "Activos", value: activeMembers ?? 0, icon: Users },
    { label: "Adultos", value: adultMembers ?? 0, icon: GraduationCap },
    { label: "Ninos", value: kidsMembers ?? 0, icon: Users },
    { label: "Abiertas", value: openClasses ?? 0, icon: CalendarCheck }
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/" aria-current="page">Inicio</a>
          <a href="/kenshis">Kenshis</a>
          <a href="/clases">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/examenes">Examenes</a>
          <a href="/cursos">Cursos</a>
          <a href="/proximos-examenes">Examenes prox.</a>
          <a href="/rankings">Rankings</a>
          <a href="/sistema">Sistema</a>
        </nav>
      </aside>
      <main className="main home-main">
        <div className="topbar home-topbar">
          <div>
            <p className="eyebrow">Panel operativo</p>
            <h1>Inicio SKBC</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <KeyRound aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className="home-hero-panel">
          <div>
            <span className="tag">Hoy</span>
            <h2>{todayClasses?.length ? "Hay clase registrada para hoy" : "No hay clase creada para hoy"}</h2>
            <p className="muted">
              Accede rapido a la clase del dia o crea una nueva. El sistema antiguo sigue intacto.
            </p>
          </div>
          <div className="home-hero-actions">
            <a className="primary-link" href="/clases/nueva">Nueva clase</a>
            <a className="primary-link secondary-link" href="/clases">Ver calendario</a>
          </div>
        </section>

        <section className="grid stats home-stats" aria-label="Resumen">
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

        <section className="home-grid">
          <article className="card home-focus-card">
            <h2>Clase de hoy</h2>
            <div className="home-class-list">
              {todayClasses?.length ? todayClasses.map((clase) => (
                <a className="home-class-row" href={`/clases/${clase.legacy_id}`} key={clase.legacy_id ?? clase.name}>
                  <span>
                    <strong>{clase.name}</strong>
                    <small>{clase.class_group === "kids" ? "Ninos" : "Adultos"} - {clase.closed ? "Cerrada" : "Abierta"}</small>
                  </span>
                  <b>{clase.plan_generated || clase.class_group === "kids" ? "Lista" : "Plan pendiente"}</b>
                </a>
              )) : (
                <div className="home-empty">
                  <p className="muted">Crea una clase si hoy hay entrenamiento.</p>
                  <a className="text-link" href="/clases/nueva">Crear clase</a>
                </div>
              )}
            </div>
          </article>

          <article className="card home-focus-card">
            <h2>Proximas clases</h2>
            <div className="home-class-list">
              {nextClasses?.length ? nextClasses.map((clase) => (
                <a className="home-class-row" href={`/clases/${clase.legacy_id}`} key={`next-${clase.legacy_id ?? clase.name}`}>
                  <span>
                    <strong>{clase.name}</strong>
                    <small>{clase.class_date} - {clase.class_group === "kids" ? "Ninos" : "Adultos"}</small>
                  </span>
                  <b>{clase.closed ? "Cerrada" : "Abrir"}</b>
                </a>
              )) : <p className="muted">No hay clases proximas.</p>}
            </div>
          </article>
        </section>

        <section className="home-modules" aria-label="Accesos por tarea">
          {moduleGroups.map((group) => (
            <article className="home-module-group" key={group.title}>
              <h2>{group.title}</h2>
              <div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <a className={item.tone === "primary" ? "home-module-link primary" : "home-module-link"} href={item.href} key={item.href}>
                      <Icon aria-hidden="true" size={18} />
                      <span>{item.label}</span>
                    </a>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

function LoginHome({ error }: { error?: string }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Plataforma paralela</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a aria-current="page" href="/">Panel</a>
          <a href="/kenshis">Kenshis</a>
          <a href="/clases">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/sistema">Sistema</a>
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
            <div className="official-lockup">
              <img src="/skbc-icon.png" alt="SKBC Gipuzkoa" />
              <LockKeyhole aria-hidden="true" size={22} />
            </div>
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
            {error ? <p className="form-error">Codigo incorrecto.</p> : null}
          </form>
        </section>
      </main>
    </div>
  );
}

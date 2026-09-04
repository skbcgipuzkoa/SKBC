import {
  BarChart3,
  CalendarCheck,
  ClipboardCheck,
  GraduationCap,
  KeyRound,
  LockKeyhole,
  Medal,
  NotebookTabs,
  PackageCheck,
  SquareArrowOutUpRight,
  ShieldCheck,
  Sparkles,
  Bell,
  Trophy,
  UserPlus,
  Users
} from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { PasswordField } from "@/app/components/PasswordField";
import { loginAction, logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LucideIcon } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type ClassPreview = {
  legacy_id: string | null;
  class_date: string;
  name: string;
  class_group: "kids" | "adults";
  closed: boolean;
  plan_generated: boolean;
};

type ExamAlert = {
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
  semaphore: string | null;
  exam_notice: string | null;
};

type ModuleLink = {
  label: string;
  href: string;
  icon: LucideIcon;
  tone?: "primary";
  external?: boolean;
};

const moduleGroups: Array<{ title: string; items: ModuleLink[] }> = [
  {
    title: "Trabajo diario",
    items: [
      { label: "Nueva clase", href: "/clases/nueva", icon: CalendarCheck, tone: "primary" },
      { label: "Sustituto", href: "/clases/nueva?delegado=1", icon: ShieldCheck, tone: "primary" },
      { label: "Control del dia", href: "/control-dia", icon: ClipboardCheck, tone: "primary" },
      { label: "Calendario", href: "/clases", icon: NotebookTabs },
      { label: "Clases Busen", href: "/clases-negras", icon: ShieldCheck },
      { label: "Shakujo", href: "/shakujo", icon: Sparkles },
      { label: "Entregas", href: "/entregas", icon: PackageCheck },
      { label: "Kenshis", href: "/kenshis", icon: Users },
      { label: "Nuevo kenshi", href: "/kenshis/nuevo", icon: UserPlus }
    ]
  },
  {
    title: "Seguimiento",
    items: [
      { label: "Proximos examenes", href: "/proximos-examenes", icon: Medal },
      { label: "Examenes", href: "/examenes", icon: GraduationCap },
      { label: "App examenes", href: "https://akapi80.github.io/EXAMENES/", icon: SquareArrowOutUpRight, external: true },
      { label: "Rankings", href: "/rankings", icon: Trophy },
      { label: "Cursos", href: "/cursos", icon: BarChart3 }
    ]
  },
  {
    title: "Sistema",
    items: [
      { label: "Tecnicas", href: "/tecnicas", icon: GraduationCap },
      { label: "Cinturones", href: "/pedidos-cinturones", icon: Medal },
      { label: "Calendario club", href: "/calendario", icon: CalendarCheck },
      { label: "Notificaciones", href: "/notificaciones", icon: Bell },
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
  if (!isAuthed) {
    const cookieStore = await cookies();
    const studentReturn = safeStudentFichaReturn(cookieStore.get("skbc_student_ficha_return")?.value);
    if (studentReturn && !params.error) redirect(studentReturn);
    return <PublicHome />;
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const [
    { count: activeMembers },
    { count: adultMembers },
    { count: kidsMembers },
    { data: openClasses },
    { data: todayClasses },
    { data: nextClasses },
    { data: pendingPlanClasses },
    { data: urgentExamMembers }
  ] = await Promise.all([
    supabase.from("members").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("status", "active").eq("class", "adults"),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("status", "active").eq("class", "kids"),
    supabase
      .from("classes")
      .select("legacy_id,class_date,name,class_group,closed,plan_generated")
      .eq("closed", false)
      .returns<ClassPreview[]>(),
    supabase
      .from("classes")
      .select("legacy_id,class_date,name,class_group,closed,plan_generated")
      .eq("class_date", today)
      .order("name")
      .returns<ClassPreview[]>(),
    supabase
      .from("classes")
      .select("legacy_id,class_date,name,class_group,closed,plan_generated")
      .eq("closed", false)
      .gt("class_date", today)
      .order("class_date")
      .limit(5)
      .returns<ClassPreview[]>(),
    supabase
      .from("classes")
      .select("legacy_id,class_date,name,class_group,closed,plan_generated")
      .eq("closed", false)
      .eq("class_group", "adults")
      .eq("plan_generated", false)
      .order("class_date")
      .limit(5)
      .returns<ClassPreview[]>(),
    supabase
      .from("members")
      .select("legacy_id,display_name,class,grade,semaphore,exam_notice")
      .eq("status", "active")
      .in("semaphore", ["ROJO", "VERDE"])
      .order("class")
      .order("display_name")
      .limit(6)
      .returns<ExamAlert[]>()
  ]);

  const todayDisplayClasses = mergeCombinedClassPreviews(todayClasses ?? []);
  const nextDisplayClasses = mergeCombinedClassPreviews(nextClasses ?? []);
  const openDisplayClasses = mergeCombinedClassPreviews(openClasses ?? []);

  const stats = [
    { label: "Activos", value: activeMembers ?? 0, icon: Users },
    { label: "Adultos", value: adultMembers ?? 0, icon: GraduationCap },
    { label: "Ninos", value: kidsMembers ?? 0, icon: Users },
    { label: "Abiertas", value: openDisplayClasses.length, icon: CalendarCheck }
  ];

  return (
    <div className="shell">
      <SidebarNav current="/" />
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
            <h2>{todayDisplayClasses.length ? "Hay clase registrada para hoy" : "No hay clase creada para hoy"}</h2>
            <p className="muted">
              Accede rapido a la clase del dia o crea una nueva. El sistema antiguo sigue intacto.
            </p>
          </div>
          <div className="home-hero-actions">
            <a className="primary-link" href="/clases/nueva">Nueva clase</a>
            <a className="primary-link secondary-link" href="/clases/nueva?delegado=1">Modo sustituto</a>
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
              {todayDisplayClasses.length ? todayDisplayClasses.map((clase) => (
                <a className="home-class-row" href={`/clases/${clase.legacy_id}`} key={clase.legacy_id ?? clase.name}>
                  <span>
                    <strong>{clase.name}</strong>
                    <small>{clase.display_group === "combined" ? "Adultos + ninos" : clase.class_group === "kids" ? "Ninos" : "Adultos"} - {clase.closed ? "Cerrada" : "Abierta"}</small>
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
              {nextDisplayClasses.length ? nextDisplayClasses.map((clase) => (
                <a className="home-class-row" href={`/clases/${clase.legacy_id}`} key={`next-${clase.legacy_id ?? clase.name}`}>
                  <span>
                    <strong>{clase.name}</strong>
                    <small>{clase.class_date} - {clase.display_group === "combined" ? "Adultos + ninos" : clase.class_group === "kids" ? "Ninos" : "Adultos"}</small>
                  </span>
                  <b>{clase.closed ? "Cerrada" : "Abrir"}</b>
                </a>
              )) : <p className="muted">No hay clases proximas.</p>}
            </div>
          </article>
        </section>

        <section className="card home-pending-card">
          <div className="section-heading-row">
            <div>
              <h2>Pendientes importantes</h2>
              <p className="muted">Atajos para lo que puede necesitar accion antes de navegar por menus.</p>
            </div>
            <a className="secondary-link" href="/proximos-examenes">Ver examenes</a>
          </div>
          <div className="home-pending-grid">
            <div>
              <h3>Planes tecnicos pendientes</h3>
              <div className="home-class-list">
                {pendingPlanClasses?.length ? pendingPlanClasses.map((clase) => (
                  <a className="home-class-row warning" href={`/clases/${clase.legacy_id}`} key={`pending-${clase.legacy_id ?? clase.name}`}>
                    <span>
                      <strong>{clase.name}</strong>
                      <small>{clase.class_date} - Adultos</small>
                    </span>
                    <b>Preparar</b>
                  </a>
                )) : <p className="muted">No hay planes adultos pendientes.</p>}
              </div>
            </div>
            <div>
              <h3>Examenes con aviso</h3>
              <div className="home-class-list">
                {urgentExamMembers?.length ? urgentExamMembers.map((member) => (
                  <a className={`home-class-row ${member.semaphore === "ROJO" ? "danger" : "ready"}`} href={member.legacy_id ? `/kenshis/${member.legacy_id}` : "/proximos-examenes"} key={`exam-${member.legacy_id ?? member.display_name}`}>
                    <span>
                      <strong>{member.display_name}</strong>
                      <small>{member.class === "kids" ? "Ninos" : "Adultos"} - {member.grade ?? "Sin grado"}</small>
                    </span>
                    <b>{member.semaphore ?? "-"}</b>
                  </a>
                )) : <p className="muted">No hay avisos urgentes.</p>}
              </div>
            </div>
          </div>
        </section>

        <section className="home-modules" aria-label="Accesos por tarea">
          {moduleGroups.map((group) => (
            <article className="home-module-group" key={group.title}>
              <h2>{group.title}</h2>
              <div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <a
                      className={item.tone === "primary" ? "home-module-link primary" : "home-module-link"}
                      href={item.href}
                      key={item.href}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noopener noreferrer external" : undefined}
                    >
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

type ClassPreviewDisplay = ClassPreview & {
  display_group: "kids" | "adults" | "combined";
};

function mergeCombinedClassPreviews(classes: ClassPreview[]): ClassPreviewDisplay[] {
  const byDate = new Map<string, ClassPreview[]>();
  classes.forEach((clase) => {
    const current = byDate.get(clase.class_date) ?? [];
    current.push(clase);
    byDate.set(clase.class_date, current);
  });

  const merged: ClassPreviewDisplay[] = [];
  for (const [, dayClasses] of byDate.entries()) {
    const adults = dayClasses.filter((clase) => clase.class_group === "adults");
    const kids = dayClasses.filter((clase) => clase.class_group === "kids");
    const usedKids = new Set<ClassPreview>();

    adults.forEach((adult) => {
      const companion = kids.find((kid) => !usedKids.has(kid) && sameCombinedClass(adult, kid));
      if (companion) {
        usedKids.add(companion);
        merged.push({
          ...adult,
          name: combinedClassName(adult, companion),
          closed: adult.closed && companion.closed,
          display_group: "combined"
        });
      } else {
        merged.push({ ...adult, display_group: "adults" });
      }
    });

    kids.filter((kid) => !usedKids.has(kid)).forEach((kid) => merged.push({ ...kid, display_group: "kids" }));
  }

  return merged.sort((a, b) => a.class_date.localeCompare(b.class_date));
}

function sameCombinedClass(adults: ClassPreview, kids: ClassPreview) {
  if (adults.class_date !== kids.class_date) return false;
  const adultName = normalizeClassName(adults.name);
  const kidName = normalizeClassName(kids.name);
  return adultName === kidName || kidName === `${adultName} ninos` || kidName === `${adultName} niños`;
}

function normalizeClassName(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function combinedClassName(adults: ClassPreview, kids: ClassPreview) {
  const adultName = adults.name?.trim();
  if (adultName && !/^clase adultos$/i.test(adultName)) return `${adultName} · adultos + ninos`;
  const kidName = kids.name?.trim();
  if (kidName && !/^ninos/i.test(kidName)) return `${kidName} · adultos + ninos`;
  return "Clase adultos + ninos";
}

function PublicHome() {
  return (
    <main className="public-home">
      <section className="public-home-card">
        <div className="official-lockup public-lockup">
          <img src="/skbc-icon.png" alt="SKBC Gipuzkoa" />
        </div>
        <p className="eyebrow">SKBC Gipuzkoa</p>
        <h1>Zona privada del club</h1>
        <p>
          Las fichas personales se consultan desde el enlace privado de cada kenshi. Si necesitas acceder a tu ficha
          o crees que hay un error, contacta con el club.
        </p>
      </section>
    </main>
  );
}

function safeStudentFichaReturn(value?: string) {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value);
    return /^\/ficha\/[A-Za-z0-9_-]+$/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function LoginHome({ error }: { error?: string }) {
  return (
    <div className="shell">
      <SidebarNav current="/" />
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
              <PasswordField id="code" name="code" autoComplete="current-password" required />
              <button type="submit">Entrar</button>
            </div>
            <p className="login-help">
              Si no recuerdas el codigo, revisa la variable <strong>SKBC_INTERNAL_ACCESS_CODE</strong> en Vercel.
            </p>
            {error ? <p className="form-error">Codigo incorrecto.</p> : null}
          </form>
        </section>
      </main>
    </div>
  );
}

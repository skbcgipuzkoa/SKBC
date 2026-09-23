import { createAdminClient } from "@/lib/supabase/admin";
import { resolveFreeTrialBillingDate } from "@/lib/free-trial";

type SidebarNavProps = {
  current?: string;
};

type NavItem = {
  label: string;
  href: string;
  external?: boolean;
};

const navItems: NavItem[] = [
  { label: "Inicio", href: "/skbc-interno" },
  { label: "Dojo", href: "/skbc-interno/dojo" },
  { label: "Control dia", href: "/control-dia" },
  { label: "Sustituto", href: "/clases/nueva?delegado=1" },
  { label: "Dia especial", href: "/clases/nueva?especial=1" },
  { label: "Kenshis", href: "/kenshis" },
  { label: "Clases", href: "/clases" },
  { label: "Actas", href: "/actas-clase" },
  { label: "Busen", href: "/clases-negras" },
  { label: "Shakujo", href: "/shakujo" },
  { label: "Entregas", href: "/entregas" },
  { label: "Tecnicas", href: "/tecnicas" },
  { label: "Consulta tecnica", href: "/consulta-tecnica" },
  { label: "Areas tecnicas", href: "/areas-tecnicas" },
  { label: "Examenes", href: "/examenes" },
  { label: "Cursos", href: "/cursos" },
  { label: "Calendario", href: "/calendario" },
  { label: "Pedidos", href: "/pedidos-cinturones" },
  { label: "Proximos examenes", href: "/proximos-examenes" },
  { label: "Rankings", href: "/rankings" },
  { label: "Avisos", href: "/avisos" },
  { label: "Alertas", href: "/alertas" },
  { label: "Papelera", href: "/papelera" },
  { label: "Backups", href: "/backups" },
  { label: "Salud Supabase", href: "/salud-supabase" },
  { label: "Notificaciones", href: "/notificaciones" },
  { label: "Sistema", href: "/sistema" }
];

export async function SidebarNav({ current }: SidebarNavProps) {
  const currentItem = navItems.find((item) => item.href === current);
  const noticeAlertCount = await getUnreadTrialNoticeCount();

  return (
    <aside className="sidebar">
      {noticeAlertCount ? (
        <a className="global-notice-alert blink-alert" href="/avisos" aria-label={`${noticeAlertCount} avisos pendientes`}>
          <span>Avisos pendientes</span>
          <strong>{noticeAlertCount}</strong>
        </a>
      ) : null}
      <div className="brand">
        <strong>SKBC Gipuzkoa</strong>
        <span>Admin privado</span>
      </div>
      <details className="mobile-nav-menu">
        <summary>
          <span>
            <small>Acceso actual</small>
            <strong>{currentItem?.label ?? "Menu"}</strong>
          </span>
          <b>Accesos</b>
        </summary>
        <div className="mobile-nav-panel">
          {noticeAlertCount ? (
            <a className="mobile-priority-alert nav-alert" href="/avisos" aria-current={current === "/avisos" ? "page" : undefined}>
              Avisos pendientes
              <span className="nav-alert-count">{noticeAlertCount}</span>
            </a>
          ) : null}
          {navItems.map((item) => (
            <a
              key={item.href}
              className={item.href === "/avisos" && noticeAlertCount ? "nav-alert" : undefined}
              href={item.href}
              aria-current={current === item.href ? "page" : undefined}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer external" : undefined}
            >
              {item.label}
              {item.href === "/avisos" && noticeAlertCount ? <span className="nav-alert-count">{noticeAlertCount}</span> : null}
            </a>
          ))}
        </div>
      </details>
      <nav className="nav" aria-label="Principal">
        {navItems.map((item) => (
          <a
            key={item.href}
            className={item.href === "/avisos" && noticeAlertCount ? "nav-alert" : undefined}
            href={item.href}
            aria-current={current === item.href ? "page" : undefined}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener noreferrer external" : undefined}
          >
            {item.label}
            {item.href === "/avisos" && noticeAlertCount ? <span className="nav-alert-count">{noticeAlertCount}</span> : null}
          </a>
        ))}
      </nav>
    </aside>
  );
}

async function getUnreadTrialNoticeCount() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const to = addDays(today, 7);
    const { data, error } = await createAdminClient()
      .from("members")
      .select("joined_on,free_trial_started_on,free_trial_ends_on")
      .eq("status", "active")
      .eq("free_trial_enabled", true)
      .is("free_trial_notice_read_at", null);
    if (error) return 0;
    return (data ?? []).filter((member) => {
      const billingOn = resolveFreeTrialBillingDate(member.free_trial_started_on ?? member.joined_on, member.free_trial_ends_on);
      return Boolean(billingOn) && billingOn! <= to;
    }).length;
  } catch {
    return 0;
  }
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

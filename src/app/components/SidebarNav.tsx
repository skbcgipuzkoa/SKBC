import { getPendingFamilyBillingContexts } from "@/lib/family-units";
import { getWebsiteAdminAlertCounts, totalWebsiteAdminAlerts } from "@/lib/website-admin-alerts";

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
  { label: "Provisionales", href: "/provisionales" },
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
  { label: "Tesoreria", href: "/tesoreria/admin" },
  { label: "Alertas", href: "/alertas" },
  { label: "Resumen semanal", href: "/resumen-semanal" },
  { label: "Papelera", href: "/papelera" },
  { label: "Backups", href: "/backups" },
  { label: "Salud Supabase", href: "/salud-supabase" },
  { label: "Notificaciones", href: "/notificaciones" },
  { label: "Sistema", href: "/sistema" }
];

export async function SidebarNav({ current }: SidebarNavProps) {
  const currentItem = navItems.find((item) => item.href === current);
  const [noticeAlertCount, websiteAlertCounts] = await Promise.all([
    getUnreadTrialNoticeCount(),
    getWebsiteAdminAlertCounts()
  ]);
  const websiteAlertCount = totalWebsiteAdminAlerts(websiteAlertCounts);

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
              className={(item.href === "/avisos" && noticeAlertCount) || (item.href === "/alertas" && websiteAlertCount) ? "nav-alert" : undefined}
              href={item.href}
              aria-current={current === item.href ? "page" : undefined}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer external" : undefined}
            >
              {item.label}
              {item.href === "/avisos" && noticeAlertCount ? <span className="nav-alert-count">{noticeAlertCount}</span> : null}
              {item.href === "/alertas" && websiteAlertCount ? <span className="nav-alert-count">{websiteAlertCount}</span> : null}
            </a>
          ))}
        </div>
      </details>
      <nav className="nav" aria-label="Principal">
        {navItems.map((item) => (
          <a
            key={item.href}
            className={(item.href === "/avisos" && noticeAlertCount) || (item.href === "/alertas" && websiteAlertCount) ? "nav-alert" : undefined}
            href={item.href}
            aria-current={current === item.href ? "page" : undefined}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener noreferrer external" : undefined}
          >
            {item.label}
            {item.href === "/avisos" && noticeAlertCount ? <span className="nav-alert-count">{noticeAlertCount}</span> : null}
            {item.href === "/alertas" && websiteAlertCount ? <span className="nav-alert-count">{websiteAlertCount}</span> : null}
          </a>
        ))}
      </nav>
    </aside>
  );
}

async function getUnreadTrialNoticeCount() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    return (await getPendingFamilyBillingContexts()).filter((context) => {
      const noticeOn = context.billing.newestMember?.trialEndsOn;
      return Boolean(noticeOn) && noticeOn! <= today;
    }).length;
  } catch {
    return 0;
  }
}

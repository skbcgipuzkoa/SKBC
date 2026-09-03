type SidebarNavProps = {
  current?: string;
};

const navItems = [
  { label: "Inicio", href: "/" },
  { label: "Control dia", href: "/control-dia" },
  { label: "Sustituto", href: "/clases/nueva?delegado=1" },
  { label: "Kenshis", href: "/kenshis" },
  { label: "Clases", href: "/clases" },
  { label: "Busen", href: "/clases-negras" },
  { label: "Shakujo", href: "/shakujo" },
  { label: "Entregas", href: "/entregas" },
  { label: "Tecnicas", href: "/tecnicas" },
  { label: "Consulta tecnica", href: "/consulta-tecnica" },
  { label: "Examenes", href: "/examenes" },
  { label: "App examenes", href: "https://akapi80.github.io/EXAMENES/", external: true },
  { label: "Cursos", href: "/cursos" },
  { label: "Calendario", href: "/calendario" },
  { label: "Cinturones", href: "/pedidos-cinturones" },
  { label: "Proximos examenes", href: "/proximos-examenes" },
  { label: "Rankings", href: "/rankings" },
  { label: "Notificaciones", href: "/notificaciones" },
  { label: "Sistema", href: "/sistema" }
];

export function SidebarNav({ current }: SidebarNavProps) {
  const currentItem = navItems.find((item) => item.href === current);

  return (
    <aside className="sidebar">
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
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              aria-current={current === item.href ? "page" : undefined}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer external" : undefined}
            >
              {item.label}
            </a>
          ))}
        </div>
      </details>
      <nav className="nav" aria-label="Principal">
        {navItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            aria-current={current === item.href ? "page" : undefined}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener noreferrer external" : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}

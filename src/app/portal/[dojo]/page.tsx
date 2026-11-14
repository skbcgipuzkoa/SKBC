import Image from "next/image";
import type { CSSProperties } from "react";
import { ArrowUpRight, CalendarDays, ClipboardList, PlayCircle, Award, Trophy, ChartBar, Users, KeyRound } from "lucide-react";
import styles from "./dashboard.module.css";
import { requireDojo } from "@/lib/dojo-access";

export default async function DojoPortal({ params }: {
  params: Promise<{ dojo: string }>;
}) {
  const { dojo } = await requireDojo((await params).dojo);
  return (
    <main className={styles.dashboard} style={{ "--dojo-accent": dojo.accent_color } as CSSProperties}>
      <header className={styles.hero}>
        <div className={styles.brand}>
          {dojo.slug === "anandi" && <Image className={styles.logo} src="/skbc-icon.png" alt="" width={96} height={96} sizes="(max-width: 480px) 52px, 96px" />}
          <div>
            <p>SKBC Gipuzkoa</p>
            <h1>{dojo.name}</h1>
            {dojo.slug === "anandi" && <span className={styles.dojoLabel}>Dojo</span>}
          </div>
        </div>
        <a href={`/portal/${dojo.slug}/clases`}><CalendarDays size={19} /> Ver clases <ArrowUpRight size={17} /></a>
      </header>
      <nav className={styles.grid} aria-label="Gestión del dojo">
        {[
          { path: "kenshis", title: "Kenshis", detail: "Consulta las fichas y altas del dojo", Icon: Users },
          { path: "clases", title: "Clases", detail: "Sesiones y planes técnicos", Icon: CalendarDays },
          { path: "control-dia", title: "Control del día", detail: "Asistencia y actividad de hoy", Icon: ClipboardList },
          { path: "modo-dojo", title: "Modo Dojo", detail: "Abre la sesión de entrenamiento", Icon: PlayCircle },
          { path: "examenes", title: "Próximos exámenes", detail: "Consulta las siguientes convocatorias", Icon: Award },
          { path: "rankings", title: "Rankings", detail: "Consulta la participación del dojo", Icon: Trophy },
          { path: "resumen", title: "Resumen semanal", detail: "Clases y asistencias de la semana", Icon: ChartBar },
          { path: "visitantes", title: "Kenshis visitantes", detail: "Consulta las visitas de otros dojos", Icon: Users }
        ].map(({ path, title, detail, Icon }) => (
          <a key={path} className={styles.tile} href={`/portal/${dojo.slug}/${path}`}>
            <span className={styles.icon}><Icon size={21} aria-hidden="true" /></span>
            <span><strong>{title}</strong><small>{detail}</small></span>
            <ArrowUpRight className={styles.arrow} size={17} aria-hidden="true" />
          </a>
        ))}
      </nav>
      {dojo.slug === "anandi" && !dojo.archived_at && <a className={styles.access} href="/portal/anandi-clave"><KeyRound size={16} /> Credenciales de Anandi</a>}
    </main>
  );
}

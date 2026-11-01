import { redirect } from "next/navigation";
import { hasInternalAccess } from "@/lib/auth";
import { buildNotificationMessage } from "@/lib/telegram-notifications";

const summaries = [
  { type: "monthly_stats", label: "Mensual" },
  { type: "semester_stats", label: "Semestral" },
  { type: "yearly_stats", label: "Anual" },
] as const;

export default async function TelegramPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const { tipo = "monthly_stats" } = await searchParams;
  const summary = summaries.find((item) => item.type === tipo);
  if (!summary) {
    return (
      <main className="main">
        <h1>Resumen no valido</h1>
        <a href="/notificaciones/vista-previa">Ver resumen mensual</a>
      </main>
    );
  }
  const message = await buildNotificationMessage(summary.type);
  // Render as React text, never as HTML: names remain inert even if they contain markup.
  const plainText = message
    .replace(/<\/?(?:b|i)>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return (
    <main className="main" style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1>Vista previa · resumen {summary.label.toLowerCase()}</h1>
      <p>No envia mensajes ni registra un envio en Telegram.</p>
      <nav aria-label="Resumenes de Telegram" className="form-actions">
        {summaries.map((item) => (
          <a
            key={item.type}
            className="secondary-link"
            href={`/notificaciones/vista-previa?tipo=${item.type}`}
            aria-current={item.type === tipo ? "page" : undefined}
          >
            {item.label}
          </a>
        ))}
        <a className="secondary-link" href="/notificaciones">
          Volver a notificaciones
        </a>
      </nav>
      <pre
        className="card"
        style={{
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          fontFamily: "inherit",
          lineHeight: 1.6,
        }}
      >
        {plainText}
      </pre>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { hasInternalAccess } from "@/lib/auth";
import { readWebsite, type WebsiteItem } from "@/lib/website-content";
import { publishWebsite } from "./actions";

export const dynamic = "force-dynamic";

export default async function WebsiteEditor({ searchParams }: {
  searchParams: Promise<{ section?: string; notice?: string }>;
}) {
  if (!process.env.SKBC_INTERNAL_ACCESS_CODE || !(await hasInternalAccess())) redirect("/skbc-interno");
  const params = await searchParams;
  const section = params.section === "events" ? "events" : "news";
  const isNews = section === "news";
  const snapshot = await readWebsite().catch(() => null);
  const fields = (entry: WebsiteItem, index: number) => {
    const field = (key: string) => typeof entry[key] === "string" ? String(entry[key]) : "";
    return <form action={publishWebsite} style={{ display: "grid", gap: 12, paddingBlock: 12 }}>
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="index" value={index} />
      <input type="hidden" name="sha" value={snapshot?.sha} />
      <label><input type="checkbox" name="enabled" defaultChecked={entry.enabled !== false} /> Visible en la web</label>
      <label>{isNews ? "Fecha" : "Inicio"} <input required type="date" name="date" defaultValue={field(isNews ? "date" : "start")} /></label>
      {isNews ? <>
        <label>Fecha de caducidad <input type="datetime-local" name="expiresAt" defaultValue={field("expiresAt")} /></label>
        <label>Enlace <input name="url" defaultValue={field("url")} /></label>
        <label>Dirección de la imagen <input name="image" defaultValue={field("image")} /></label>
      </> : <>
        <label>Fin <input type="date" name="end" defaultValue={field("end")} /></label>
        <label>Lugar <input name="location" defaultValue={field("location")} /></label>
      </>}
      {[["es", "Castellano"], ["eu", "Euskera"], ["en", "Inglés"]].map(([lang, label]) =>
        <fieldset key={lang} style={{ minWidth: 0, display: "grid", gap: 8 }}>
          <legend>{label}</legend>
          <label>Título <input name={lang + "-title"} required={lang === "es"} maxLength={180} defaultValue={entry.languages?.[lang]?.title} /></label>
          <label>{isNews ? "Texto" : "Descripción"} <textarea name={lang + "-text"} rows={4} maxLength={8000} defaultValue={entry.languages?.[lang]?.[isNews ? "text" : "description"]} /></label>
        </fieldset>
      )}
      <button type="submit">Publicar en la web</button>
    </form>;
  };
  return <main key={section} style={{ maxWidth: 700, margin: "auto", padding: 16 }}>
    <Link href="/skbc-interno">Volver al panel</Link>
    <h1>{isNews ? "Noticias de la web" : "Calendario web"}</h1>
    <nav style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <Link href="?section=news">Noticias</Link><Link href="?section=events">Calendario</Link>
    </nav>
    {params.notice && <p role="status">{params.notice}</p>}
    {!snapshot ? <p role="alert">No se pudo cargar la web desde GitHub. Vuelve a intentarlo.</p> : <>
      <details><summary>{isNews ? "Nueva noticia" : "Nuevo evento"}</summary>{fields({}, -1)}</details>
      {snapshot.data.settings[section].map((entry, index) => ({ entry, index })).reverse().map(({ entry, index }) =>
        <details key={snapshot.sha + index}>
          <summary>{String(entry[isNews ? "date" : "start"] ?? "")} · {entry.languages?.es?.title || "Sin título"}</summary>
          {fields(entry, index)}
        </details>
      )}
    </>}
  </main>;
}

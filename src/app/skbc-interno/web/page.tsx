import styles from "./editor.module.css";
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
    return <form action={publishWebsite} className={styles.form}>
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="index" value={index} />
      <input type="hidden" name="sha" value={snapshot?.sha} />
      <label className={styles.checkbox}><input type="checkbox" name="enabled" defaultChecked={entry.enabled !== false} /> Visible en la web</label>
      <label>{isNews ? "Fecha" : "Inicio"} <input required type="date" name="date" defaultValue={field(isNews ? "date" : "start")} /></label>
      {isNews ? <>
        <label>Fecha de caducidad <input type="datetime-local" name="expiresAt" defaultValue={field("expiresAt")} /></label>
        <label>Enlace <input name="url" defaultValue={field("url")} /></label>
        <label>Subir foto (JPG, PNG o WebP, hasta 3 MB) <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" /></label>
        <label>Dirección de la imagen <input name="image" defaultValue={field("image")} /></label>
      </> : <>
        <label>Fin <input type="date" name="end" defaultValue={field("end")} /></label>
        <label>Lugar <input name="location" defaultValue={field("location")} /></label>
      </>}
      {[["es", "Castellano"], ["eu", "Euskera"], ["en", "Inglés"]].map(([lang, label]) =>
        <fieldset key={lang} className={styles.language}>
          <legend>{label}</legend>
          <label>Título <input name={lang + "-title"} required={lang === "es"} maxLength={180} defaultValue={entry.languages?.[lang]?.title} /></label>
          <label>{isNews ? "Texto" : "Descripción"} <textarea name={lang + "-text"} rows={4} maxLength={8000} defaultValue={entry.languages?.[lang]?.[isNews ? "text" : "description"]} /></label>
        </fieldset>
      )}
      <button type="submit">Publicar en la web</button>
    </form>;
  };
  return <main key={section} className={styles.editor}>
    <Link className={styles.back} href="/skbc-interno">← Volver al panel</Link>
    <header className={styles.header}><p>Web del club</p>
    <h1>{isNews ? "Noticias de la web" : "Calendario web"}</h1></header>
    <nav className={styles.tabs} aria-label="Web del club">
      <Link href="?section=news" aria-current={isNews ? "page" : undefined}>Noticias</Link>
      <Link href="?section=events" aria-current={!isNews ? "page" : undefined}>Calendario</Link>
    </nav>
    {params.notice && <p className={styles.notice} role="status">{params.notice}</p>}
    {!snapshot ? <p role="alert">No se pudo cargar la web desde GitHub. Vuelve a intentarlo.</p> : <>
      <details className={styles.create}><summary>{isNews ? "Nueva noticia" : "Nuevo evento"}</summary>{fields({}, -1)}</details>
      <h2 className={styles.listTitle}>{isNews ? "Noticias guardadas" : "Eventos guardados"}</h2>
      {snapshot.data.settings[section].map((entry, index) => ({ entry, index })).reverse().map(({ entry, index }) =>
        <details className={styles.card} key={snapshot.sha + index}>
          <summary>
            <span><strong>{entry.languages?.es?.title || "Sin título"}</strong>
              <small>{String(entry[isNews ? "date" : "start"] ?? "")}
                {entry.enabled === false ? " · Oculto" : isNews && typeof entry.expiresAt === "string" && Date.parse(entry.expiresAt) < Date.now() ? " · Caducada" : ""}
              </small>
            </span>
            <span className={styles.edit}>Editar</span>
          </summary>
          {fields(entry, index)}
        </details>
      )}
    </>}
  </main>;
}

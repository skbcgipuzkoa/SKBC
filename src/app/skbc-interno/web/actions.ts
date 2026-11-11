"use server";

import { redirect } from "next/navigation";
import { hasInternalAccess } from "@/lib/auth";
import { readWebsite, writeWebsite, prepareWebsitePhoto } from "@/lib/website-content";

export async function publishWebsite(form: FormData) {
  if (!process.env.SKBC_INTERNAL_ACCESS_CODE || !(await hasInternalAccess())) redirect("/skbc-interno");
  const section = form.get("section") === "events" ? "events" : "news";
  const isNews = section === "news";
  const target = "/skbc-interno/web?section=" + section;
  let notice = "Cambios enviados a la web pública. Pueden tardar unos minutos en aparecer.";
  try {
    const { sha, data, head } = await readWebsite();
    if (form.get("sha") !== sha) throw new Error("El contenido cambió. Revisa la versión actual antes de publicar.");
    const entries = data.settings[section];
    const index = Number(form.get("index"));
    if (!Number.isInteger(index) || index < -1 || index >= entries.length) throw new Error("Entrada no válida.");
    const original = entries[index] ?? {};
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const date = value("date");
    const end = value("end");
    const validDate = (input: string) => /^\d{4}-\d{2}-\d{2}$/.test(input) &&
      !Number.isNaN(Date.parse(input)) && new Date(input).toISOString().slice(0, 10) === input;
    if (!validDate(date) || (!isNews && end && (!validDate(end) || end < date))) throw new Error("Revisa las fechas.");
    const textField = isNews ? "text" : "description";
    const languages = { ...original.languages };
    for (const lang of ["es", "eu", "en"]) {
      const title = value(lang + "-title");
      const text = value(lang + "-text");
      if (title.length > 180 || text.length > 8000) throw new Error("El título o el texto es demasiado largo.");
      languages[lang] = { ...languages[lang], title, [textField]: text };
    }
    if (!languages.es.title) throw new Error("Escribe un título en castellano.");
    const entry = { color: "#1f6fa9", ...original, enabled: form.has("enabled"), languages };
    const updated = isNews
      ? { ...entry, date, expiresAt: value("expiresAt"), url: value("url"), image: value("image") }
      : { ...entry, start: date, end: end || date, location: value("location") };
    if (isNews && [value("url"), value("image")].some(link => link && !/^(https:\/\/[^\s]+|\/?[a-zA-Z0-9_-][a-zA-Z0-9_./-]*)$/.test(link))) {
      throw new Error("Usa un enlace HTTPS o una ruta de la web.");
    }
    const photo = isNews ? await prepareWebsitePhoto(form.get("photo")) : undefined;
    if (photo) Object.assign(updated, { image: photo.path });
    if (index === -1) entries.push(updated);
    else entries[index] = updated;
    await writeWebsite(sha, data, head, photo);
  } catch (error) {
    notice = error instanceof Error ? error.message : "No se pudo publicar.";
  }
  redirect(target + "&notice=" + encodeURIComponent(notice));
}

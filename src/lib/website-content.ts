import { z } from "zod";

const endpoint = "https://api.github.com/repos/aKaPi80/WEB-SKBC-GIPUZKOA-/contents/content.js";
const item = z.object({ languages: z.record(z.record(z.string())).optional() }).passthrough();
export type WebsiteItem = z.infer<typeof item>;
const schema = z.object({
  settings: z.object({ news: z.array(item), events: z.array(item) }).passthrough()
}).passthrough();

async function github(method: string, body?: object) {
  const token = process.env.SKBC_WEBSITE_GITHUB_TOKEN;
  if (!token) throw new Error("Falta configurar la publicación web.");
  return fetch(endpoint + "?ref=main", {
    method, cache: "no-store",
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
}

export async function readWebsite() {
  const response = await github("GET");
  if (!response.ok) throw new Error("GitHub no pudo cargar el contenido (" + response.status + ").");
  const file = z.object({ sha: z.string(), content: z.string() }).parse(await response.json());
  const source = Buffer.from(file.content, "base64").toString("utf8");
  const match = /^\s*window\.SKBC_CONTENT\s*=\s*([\s\S]+);\s*$/.exec(source);
  if (!match) throw new Error("Formato de contenido desconocido.");
  return { sha: file.sha, data: schema.parse(JSON.parse(match[1])) };
}

export async function writeWebsite(sha: string, data: z.infer<typeof schema>) {
  const source = "window.SKBC_CONTENT = " + JSON.stringify(data, null, 2) + ";\n";
  const result = await github("PUT", {
    branch: "main", sha, message: "Actualizar noticias o calendario desde SKBC",
    content: Buffer.from(source).toString("base64")
  });
  if (result.status === 409) throw new Error("El contenido cambió. Recarga antes de publicar.");
  if (!result.ok) throw new Error("GitHub no aceptó la publicación (" + result.status + ").");
}

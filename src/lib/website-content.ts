import { z } from "zod";

const endpoint = "https://api.github.com/repos/aKaPi80/WEB-SKBC-GIPUZKOA-/contents/content.js";
const item = z.object({ languages: z.record(z.record(z.string())).optional() }).passthrough();
export type WebsiteItem = z.infer<typeof item>;
const schema = z.object({
  settings: z.object({ news: z.array(item), events: z.array(item) }).passthrough()
}).passthrough();

async function github(method: string, body?: object, url = endpoint + "?ref=main") {
  const token = process.env.SKBC_WEBSITE_GITHUB_TOKEN;
  if (!token) throw new Error("Falta configurar la publicación web.");
  return fetch(url, {
    method, cache: "no-store",
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
}

export async function readWebsite() {
  const ref = await github("GET", undefined, "https://api.github.com/repos/aKaPi80/WEB-SKBC-GIPUZKOA-/git/ref/heads/main");
  if (!ref.ok) throw new Error("No se pudo consultar la versión de la web.");
  const head = z.object({ object: z.object({ sha: z.string() }) }).parse(await ref.json()).object.sha;
  const response = await github("GET", undefined, endpoint + "?ref=" + head);
  if (!response.ok) throw new Error("GitHub no pudo cargar el contenido (" + response.status + ").");
  const file = z.object({ sha: z.string(), content: z.string() }).parse(await response.json());
  const source = Buffer.from(file.content, "base64").toString("utf8");
  const match = /^\s*window\.SKBC_CONTENT\s*=\s*([\s\S]+);\s*$/.exec(source);
  if (!match) throw new Error("Formato de contenido desconocido.");
  return { sha: file.sha, head, data: schema.parse(JSON.parse(match[1])) };
}

export async function writeWebsite(sha: string, data: z.infer<typeof schema>, head: string, photo?: { path: string; contents: string }) {
  const source = "window.SKBC_CONTENT = " + JSON.stringify(data, null, 2) + ";\n";
  if (photo) {
    const result = await github("POST", {
      query: "mutation ($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }",
      variables: { input: {
        branch: { repositoryNameWithOwner: "aKaPi80/WEB-SKBC-GIPUZKOA-", branchName: "main" },
        expectedHeadOid: head,
        message: { headline: "Publicar noticia con foto desde SKBC" },
        fileChanges: { additions: [photo, { path: "content.js", contents: Buffer.from(source).toString("base64") }] }
      } }
    }, "https://api.github.com/graphql");
    const payload = await result.json();
    if (!result.ok || !payload.data?.createCommitOnBranch?.commit?.oid) {
      throw new Error("No se pudo publicar la foto y la noticia. Recarga y vuelve a intentarlo.");
    }
    return;
  }
  const result = await github("PUT", {
    branch: "main", sha, message: "Actualizar noticias o calendario desde SKBC",
    content: Buffer.from(source).toString("base64")
  });
  if (result.status === 409) throw new Error("El contenido cambió. Recarga antes de publicar.");
  if (!result.ok) throw new Error("GitHub no aceptó la publicación (" + result.status + ").");
}

export async function prepareWebsitePhoto(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > 3 * 1024 * 1024) throw new Error("La foto supera el límite de 3 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const jpeg = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  const extension = jpeg ? "jpg" : png ? "png" : webp ? "webp" : null;
  if (!extension) throw new Error("Selecciona una foto JPG, PNG o WebP.");
  return {
    path: "assets/uploads/" + crypto.randomUUID() + "." + extension,
    contents: bytes.toString("base64")
  };
}

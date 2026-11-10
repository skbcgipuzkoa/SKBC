"use server";

import { hasInternalAccess } from "@/lib/auth";
import { createClassPhotoAlbum, saveClassPhotos, resolveClassPhotoReturn } from "@/lib/class-photos";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function classId(form: FormData) {
  const value = String(form.get("classId") ?? "").trim();
  if (!value || value.length > 100 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid class");
  return value;
}
function destination(legacyId: string) {
  if (!legacyId) throw new Error("Missing class");
  return `/clases/${encodeURIComponent(legacyId)}`;
}
async function failurePath(form: FormData) {
  try { return `${destination((await resolveClassPhotoReturn(classId(form))).legacyId)}?photoError=1#fotos-clase`; }
  catch { return "/clases?photoError=1"; }
}
export async function createClassPhotoAlbumAction(form: FormData) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  let path: string;
  try { path = destination((await createClassPhotoAlbum(classId(form))).legacyId); }
  catch { redirect(await failurePath(form)); }
  revalidatePath(path);
  redirect(`${path}?photoSaved=folder#fotos-clase`);
}
export async function saveClassPhotosAction(form: FormData) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  let path: string;
  let intent: "draft" | "publish" | "withdraw";
  try {
    const id = classId(form);
    const caption = String(form.get("caption") ?? "").trim();
    const rawIntent = String(form.get("intent") ?? "");
    if (!["draft", "publish", "withdraw"].includes(rawIntent)) throw new Error("Invalid intent");
    intent = rawIntent as typeof intent;
    const photoIds = [...new Set(form.getAll("photoIds").map(String))];
    if (photoIds.length > 24 || photoIds.some((value) => !/^[A-Za-z0-9_-]{1,200}$/.test(value)) || caption.length > 2000) throw new Error("Invalid content");
    const revision = String(form.get("revision") ?? "");
    if (!revision.trim() || revision.length > 500 || /[\r\n]/.test(revision)) throw new Error("Invalid revision");
    path = destination((await saveClassPhotos({ classId: id, caption, photoIds, intent, revision })).legacyId);
  } catch { redirect(await failurePath(form)); }
  revalidatePath(path);
  revalidatePath("/ficha", "layout");
  redirect(`${path}?photoSaved=${intent}#fotos-clase`);
}

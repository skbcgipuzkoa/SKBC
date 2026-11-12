import { CLASS_PHOTO_UPLOAD_BATCH_LIMIT } from "@/lib/class-photo-limits";
export const CLASS_PHOTO_CLIENT_LIMIT = Math.floor(2.5 * 1024 * 1024);
export function fitPhotoDimensions(width: number, height: number, maxEdge = 2048) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("La imagen no tiene dimensiones válidas.");
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
async function decodePhoto(file: File): Promise<{ image: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try { const image = await createImageBitmap(file, { imageOrientation: "from-image" }); return { image, width: image.width, height: image.height, close: () => image.close() }; } catch { /* Safari may support the image element decoder instead. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch { URL.revokeObjectURL(url); throw new Error("No se puede abrir esta imagen. Si es HEIC/HEIF, conviértela a JPEG o elige una foto compatible."); }
}
export async function optimizeClassPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) throw new Error("Selecciona una imagen JPEG, PNG u otra foto compatible.");
  const decoded = await decodePhoto(file);
  try {
    let dimensions = fitPhotoDimensions(decoded.width, decoded.height);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Este navegador no permite optimizar la foto. Prueba con una imagen JPEG más pequeña.");
    for (let step = 0; step < 4; step++) {
      canvas.width = dimensions.width; canvas.height = dimensions.height;
      context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
      for (const quality of [.85, .72, .6, .48, .36]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (!blob) throw new Error("No se pudo convertir la imagen a JPEG. Prueba con otra foto.");
        if (blob.size > 0 && blob.size <= CLASS_PHOTO_CLIENT_LIMIT) return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
      }
      dimensions = fitPhotoDimensions(dimensions.width * .75, dimensions.height * .75);
    }
    throw new Error("La foto sigue siendo demasiado grande. Elige una versión más pequeña.");
  } finally { decoded.close(); }
}
export type ClassPhotoUploadResult = { file: File; ok: boolean; error?: string };
export async function uploadClassPhotoBatch(files: File[], classId: string, onProgress: (completed: number, uploaded: number) => void): Promise<ClassPhotoUploadResult[]> {
  if (!files.length || files.length > CLASS_PHOTO_UPLOAD_BATCH_LIMIT) throw new Error(`Selecciona entre 1 y ${CLASS_PHOTO_UPLOAD_BATCH_LIMIT} fotos por envío.`);
  const results: ClassPhotoUploadResult[] = [];
  let uploaded = 0;
  for (const file of files) {
    try {
      const optimized = await optimizeClassPhoto(file);
      const body = new FormData(); body.set("photo", optimized);
      const response = await fetch(`/api/class-photos/${encodeURIComponent(classId)}/upload`, { method: "POST", credentials: "same-origin", body });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "No se pudo confirmar la subida. Revisa el álbum antes de volver a intentarlo.");
      }
      if (!data?.id || !data?.name) throw new Error("La subida no se ha confirmado. Revisa la lista de fotos antes de repetirla.");
      results.push({ file, ok: true, ...(data.published===false ? {error:"Guardada en Drive, pero no se pudo publicar. Usa las opciones del álbum para publicarla; no vuelvas a subirla."} : {}) }); uploaded++;
    } catch (error) { results.push({ file, ok: false, error: error instanceof Error && !/fetch|network/i.test(error.message) ? error.message : "No se pudo confirmar la subida. Revisa la lista de fotos antes de repetirla." }); }
    onProgress(results.length, uploaded);
  }
  return results;
}

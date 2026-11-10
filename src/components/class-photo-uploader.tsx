"use client";
import { CLASS_PHOTO_ALBUM_LIMIT, CLASS_PHOTO_UPLOAD_BATCH_LIMIT } from "@/lib/class-photo-limits";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadClassPhotoBatch } from "@/lib/class-photo-client";

export function ClassPhotoUploader({ classId }: { classId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, uploaded: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  async function upload() {
    if (inFlight.current) return;
    if (!files.length || files.length > CLASS_PHOTO_UPLOAD_BATCH_LIMIT) { setErrors([`Selecciona entre 1 y ${CLASS_PHOTO_UPLOAD_BATCH_LIMIT} fotos por envío.`]); return; }
    inFlight.current = true; setBusy(true); setErrors([]); setProgress({ completed: 0, uploaded: 0, total: files.length });
    try {
      const results = await uploadClassPhotoBatch(files, classId, (completed, uploaded) => setProgress({ completed, uploaded, total: files.length }));
      const failed = results.filter((result) => !result.ok);
      setErrors(results.filter((result) => result.error).map((result) => `${result.file.name}: ${result.error}`));
      setFiles(failed.map((result) => result.file));
      if (!failed.length && input.current) input.current.value = "";
      if (results.some((result) => result.ok)) router.refresh();
    } catch { setErrors(["No se pudo completar el envío. Revisa las fotos antes de volver a intentarlo."]); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="class-photo-uploader">
    <h3>Subir fotos desde este dispositivo</h3><p>Se optimizan y guardan en Drive. Se publican automáticamente en las fichas de quienes asistieron a esta clase. Máximo {CLASS_PHOTO_ALBUM_LIMIT} fotos publicadas por clase.</p>
    <label>Elegir fotos de la galería · máximo {CLASS_PHOTO_UPLOAD_BATCH_LIMIT} por envío<input ref={input} type="file" accept="image/*" multiple disabled={busy} onChange={(event) => { setFiles(Array.from(event.target.files ?? [])); setErrors([]); setProgress({ completed: 0, uploaded: 0, total: 0 }); }} /></label>
    <button type="button" disabled={busy || !files.length || files.length > CLASS_PHOTO_UPLOAD_BATCH_LIMIT} onClick={upload}>{busy ? "Optimizando y subiendo…" : `Subir ${files.length || "las"} fotos seleccionadas`}</button>
    <p role="status" aria-live="polite">{progress.total ? `${progress.uploaded} subidas · ${progress.completed} de ${progress.total} procesadas.${busy ? " Mantén esta página abierta." : ""}` : files.length ? `${files.length} fotos seleccionadas.` : ""}</p>
    {errors.length ? <div role="alert"><p>No se han reintentado archivos automáticamente. Revisa la lista antes de repetir una subida no confirmada.</p><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div> : null}
  </div>;
}

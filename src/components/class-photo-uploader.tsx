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
  const [published, setPublished] = useState(0);
  const [progress, setProgress] = useState({ completed: 0, uploaded: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  async function upload(selection: File[]) {
    if (inFlight.current) return;
    if (!selection.length || selection.length > CLASS_PHOTO_UPLOAD_BATCH_LIMIT) { setErrors([`Selecciona entre 1 y ${CLASS_PHOTO_UPLOAD_BATCH_LIMIT} fotos por envío.`]); return; }
    inFlight.current = true; setBusy(true); setErrors([]); setPublished(0); setProgress({ completed: 0, uploaded: 0, total: selection.length });
    try {
      const results = await uploadClassPhotoBatch(selection, classId, (completed, uploaded) => setProgress({ completed, uploaded, total: selection.length }));
      setPublished(results.filter(result => result.ok && !result.error).length);
      const failed = results.filter((result) => !result.ok);
      setErrors(results.filter((result) => result.error).map((result) => `${result.file.name}: ${result.error}`));
      setFiles(failed.map((result) => result.file));
      if (input.current) input.current.value = "";
      if (results.some((result) => result.ok)) router.refresh();
    } catch { setErrors(["No se pudo completar el envío. Revisa las fotos antes de volver a intentarlo."]); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="class-photo-uploader">
    <h3>Subir fotos desde este dispositivo</h3><p>Se optimizan y guardan en Drive. Se publican automáticamente en las fichas de quienes asistieron a esta clase. Máximo {CLASS_PHOTO_ALBUM_LIMIT} fotos publicadas por clase.</p>
    <label>Elegir y subir fotos · máximo {CLASS_PHOTO_UPLOAD_BATCH_LIMIT} por envío<input ref={input} type="file" accept="image/*" multiple disabled={busy} onChange={(event) => { const selection = Array.from(event.target.files ?? []); if (!selection.length) return; event.target.value = ""; if (inFlight.current) return; setFiles([]); setProgress({ completed: 0, uploaded: 0, total: 0 }); void upload(selection); }} /></label>
    {files.length ? <button type="button" disabled={busy} onClick={() => upload(files)}>Reintentar {files.length} fotos</button> : null}
    <p role="status" aria-live="polite">{progress.total ? `${progress.uploaded} subidas · ${progress.completed} de ${progress.total} procesadas.${busy ? " Mantén esta página abierta." : ` ${published} publicadas en las fichas.`}` : files.length ? `${files.length} fotos seleccionadas.` : ""}</p>
    {errors.length ? <div role="alert"><p>No se han reintentado archivos automáticamente. Revisa la lista antes de repetir una subida no confirmada.</p><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div> : null}
  </div>;
}

"use client";
import { useState } from "react";

export function ClassPhotoGallery({ classId, date, caption, photoIds, fichaToken }: { classId: string; date: string; caption: string; photoIds: string[]; fichaToken: string }) {
  const [open, setOpen] = useState(false);
  const formatted = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : date;
  return <details className="class-photo-capsule" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span>Clase del {formatted} · Fotos de la clase</span><span className="class-photo-count">{photoIds.length} {photoIds.length === 1 ? "foto" : "fotos"}</span></summary>
    {open ? <div className="class-photo-capsule-content">
      {caption ? <p className="class-photo-caption">{caption}</p> : null}
      <div className="class-photo-grid">{photoIds.map((id, index) => <ClassPhotoImage key={id} src={`/api/class-photos/${encodeURIComponent(classId)}/${encodeURIComponent(id)}?ficha=${encodeURIComponent(fichaToken)}`} index={index} />)}</div>
    </div> : null}
  </details>;
}

export function ClassPhotoImage({ src, index }: { src: string; index: number }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed) return <div className="class-photo-load-error" role="status"><p>No se puede cargar la foto {index + 1} ahora.</p><button type="button" onClick={() => { setAttempt((value) => value + 1); setFailed(false); }}>Volver a intentar la foto {index + 1}</button></div>;
  return <img src={attempt ? `${src}&retry=${attempt}` : src} alt={`Foto ${index + 1} del entrenamiento`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

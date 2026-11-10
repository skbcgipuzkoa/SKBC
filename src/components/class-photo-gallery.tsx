"use client";
import { useState } from "react";
import { CLASS_PHOTO_PAGE_SIZE } from "@/lib/class-photo-limits";

type ClassAlbum = { classId: string; date: string; caption: string; photoIds: string[] };

export function ClassPhotoCollection({ albums, fichaToken }: { albums: ClassAlbum[]; fichaToken: string }) {
  const [open, setOpen] = useState(false);
  return <details className="class-photo-collection" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><strong>Galería de entrenamientos</strong><span className="class-photo-count">{albums.length} {albums.length === 1 ? "clase con fotos" : "clases con fotos"}</span><span className="class-photo-collection-hint">Elegir día de clase</span></summary>
    {open ? <div className="class-photo-days">{albums.map((album) => <ClassPhotoGallery key={album.classId} {...album} fichaToken={fichaToken} />)}</div> : null}
  </details>;
}

export function ClassPhotoGallery({ classId, date, caption, photoIds, fichaToken }: { classId: string; date: string; caption: string; photoIds: string[]; fichaToken: string }) {
  const [open, setOpen] = useState(false);
  const [visibleCount,setVisibleCount]=useState(CLASS_PHOTO_PAGE_SIZE);
  const formatted = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(0, 4)}` : date;
  return <details className="class-photo-capsule" onToggle={(event) => {setOpen(event.currentTarget.open);if(!event.currentTarget.open)setVisibleCount(CLASS_PHOTO_PAGE_SIZE);}}>
    <summary><span>Clase del {formatted}</span><span className="class-photo-count">{photoIds.length} {photoIds.length === 1 ? "foto" : "fotos"}</span></summary>
    {open ? <div className="class-photo-capsule-content">
      {caption ? <p className="class-photo-caption">{caption}</p> : null}
      <div className="class-photo-grid">{photoIds.slice(0,visibleCount).map((id, index) => <ClassPhotoImage key={id} src={`/api/class-photos/${encodeURIComponent(classId)}/${encodeURIComponent(id)}?ficha=${encodeURIComponent(fichaToken)}`} index={index} />)}</div>
      {photoIds.length>CLASS_PHOTO_PAGE_SIZE ? <p role="status">Mostrando {Math.min(visibleCount,photoIds.length)} de {photoIds.length} fotos</p> : null}
      {visibleCount<photoIds.length ? <button type="button" className="secondary-button" onClick={()=>setVisibleCount(count=>Math.min(count+CLASS_PHOTO_PAGE_SIZE,photoIds.length))}>Ver más fotos</button> : null}
    </div> : null}
  </details>;
}

export function ClassPhotoImage({ src, index }: { src: string; index: number }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed) return <div className="class-photo-load-error" role="status"><p>No se puede cargar la foto {index + 1} ahora.</p><button type="button" onClick={() => { setAttempt((value) => value + 1); setFailed(false); }}>Volver a intentar la foto {index + 1}</button></div>;
  return <figure className="class-photo-item"><img src={attempt ? `${src}&retry=${attempt}` : src} alt={`Foto ${index + 1} del entrenamiento`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /><figcaption><a className="text-link" href={`${src}&download=1`} download rel="noreferrer">Descargar foto {index + 1}</a></figcaption></figure>;
}

"use client";
import { useState } from "react";
import { CLASS_PHOTO_PAGE_SIZE } from "@/lib/class-photo-limits";
import { classPhotoDate,flattenClassPhotos,groupClassPhotoAlbums,orderedClassPhotoAlbums } from "@/lib/class-photo-groups";
import type { ClassPhotoAlbum,ClassPhotoMonth,ClassPhotoYear as PhotoYear } from "@/lib/class-photo-groups";

type CollectionProps={albums:ClassPhotoAlbum[];fichaToken:string};
export function ClassPhotoCollection({albums,fichaToken}:CollectionProps) {
  const [open,setOpen]=useState(false);
  const [view,setView]=useState<"dates"|"all">("dates");
  const available=orderedClassPhotoAlbums(albums);
  return <details className="class-photo-collection" onToggle={event=>{setOpen(event.currentTarget.open);if(!event.currentTarget.open)setView("dates");}}>
    <summary><strong>Galería de entrenamientos</strong><span className="class-photo-count">{available.length} {available.length===1?"clase con fotos":"clases con fotos"}</span><span className="class-photo-collection-hint">Elegir año, mes y día · o ver todas las fotos</span></summary>
    {open ? <div className="class-photo-days">
      <div className="class-photo-view-switch" role="group" aria-label="Organizar fotos">
        <button type="button" aria-pressed={view==="dates"} onClick={()=>setView("dates")}>Por años, meses y días</button>
        <button type="button" aria-pressed={view==="all"} onClick={()=>setView("all")}>Ver todas las fotos</button>
      </div>
      {view==="dates" ? groupClassPhotoAlbums(available).map(year=><ClassPhotoYear key={year.year} group={year} fichaToken={fichaToken} />) : <ClassPhotoAll albums={available} fichaToken={fichaToken} />}
    </div> : null}
  </details>;
}
export function ClassPhotoYear({group,fichaToken}:{group:PhotoYear;fichaToken:string}) {
  const [open,setOpen]=useState(false);
  const count=group.months.reduce((sum,month)=>sum+month.albums.reduce((n,album)=>n+album.photoIds.length,0),0);
  return <details className="class-photo-date-group" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary><strong>Fotos {group.year}</strong><span className="class-photo-count">{count} fotos</span></summary>
    {open ? <div className="class-photo-date-content">{group.months.map(month=><ClassPhotoMonthGroup key={month.key} group={month} fichaToken={fichaToken} />)}</div> : null}
  </details>;
}
export function ClassPhotoMonthGroup({group,fichaToken}:{group:ClassPhotoMonth;fichaToken:string}) {
  const [open,setOpen]=useState(false);
  return <details className="class-photo-date-group" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary><strong>{group.label}</strong><span className="class-photo-count">{group.albums.length} {group.albums.length===1?"clase":"clases"}</span></summary>
    {open ? <div className="class-photo-date-content">{group.albums.map(album=><ClassPhotoGallery key={album.classId} {...album} fichaToken={fichaToken} />)}</div> : null}
  </details>;
}
export function ClassPhotoAll({albums,fichaToken}:CollectionProps) {
  const [visibleCount,setVisibleCount]=useState(CLASS_PHOTO_PAGE_SIZE);
  const photos=flattenClassPhotos(albums);
  return <div className="class-photo-all">
    <p>Fotos de tus clases, de la más reciente a la más antigua.</p>
    <div className="class-photo-grid">{photos.slice(0,visibleCount).map(photo=><div key={photo.classId+":"+photo.photoId}>
      <p className="class-photo-date-label">Clase del {classPhotoDate(photo.date)}</p>
      <ClassPhotoImage src={`/api/class-photos/${encodeURIComponent(photo.classId)}/${encodeURIComponent(photo.photoId)}?ficha=${encodeURIComponent(fichaToken)}`} index={photo.index} classDate={classPhotoDate(photo.date)} />
    </div>)}</div>
    <p role="status">Mostrando {Math.min(visibleCount,photos.length)} de {photos.length} fotos</p>
    {visibleCount<photos.length ? <button type="button" className="secondary-button" onClick={()=>setVisibleCount(count=>Math.min(count+CLASS_PHOTO_PAGE_SIZE,photos.length))}>Ver más fotos</button> : null}
  </div>;
}

export function ClassPhotoGallery({ classId, date, caption, photoIds, fichaToken }: { classId: string; date: string; caption: string; photoIds: string[]; fichaToken: string }) {
  const [open, setOpen] = useState(false);
  const [visibleCount,setVisibleCount]=useState(CLASS_PHOTO_PAGE_SIZE);
  const formatted=classPhotoDate(date);
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

export function ClassPhotoImage({ src, index, classDate }: { src: string; index: number; classDate?:string }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed) return <div className="class-photo-load-error" role="status"><p>No se puede cargar la foto {index + 1} ahora.</p><button type="button" onClick={() => { setAttempt((value) => value + 1); setFailed(false); }}>Volver a intentar la foto {index + 1}</button></div>;
  return <figure className="class-photo-item"><img src={attempt ? `${src}&retry=${attempt}` : src} alt={`Foto ${index + 1} del entrenamiento`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /><figcaption><a className="text-link" href={`${src}&download=1`} download rel="noreferrer" aria-label={classDate?`Descargar foto ${index+1} de la clase del ${classDate}`:undefined}>Descargar foto {index + 1}</a></figcaption></figure>;
}

import { getMemberClassPhotoHistory } from "@/lib/class-photos";
import "@/app/class-photos.css";

export async function ClassPhotoHistory({ fichaToken }: { fichaToken: string }) {
  try {
    const albums = await getMemberClassPhotoHistory(fichaToken);
    if (!albums.length) return null;
    return <section className="class-photos class-photo-history" aria-label="Fotos de entrenamientos"><h2>Fotos de tus entrenamientos</h2>{albums.map((album) => <article className="ficha-card class-photo-album" key={album.classId}>
      <h3>{album.className}</h3><p><time dateTime={album.date}>{formatDate(album.date)}</time></p>
      {album.caption ? <p className="class-photo-caption">{album.caption}</p> : null}
      <div className="class-photo-grid">{album.photoIds.map((id, index) => <img key={id} src={`/api/class-photos/${encodeURIComponent(album.classId)}/${encodeURIComponent(id)}?ficha=${encodeURIComponent(fichaToken)}`} alt={`Foto ${index + 1} del entrenamiento`} loading="lazy" referrerPolicy="no-referrer" />)}</div>
    </article>)}</section>;
  } catch {
    return <section className="class-photos"><p className="muted" role="status">Las fotos de entrenamientos no están disponibles ahora. Puedes seguir consultando tu ficha.</p></section>;
  }
}
function formatDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : date;
}

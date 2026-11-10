import { getMemberClassPhotoHistory } from "@/lib/class-photos";
import { ClassPhotoGallery } from "@/components/class-photo-gallery";
import "@/app/class-photos.css";

export async function ClassPhotoHistory({ fichaToken }: { fichaToken: string }) {
  try {
    const albums = await getMemberClassPhotoHistory(fichaToken);
    if (!albums.length) return null;
    return <section className="class-photos class-photo-history" aria-label="Fotos de entrenamientos"><h2>Fotos de tus entrenamientos</h2>{albums.map((album) => <ClassPhotoGallery key={album.classId} classId={album.classId} date={album.date} caption={album.caption} photoIds={album.photoIds} fichaToken={fichaToken} />)}</section>;
  } catch {
    return <section className="class-photos"><p className="muted" role="status">Las fotos de entrenamientos no están disponibles ahora. Puedes seguir consultando tu ficha.</p></section>;
  }
}

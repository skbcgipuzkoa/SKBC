import { getMemberClassPhotoHistory } from "@/lib/class-photos";
import { ClassPhotoAutoSync } from "@/components/class-photo-auto-sync";
import { ClassPhotoCollection } from "@/components/class-photo-gallery";
import "@/app/class-photos.css";

export async function ClassPhotoHistory({ fichaToken }: { fichaToken: string }) {
  try {
    const albums = await getMemberClassPhotoHistory(fichaToken,true);
    if (!albums.length) return null;
    const published=albums.filter(album=>album.photoIds.length);
    return <><ClassPhotoAutoSync classIds={albums.map(album=>album.classId)} fichaToken={fichaToken} />{published.length ? <section className="class-photos class-photo-history" aria-label="Fotos de entrenamientos"><ClassPhotoCollection albums={published} fichaToken={fichaToken} /></section> : null}</>;
  } catch {
    return <section className="class-photos"><p className="muted" role="status">Las fotos de entrenamientos no están disponibles ahora. Puedes seguir consultando tu ficha.</p></section>;
  }
}

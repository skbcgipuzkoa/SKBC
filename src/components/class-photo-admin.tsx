import { getClassPhotoAdmin } from "@/lib/class-photos";
import { CLASS_PHOTO_ROOT_FOLDER_ID } from "@/lib/class-photo-drive";
import { saveClassPhotosAction } from "@/app/clases/photo-actions";
import { ClassPhotoUploader } from "@/components/class-photo-uploader";
import "@/app/class-photos.css";

export async function ClassPhotoAdmin({ classId, legacyId }: { classId: string; legacyId: string }) {
  try {
    const { album, photos } = await getClassPhotoAdmin(classId);
    return <section className="class-photos" id={`fotos-clase-${classId}`}><h2>Fotos del entrenamiento</h2>
      <ClassPhotoUploader classId={classId} />
      <p><a className="text-link" href={`https://drive.google.com/drive/folders/${encodeURIComponent(CLASS_PHOTO_ROOT_FOLDER_ID)}`} target="_blank" rel="noopener noreferrer">Abrir carpeta de entrenamientos</a></p>
      {!album ? <p className="muted">La carpeta se creará al subir la primera foto. Si no hay fotos, esta clase no ocupa ninguna carpeta en Drive.</p> : <>
        <p><a className="text-link" href={`https://drive.google.com/drive/folders/${encodeURIComponent(album.folderId)}`} target="_blank" rel="noopener noreferrer">Abrir carpeta privada de esta clase en Drive</a> · <a className="text-link" href={`/clases/${encodeURIComponent(legacyId)}#fotos-clase`}>Actualizar archivos</a></p>
        <p className="class-photo-state">{album.published ? `Publicado en las fichas · ${album.published.photoIds.length} fotos. Los cambios del borrador requieren volver a publicar.` : "Borrador privado · todavía no publicado en las fichas."}</p>
        <form action={saveClassPhotosAction}>
          <input type="hidden" name="classId" value={classId} /><input type="hidden" name="revision" value={album.revision} />
          <label>Texto del entrenamiento<textarea name="caption" defaultValue={album.caption} maxLength={2000} rows={4} /></label>
          <fieldset><legend>Fotos para las fichas · máximo 24</legend><div className="class-photo-grid">
            {photos.map((photo) => <label className="class-photo-choice" key={photo.id}><input type="checkbox" name="photoIds" value={photo.id} defaultChecked={album.photoIds.includes(photo.id)} /><img src={`/api/class-photos/${encodeURIComponent(classId)}/${encodeURIComponent(photo.id)}`} alt={photo.name} loading="lazy" referrerPolicy="no-referrer" /><span>{photo.name}</span></label>)}
          </div>{!photos.length ? <p className="muted">Todavía no hay imágenes compatibles en esta carpeta. Súbelas en Drive y pulsa «Actualizar archivos».</p> : null}</fieldset>
          <div className="class-photo-actions"><button type="submit" name="intent" value="draft" className="secondary-button">Guardar borrador privado</button><button type="submit" name="intent" value="publish" disabled={!photos.length}>Publicar selección en las fichas</button>{album.published ? <button type="submit" name="intent" value="withdraw" className="secondary-button">Retirar de las fichas</button> : null}</div>
          <p className="muted">Publicar muestra solo las fotos seleccionadas y este texto a las familias autorizadas por su ficha. Retirar oculta la publicación y conserva los archivos privados de Drive.</p>
        </form>
      </>}
    </section>;
  } catch {
    return <section className="class-photos" id={`fotos-clase-${classId}`}><h2>Fotos del entrenamiento</h2><p className="form-error" role="alert">No se pueden cargar las fotos ahora. Vuelve a intentarlo más tarde.</p><p><a href={`https://drive.google.com/drive/folders/${encodeURIComponent(CLASS_PHOTO_ROOT_FOLDER_ID)}`} target="_blank" rel="noopener noreferrer">Abrir carpeta de entrenamientos</a></p></section>;
  }
}

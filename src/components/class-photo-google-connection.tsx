import { getClassPhotoGoogleStatus } from "@/lib/class-photo-google-auth";

export async function ClassPhotoGoogleConnection() {
  const status=await getClassPhotoGoogleStatus();
  return <details className="class-photo-connection"><summary>Conexión con Google Drive {status.connected ? "· conectada" : "· pendiente"}</summary>
    <p>Para mostrar también las fotos añadidas directamente en Drive, Google debe permitir a SKBC leerlas. Las carpetas siguen siendo privadas y las fichas solo muestran fotos de las clases a las que asistió cada alumno.</p>
    {status.error ? <p role="status">No se pudo comprobar la conexión. Las fotos ya publicadas se conservan.</p> : null}
    {status.configured ? <form action="/api/admin/class-photos/google/connect" method="post"><button type="submit">{status.connected ? "Renovar conexión con Google" : "Conectar Google para fotos de Drive"}</button></form> : <p>Falta configurar la conexión con Google en el sistema.</p>}
  </details>;
}

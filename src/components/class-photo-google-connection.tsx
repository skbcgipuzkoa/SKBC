import { getClassPhotoGoogleStatus } from "@/lib/class-photo-google-auth";

export async function ClassPhotoGoogleConnection() {
  const status=await getClassPhotoGoogleStatus();
  return <details className="class-photo-connection"><summary>Conexión con Google Drive {status.connected ? "· conectada" : "· pendiente"}</summary>
    <p>Para mostrar también las fotos añadidas directamente en Drive, Google debe permitir a SKBC leerlas. Google concede lectura de Drive; SKBC la utiliza para los archivos de esta carpeta y la conexión anterior sigue gestionando las carpetas. Las carpetas siguen siendo privadas y las fichas solo muestran fotos de las clases a las que asistió cada alumno.</p>
    {status.error ? <p role="status">No se pudo comprobar la conexión. Las fotos ya publicadas se conservan.</p> : null}
    <details><summary>Configurar el cliente web de Google</summary>
      <p>Usa un cliente web propio de SKBC. Su dirección de retorno es https://skbc.vercel.app/api/admin/class-photos/google/callback.</p>
      <form action="/api/admin/class-photos/google/config" method="post" autoComplete="off">
        <label>ID de cliente de Google<input name="clientId" type="text" required maxLength={256} autoComplete="off" /></label>
        <label>Secreto del cliente<input name="clientSecret" type="password" required maxLength={512} autoComplete="new-password" /></label>
        <button type="submit">Guardar conexión de fotos</button>
      </form>
      <p>Se guarda cifrada y no sustituye las conexiones de los demás servicios.</p>
    </details>
    {status.configured ? <form action="/api/admin/class-photos/google/connect" method="post"><button type="submit">{status.connected ? "Renovar conexión con Google" : "Conectar Google para fotos de Drive"}</button></form> : <p>Falta configurar la conexión con Google en el sistema.</p>}
  </details>;
}

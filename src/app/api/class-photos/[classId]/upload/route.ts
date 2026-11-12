import { hasInternalAccess } from "@/lib/auth";
import { uploadClassPhoto } from "@/lib/class-photos";
import { UPLOAD_MAX_BYTES } from "@/lib/class-photo-upload";
import { revalidatePath } from "next/cache";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const result=(status:number,error:string)=>Response.json({error},{status,headers});

export async function POST(request:Request,{params}:{params:Promise<{classId:string}>}) {
  if(!(await hasInternalAccess())) return result(401,"Acceso interno requerido.");
  if(request.headers.get("origin")!==new URL(request.url).origin) return result(403,"Origen no permitido.");
  const type=request.headers.get("content-type")??"";
  if(!type.toLowerCase().startsWith("multipart/form-data;")) return result(400,"Selecciona una foto.");
  const limit=UPLOAD_MAX_BYTES+64*1024;
  const declared=request.headers.get("content-length");
  if(declared && (!/^\d+$/.test(declared)||Number(declared)>limit)) return result(413,"La foto supera el tamaño permitido.");
  if(!request.body) return result(400,"Selecciona una foto.");
  try {
    const reader=request.body.getReader();const chunks:Uint8Array[]=[];let length=0;
    try {
      while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;
        if(length>limit){await reader.cancel();return result(413,"La foto supera el tamaño permitido.");}
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const body=new Uint8Array(length);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
    const form=await new Response(body,{headers:{"content-type":type}}).formData();
    const files=form.getAll("photo");const file=files[0];
    if(files.length!==1 || !(file instanceof File) || !file.size) return result(400,"Selecciona una sola foto por envío.");
    if(file.size>UPLOAD_MAX_BYTES) return result(413,"La foto supera los 3 MB.");
    const {classId}=await params;
    const saved=await uploadClassPhoto(classId,{name:file.name,mimeType:file.type,bytes:new Uint8Array(await file.arrayBuffer())});
    revalidatePath(`/clases/${encodeURIComponent(saved.legacyId)}`);
    return Response.json({id:saved.photo.id,name:saved.photo.name,published:saved.published},{headers});
  } catch (error) {
    if (error && typeof error === "object" && "photoDriveStage" in error) {
      const status = "photoDriveStatus" in error ? error.photoDriveStatus : null;
      console.error("Class photo upload failed in Drive", { stage: error.photoDriveStage, status });
      if (error.photoDriveStage === "credentials" || status === 401) {
        return result(503,"SKBC no ha podido conectarse a Google Drive. Revisa la conexión de Drive del sistema.");
      }
      if (status === 403 || status === 404) {
        return result(503,"Google Drive ha rechazado el acceso a la carpeta. Revisa los permisos y el espacio disponible.");
      }
      return result(503,"Google Drive no ha confirmado la subida. Revisa el álbum antes de volver a intentarlo.");
    }
    return result(400,"No se pudo subir la foto. Comprueba el formato y vuelve a intentarlo.");
  }
}

import {hasInternalAccess} from "@/lib/auth";
import {getIndividualWorkEditor,saveIndividualWork,workUuid} from "@/lib/attendance-individual-work";
export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:Request){
  if(!await hasInternalAccess())return reply({error:"Acceso interno requerido."},401);
  try{const editor=await getIndividualWorkEditor(new URL(request.url).searchParams.get("attendanceId")??"");return editor?reply(editor.view):reply({error:"Asistencia no encontrada."},404);}
  catch{return reply({error:"No se pudo cargar el trabajo técnico."},503);}
}
export async function POST(request:Request){
  if(!await hasInternalAccess())return reply({error:"Acceso interno requerido."},401);
  if(request.headers.get("origin")!==new URL(request.url).origin)return reply({error:"Origen no válido."},403);
  try{
    const reader=request.body?.getReader();if(!reader)return reply({error:"Solicitud no válida."},400);
    const decoder=new TextDecoder();let body="",size=0;
    try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){await reader.cancel();return reply({error:"Selección demasiado grande."},413);}body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode();}finally{reader.releaseLock();}
    let data;try{data=JSON.parse(body);}catch{return reply({error:"Solicitud no válida."},400);}
    const validIds=(ids:unknown):ids is string[]=>Array.isArray(ids)&&ids.length<=500&&ids.every(id=>typeof id==="string"&&workUuid.test(id));
    if(typeof data?.attendanceId!=="string"||!workUuid.test(data.attendanceId)||!["adjust","replace","reset"].includes(data.mode)||!validIds(data.removedIds)||!validIds(data.addedIds))return reply({error:"Selección no válida."},400);
    const result=await saveIndividualWork(data.attendanceId,data.mode,data.removedIds,data.addedIds);
    if(result==="missing")return reply({error:"Asistencia no encontrada."},404);
    if(result==="closing")return reply({error:"La clase se está actualizando. Espera a que termine y vuelve a intentarlo."},409);
    if(result==="closed")return reply({error:"Reabre la clase o comprueba la modalidad de asistencia antes de editar."},409);
    if(result==="invalid")return reply({error:"El plan o el catálogo han cambiado. Vuelve a abrir el ajuste."},409);
    return reply({ok:true});
  }catch{return reply({error:"No se pudo guardar el trabajo técnico."},503);}
}

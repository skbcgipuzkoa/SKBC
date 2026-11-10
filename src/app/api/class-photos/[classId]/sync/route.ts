import { syncClassPhotosForMember } from "@/lib/class-photos";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=30;
const headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
export async function POST(request:Request,{params}:{params:Promise<{classId:string}>}) {
  if(request.headers.get("origin")!==new URL(request.url).origin) return Response.json({error:"Origen no permitido."},{status:403,headers});
  try {
    if(!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({error:"Solicitud no válida."},{status:400,headers});
    const reader=request.body?.getReader();if(!reader)return Response.json({error:"Solicitud no válida."},{status:400,headers});
    const chunks:Uint8Array[]=[];let size=0;
    try {while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1024){await reader.cancel();return Response.json({error:"Solicitud no válida."},{status:413,headers});}chunks.push(part.value);}}
    finally {reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const data=JSON.parse(new TextDecoder().decode(bytes));
    if(typeof data?.fichaToken!=="string") return Response.json({error:"Solicitud no válida."},{status:400,headers});
    const result=await syncClassPhotosForMember((await params).classId,data.fichaToken);
    if(!result)return Response.json({error:"Álbum no disponible."},{status:404,headers});
    return Response.json(result,{headers});
  } catch {return Response.json({error:"No se pudieron actualizar las fotos ahora."},{status:503,headers});}
}

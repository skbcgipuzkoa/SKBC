import { authorizeClassPhoto } from "@/lib/class-photos";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const privateHeaders={"Cache-Control":"private, no-store, max-age=0","Pragma":"no-cache","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Vary":"Cookie"};
const imageTypes=new Set(["image/jpeg","image/png","image/webp","image/gif","image/avif"]);

export async function GET(request:Request,{params}:{params:Promise<{classId:string;fileId:string}>}) {
  try {
    const {classId,fileId}=await params;
    const fichaToken=new URL(request.url).searchParams.get("ficha");
    const response=await authorizeClassPhoto({classId,fileId,fichaToken});
    if(!response) return new Response("Foto no disponible.",{status:404,headers:privateHeaders});
    const type=response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if(!response.ok || !response.body || !type || !imageTypes.has(type))
      return new Response("Foto no disponible.",{status:404,headers:privateHeaders});
    const extension=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","image/avif":"avif"} as Record<string,string>)[type];
    const disposition=new URL(request.url).searchParams.get("download")==="1" ? `attachment; filename="SKBC-foto.${extension}"` : "inline";
    return new Response(response.body,{headers:{...privateHeaders,"Content-Type":type,"Content-Disposition":disposition}});
  } catch(error) {
    const info=error as {photoDriveStage?:unknown;photoDriveStatus?:unknown;photoDriveCode?:unknown};
    const stage=typeof info?.photoDriveStage==="string" && /^[a-z-]{1,20}$/.test(info.photoDriveStage)?info.photoDriveStage:"unavailable";
    const status=typeof info?.photoDriveStatus==="number" && Number.isInteger(info.photoDriveStatus)?info.photoDriveStatus:0;
    const reason=typeof info?.photoDriveCode==="string" && /^[A-Za-z0-9_-]{1,64}$/.test(info.photoDriveCode)?info.photoDriveCode:"unavailable";
    return new Response("Fotos temporalmente no disponibles.",{status:503,headers:{...privateHeaders,"X-SKBC-Photo-Failure":`${stage}-${status}`,"X-SKBC-Photo-Reason":reason}});
  }
}

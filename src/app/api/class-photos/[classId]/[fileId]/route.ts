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
    return new Response(response.body,{headers:{...privateHeaders,"Content-Type":type,"Content-Disposition":"inline"}});
  } catch {
    return new Response("Fotos temporalmente no disponibles.",{status:503,headers:privateHeaders});
  }
}

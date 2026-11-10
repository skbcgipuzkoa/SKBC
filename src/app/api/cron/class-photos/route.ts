import { withClassPhotoDriveDeadline } from "@/lib/class-photo-drive";
import { syncAllClassPhotos } from "@/lib/class-photos";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(request:Request) {
  const headers={"Cache-Control":"no-store"};
  const secret=process.env.CRON_SECRET;
  if(!secret || request.headers.get("authorization")!==`Bearer ${secret}`)return Response.json({error:"Unauthorized"},{status:401,headers});
  try {return Response.json(await withClassPhotoDriveDeadline(55000,syncAllClassPhotos),{headers});}
  catch {return Response.json({error:"No se pudieron sincronizar las fotos."},{status:503,headers});}
}

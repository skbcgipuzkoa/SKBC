import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAllPages } from "@/lib/load-all-pages";
import { ensureClassAlbum, fetchClassPhoto, getClassAlbum, listAlbumPhotos, listClassAlbums, saveClassAlbum } from "@/lib/class-photo-drive";
export type { AlbumRecord, DrivePhoto } from "@/lib/class-photo-drive";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fileIdPattern = /^[A-Za-z0-9_-]{10,200}$/;
const tokenPattern = /^[A-Za-z0-9_-]{8,256}$/;
type PhotoClass = {id:string; legacy_id:string|null; name:string; class_date:string; class_group:string};
type PhotoAttendance = {class_id:string; classes:{name:string;class_date:string}|null};
export type MemberClassPhoto = {classId:string;date:string;className:string;caption:string;photoIds:string[]};

async function internalClass(classId:string):Promise<PhotoClass> {
  if (!(await hasInternalAccess())) throw new Error("Acceso interno requerido.");
  if (!uuid.test(classId)) throw new Error("Clase no válida.");
  const {data,error}=await createAdminClient().from("classes")
    .select("id,legacy_id,name,class_date,class_group").eq("id",classId).single<PhotoClass>();
  if(error || !data || !data.legacy_id) throw new Error("No se pudo consultar la clase.");
  return data;
}

async function activeMember(fichaToken:string):Promise<string|null> {
  if (!tokenPattern.test(fichaToken)) return null;
  const {data,error}=await createAdminClient().from("members").select("id")
    .eq("ficha_token",fichaToken).eq("status","active").maybeSingle<{id:string}>();
  if(error) throw new Error("No se pudo comprobar el acceso a la ficha.");
  return data?.id??null;
}

export async function resolveClassPhotoReturn(classId:string) {
  const row=await internalClass(classId);
  return {legacyId:row.legacy_id!};
}

export async function getClassPhotoAdmin(classId:string) {
  await internalClass(classId);
  const album=await getClassAlbum(classId);
  return {album,photos:album?await listAlbumPhotos(album):[]};
}

export async function createClassPhotoAlbum(classId:string) {
  const row=await internalClass(classId);
  await ensureClassAlbum({classId:row.id,title:`${row.class_date} · ${row.class_group==="kids"?"Niños":"Adultos"} · ${row.name}`});
  return {legacyId:row.legacy_id!};
}

export async function saveClassPhotos(input:{classId:string;caption:string;photoIds:string[];intent:"draft"|"publish"|"withdraw";revision:string}) {
  const row=await internalClass(input.classId);
  if(typeof input.caption!=="string" || input.caption.length>2000 ||
    !Array.isArray(input.photoIds) || input.photoIds.length>24 ||
    input.photoIds.some(id=>typeof id!=="string" || !fileIdPattern.test(id)) ||
    new Set(input.photoIds).size!==input.photoIds.length ||
    !["draft","publish","withdraw"].includes(input.intent) ||
    typeof input.revision!=="string" || !input.revision || input.revision.length>500)
    throw new Error("Revisa el texto y las fotos seleccionadas.");
  if(input.intent==="publish" && !input.photoIds.length) throw new Error("Selecciona al menos una foto para publicar.");
  await saveClassAlbum({...input,caption:input.caption.trim()});
  return {legacyId:row.legacy_id!};
}

export async function getMemberClassPhotoHistory(fichaToken:string):Promise<MemberClassPhoto[]> {
  const memberId=await activeMember(fichaToken);
  if(!memberId) return [];
  const supabase=createAdminClient();
  const attendance=await loadAllPages<PhotoAttendance>((from,to)=>supabase.from("attendance_logs")
    .select("class_id,classes(name,class_date)").eq("member_id",memberId).order("id").range(from,to).returns<PhotoAttendance[]>());
  if(!attendance.length) return [];
  const byClass=new Map(attendance.filter(row=>row.classes && uuid.test(row.class_id)).map(row=>[row.class_id,row.classes!]));
  const albums=await listClassAlbums();
  return albums.flatMap(album=>{
    const clase=byClass.get(album.classId);
    if(!clase || !album.published?.photoIds.length) return [];
    return [{classId:album.classId,date:clase.class_date,className:clase.name,caption:album.published.caption,photoIds:album.published.photoIds}];
  }).sort((a,b)=>b.date.localeCompare(a.date)||a.classId.localeCompare(b.classId));
}

/** Every media request rechecks authorization; a Drive file ID alone grants nothing. */
export async function authorizeClassPhoto(input:{classId:string;fileId:string;fichaToken?:string|null}):Promise<Response|null> {
  if(!uuid.test(input.classId)||!fileIdPattern.test(input.fileId)) return null;
  const familyRequest=input.fichaToken!==undefined && input.fichaToken!==null;
  if(familyRequest) {
    const memberId=await activeMember(input.fichaToken!);
    if(!memberId) return null;
    const {data,error}=await createAdminClient().from("attendance_logs").select("class_id")
      .eq("member_id",memberId).eq("class_id",input.classId).limit(1).maybeSingle<{class_id:string}>();
    if(error) throw new Error("No se pudo comprobar la asistencia.");
    if(!data) return null;
  } else if(!(await hasInternalAccess())) return null;
  const album=await getClassAlbum(input.classId);
  if(!album || (familyRequest && !album.published?.photoIds.includes(input.fileId))) return null;
  return fetchClassPhoto(album,input.fileId);
}

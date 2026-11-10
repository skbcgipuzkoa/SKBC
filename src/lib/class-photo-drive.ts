import { CLASS_PHOTO_ALBUM_LIMIT, CLASS_PHOTO_MANIFEST_MAX_BYTES } from "@/lib/class-photo-limits";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { detectPhotoMime, UPLOAD_MAX_BYTES } from "./class-photo-upload";
import { getClassPhotoDriveAccessToken, getClassPhotoMediaAccessToken } from "./class-photo-google-auth";

export type AlbumRecord = { classId: string; folderId: string; title: string; caption: string; photoIds: string[]; published: { caption: string; photoIds: string[] } | null; revision: string; lastSyncedAt?:string; syncPending?:boolean; policyId?:string; policySeenPhotoIds?:string[] };
export type DrivePhoto = { id: string; name: string; mimeType: string; size?: string };
type DriveFile = DrivePhoto & { parents?: string[]; appProperties?: Record<string,string>; description?: string; version?: string; trashed?: boolean; createdTime?:string };
export const CLASS_PHOTO_ROOT_FOLDER_ID = process.env.SKBC_CLASS_PHOTOS_FOLDER_ID || '15Fl2RjeqV0ui-xCt8f6esGh6hzCTT5eS';
const api = 'https://www.googleapis.com/drive/v3/files';
const folderMime = 'application/vnd.google-apps.folder';
const safeId = /^[A-Za-z0-9_-]{1,200}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = 'id,name,mimeType,size,parents,appProperties,description,version,trashed,createdTime';
function fail(stage='validation',status=0,code?:string): never {throw Object.assign(new Error('No se pudo acceder al álbum de clase.'),{photoDriveStage:stage,photoDriveStatus:status,...(code?{photoDriveCode:code}:{})});}
function isDriveFailure(error:unknown):error is Error {return error instanceof Error && 'photoDriveStage' in error;}
function rootId() { const id=process.env.SKBC_CLASS_PHOTOS_FOLDER_ID || '15Fl2RjeqV0ui-xCt8f6esGh6hzCTT5eS'; if(!safeId.test(id)) fail(); return id; }
function validateClass(id:string) { if(!uuid.test(id)) throw new Error('Clase no válida.'); }
function selection(caption:unknown,ids:unknown): {caption:string;photoIds:string[]} {
  if(typeof caption!=='string'||caption.length>2000||!Array.isArray(ids)||ids.length>CLASS_PHOTO_ALBUM_LIMIT||ids.some(id=>typeof id!=='string'||!safeId.test(id))||new Set(ids).size!==ids.length) throw new Error('Texto o selección de fotos no válidos.');
  return {caption,photoIds:ids as string[]};
}
const deadlineContext = new AsyncLocalStorage<AbortSignal>();
function aborted(signal:AbortSignal) { if(signal.aborted) throw new Error('La operación de fotos ha tardado demasiado.'); }
function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T> {
  aborted(signal);
  return new Promise<T>((resolve,reject)=>{
    const onAbort=()=>{cleanup();reject(new Error('La operación de fotos ha tardado demasiado.'));};
    const cleanup=()=>signal.removeEventListener('abort',onAbort);
    signal.addEventListener('abort',onAbort,{once:true});
    promise.then(value=>{cleanup();if(signal.aborted)onAbort();else resolve(value);},error=>{cleanup();reject(error);});
  });
}
export async function withClassPhotoDriveDeadline<T>(timeoutMs:number,task:()=>Promise<T>):Promise<T> {
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0) throw new Error('Plazo no válido.');
  const controller=new AbortController();const parent=deadlineContext.getStore();
  const onParent=()=>controller.abort();parent?.addEventListener('abort',onParent,{once:true});
  if(parent?.aborted)controller.abort();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {return await deadlineContext.run(controller.signal,()=>{aborted(controller.signal);return abortable(Promise.resolve().then(task),controller.signal);});}
  finally {clearTimeout(timer);parent?.removeEventListener('abort',onParent);}
}
function requestSignal() { return deadlineContext.getStore() || AbortSignal.timeout(15000); }
async function boundedResponse(response:Response,signal:AbortSignal):Promise<Response> {
  // Drive metadata bodies are small. Binding readers also covers delayed bodies after fetch resolves.
  const json=response.json.bind(response),text=response.text.bind(response);
  response.json=()=>abortable(json(),signal);
  response.text=()=>abortable(text(),signal);
  return response;
}
type TokenCache = { promise: Promise<string>; expiresAt: number };
let tokenCache: TokenCache | null = null;
export function resetClassPhotoDriveToken():void { tokenCache=null; }
function driveToken(): TokenCache {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache;
  const entry: TokenCache = {
    promise: abortable(Promise.resolve().then(() => getClassPhotoDriveAccessToken()),AbortSignal.timeout(15000)),
    expiresAt: Date.now() + 60 * 1000
  };
  tokenCache = entry;
  void entry.promise.catch(() => { if (tokenCache === entry) tokenCache = null; });
  return entry;
}
async function request(url:string,init:RequestInit={}) {
  const signal = requestSignal();
  aborted(signal);
  const entry = driveToken();
  try {
    const token = await abortable(entry.promise,signal);
    aborted(signal);
    const headers = new Headers(init.headers);
    headers.set('authorization',`Bearer ${token}`);
    const response = await abortable(fetch(url,{...init,headers,signal,cache:'no-store',redirect:'error'}),signal);
    if (response.status === 401 && tokenCache === entry) tokenCache = null;
    if (response.status === 412) throw new Error('El álbum ha cambiado. Recarga antes de guardar.');
    if (!response.ok) fail('metadata',response.status);
    return boundedResponse(response,signal);
  } catch(error) {
    if(isDriveFailure(error) || (error instanceof Error && error.message==='El álbum ha cambiado. Recarga antes de guardar.')) throw error;
    fail('request');
  }
}
async function mediaFailureCode(response:Response,signal:AbortSignal):Promise<string|undefined> {
  const reader=response.body?.getReader();if(!reader)return undefined;
  try {
    const chunks:Uint8Array[]=[];let length=0;
    while(true){const part=await abortable(reader.read(),signal);if(part.done)break;length+=part.value.length;if(length>8192)return undefined;chunks.push(part.value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const data=await new Response(bytes).json();
    const code=data?.error?.errors?.[0]?.reason ?? data?.error?.status;
    return typeof code==='string' && /^[A-Za-z0-9_-]{1,64}$/.test(code)?code:undefined;
  } catch {return undefined;} finally {void reader.cancel().catch(()=>{});}
}
/** Only signed Drive media destinations are eligible for a cross-origin redirect. */
function trustedMediaDestination(url: URL): boolean {
  if(url.protocol!=='https:' || url.port || url.username || url.password || url.hash) return false;
  if(url.origin==='https://www.googleapis.com') return /^\/drive\/v3\/files\/[A-Za-z0-9_-]+$/.test(url.pathname) && url.searchParams.get('alt')==='media';
  return /^[a-z0-9-]+-apidata\.googleusercontent\.com$/.test(url.hostname) && /^\/(?:download\/drive|drive)\/v3\/files\/[A-Za-z0-9_-]+$/.test(url.pathname);
}
async function downloadMedia(url:string):Promise<Response> {
  const signal=requestSignal();aborted(signal);
  try {
    let current=new URL(url);
    if(!trustedMediaDestination(current) || current.origin!=='https://www.googleapis.com') fail();
    const token=await abortable(Promise.resolve().then(()=>getClassPhotoMediaAccessToken()),signal);aborted(signal);
    const seen=new Set<string>();
    for(let redirects=0;redirects<=3;redirects++) {
      if(seen.has(current.href)) fail();seen.add(current.href);
      const headers=new Headers();
      // Signed cross-origin URLs must never receive the Drive OAuth credential.
      if(current.origin==='https://www.googleapis.com') headers.set('authorization',`Bearer ${token}`);
      const response=await abortable(fetch(current.href,{method:'GET',headers,signal,cache:'no-store',redirect:'manual'}),signal);
      if([301,302,303,307,308].includes(response.status)) {
        const location=response.headers.get('location');
        await response.body?.cancel();
        if(!location || redirects===3) fail();
        const next=new URL(location,current);
        if(!trustedMediaDestination(next)) fail();
        current=next;continue;
      }
      if(!response.ok) fail(current.origin==='https://www.googleapis.com'?'api-media':'signed-media',response.status,await mediaFailureCode(response,signal));return boundedResponse(response,signal);
    }
    fail();
  } catch(error) {if(isDriveFailure(error))throw error;fail('download');}
}
async function readFile(id:string) { if(!safeId.test(id)) fail(); const response=await request(`${api}/${id}?fields=${fields}&supportsAllDrives=true`);return {file:await response.json() as DriveFile,etag:response.headers.get('etag')}; }
function parse(file:DriveFile,etag?:string|null):AlbumRecord|null {
  if(file.trashed||file.mimeType!==folderMime||file.appProperties?.skbcClassAlbum!=='1'||!safeId.test(file.id)) return null;
  try {const data=JSON.parse(file.description||''); if(data.version!==1||!uuid.test(data.classId)||data.classId!==file.appProperties.skbcClassId||!['draft','published'].includes(data.state)) return null;
    const draft=selection(data.caption,data.photoIds);const published=null;

    return {classId:data.classId,folderId:file.id,title:file.name,...draft,published,revision:etag||`version:${file.version||''}`,lastSyncedAt:file.appProperties?.skbcPhotoLastSync,syncPending:file.appProperties?.skbcPhotoSyncPending==='1'};
  } catch { return null; }
}
async function listFiles(query:string) {
  const files:DriveFile[]=[];let pageToken='';const seen=new Set<string>();
  do {const params=new URLSearchParams({q:query,fields:`nextPageToken,files(${fields})`,pageSize:'100',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});if(pageToken) params.set('pageToken',pageToken);const response=await request(`${api}?${params}`);const data=await response.json() as {files?:DriveFile[];nextPageToken?:string};if(!Array.isArray(data.files)) fail();files.push(...data.files);pageToken=data.nextPageToken||'';if(pageToken&&seen.has(pageToken)) fail();seen.add(pageToken);}while(pageToken);
  return files;
}
export async function listClassAlbums():Promise<AlbumRecord[]> {
  const files=await albumCandidates();
  const albums: AlbumRecord[] = [];
  for (const file of files) { const album=await scopedAlbum(file); if(album) albums.push(await resolvePublication(file,album)); }
  return albums;
}
export async function getClassAlbum(classId:string):Promise<AlbumRecord|null> {
  validateClass(classId);
  // Media requests need only this class; never download every other published manifest.
  const folders=await albumCandidates(classId);
  const found=folders.map(file=>parse(file)).filter((album):album is AlbumRecord=>album!==null && album.classId===classId);
  if(found.length>1) throw new Error('Hay varios álbumes para esta clase. Revisa Drive.');if(!found.length) return null;
  const current=await readFile(found[0].folderId);const album=await scopedAlbum(current.file,current.etag);return album?.classId===classId?resolvePublication(current.file,album):null;
}
function albumDate(title:string,date?:string) {
  const value=date || title.slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value) throw new Error('Fecha de clase no válida.');
  return value;
}
async function scopedAlbum(file:DriveFile,etag?:string|null):Promise<AlbumRecord|null> {
  const album=parse(file,etag);if(!album||file.parents?.length!==1)return null;
  if(file.parents[0]===rootId())return album;
  let date:string;try{date=albumDate(file.name,file.appProperties?.skbcClassDate);}catch{return null;}
  const month=(await readFile(file.parents[0])).file;
  if(month.trashed||month.mimeType!==folderMime||month.parents?.length!==1||month.appProperties?.skbcClassPhotoMonth!==date.slice(0,7))return null;
  const year=(await readFile(month.parents[0])).file;
  if(year.trashed||year.mimeType!==folderMime||year.parents?.length!==1||year.parents[0]!==rootId()||year.appProperties?.skbcClassPhotoYear!==date.slice(0,4))return null;
  return album;
}
async function albumCandidates(classId?:string) {
  const files=await listFiles(`trashed = false and mimeType = '${folderMime}' and appProperties has { key='skbcClassAlbum' and value='1' }${classId?` and appProperties has { key='skbcClassId' and value='${classId}' }`:''}`);
  const result:DriveFile[]=[];
  for(const file of files){const album=await scopedAlbum(file);if(album&&(!classId||album.classId===classId))result.push(file);}
  return result;
}
async function ensureDateFolder(parent:string,key:string,value:string,name:string) {
  const candidates=async()=>(await listFiles(`'${parent}' in parents and trashed = false and mimeType = '${folderMime}' and appProperties has { key='${key}' and value='${value}' }`)).filter(file=>!file.trashed&&file.mimeType===folderMime&&file.parents?.length===1&&file.parents[0]===parent&&file.appProperties?.[key]===value).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const existing=await candidates();if(existing.length)return existing[0].id;
  const response=await request(`${api}?fields=${fields}&supportsAllDrives=true`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,mimeType:folderMime,parents:[parent],appProperties:{[key]:value}})});
  const file=await response.json() as DriveFile;if(!safeId.test(file.id))fail();
  // Concurrent bucket creation is harmless: converge on a deterministic owned bucket.
  const observed=await candidates();return observed[0]?.id||file.id;
}
export async function ensureClassAlbum(input:{classId:string;title:string;date?:string}):Promise<AlbumRecord> {
  validateClass(input.classId);if(typeof input.title!=='string'||!input.title.trim()||input.title.length>200)throw new Error('Título no válido.');
  const date=albumDate(input.title,input.date);const existing=await getClassAlbum(input.classId);
  const year=await ensureDateFolder(rootId(),'skbcClassPhotoYear',date.slice(0,4),date.slice(0,4));
  const monthNames=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const month=await ensureDateFolder(year,'skbcClassPhotoMonth',date.slice(0,7),`${date.slice(5,7)} · ${monthNames[Number(date.slice(5,7))-1]}`);
  if(existing){
    const current=await readFile(existing.folderId);const checked=await scopedAlbum(current.file,current.etag);if(!checked||checked.classId!==input.classId)fail();
    const previousParent=current.file.parents![0];
    if(previousParent!==month || current.file.appProperties?.skbcClassDate!==date){
      const headers:Record<string,string>={'content-type':'application/json'};if(current.etag)headers['if-match']=current.etag;
      const move=previousParent!==month?`&addParents=${month}&removeParents=${previousParent}`:'';
      await request(`${api}/${existing.folderId}?supportsAllDrives=true${move}`,{method:'PATCH',headers,body:JSON.stringify({appProperties:{skbcClassDate:date}})});
    }
    return (await getClassAlbum(input.classId))!;
  }
  const response=await request(`${api}?fields=${fields}&supportsAllDrives=true`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:input.title.trim(),mimeType:folderMime,parents:[month],appProperties:{skbcClassAlbum:'1',skbcClassId:input.classId,skbcClassDate:date},description:JSON.stringify({version:1,classId:input.classId,caption:'',photoIds:[],published:null,state:'draft',syncSeenPhotoIds:[]})})});
  const album=await scopedAlbum(await response.json(),response.headers.get('etag'));if(!album)fail();return album;
}
function validPhoto(file:DriveFile,folderId:string) { return !file.trashed&&file.parents?.includes(folderId)&&['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(file.mimeType)&&typeof file.size==='string'&&/^\d+$/.test(file.size)&&Number(file.size)<=20*1024*1024; }
async function currentAlbum(album:AlbumRecord) {const current=await readFile(album.folderId);const parsed=await scopedAlbum(current.file,current.etag);if(!parsed||parsed.classId!==album.classId) fail();return parsed;}
export async function listAlbumPhotos(album:AlbumRecord):Promise<DrivePhoto[]> {
  await currentAlbum(album);return (await listFiles(`'${album.folderId}' in parents and trashed = false`)).filter(file=>validPhoto(file,album.folderId)).map(({id,name,mimeType,size})=>({id,name,mimeType,size}));
}
async function resolvePublication(folder:DriveFile,album:AlbumRecord):Promise<AlbumRecord> {
  const policy=await latestPolicy(album);
  const effective=policy?{...album,published:policy.published,policyId:policy.id,policySeenPhotoIds:policy.seenPhotoIds}:album;
  const pointer=folder.appProperties?.skbcPublishedAlbum;
  if(!pointer) return effective;
  if(!safeId.test(pointer)) fail();
  let file:DriveFile;
  try{file=(await readFile(pointer)).file;}catch(error){if(policy)return effective;throw error;}
  if(policy&&file.appProperties?.skbcClassPhotoPolicyId!==policy.id)return effective;
  if(file.trashed || file.mimeType!=='application/json' || !file.parents?.includes(album.folderId) || file.appProperties?.skbcClassAlbumManifest!=='1' || file.appProperties?.skbcClassId!==album.classId || !file.size || !/^\d+$/.test(file.size) || Number(file.size)>CLASS_PHOTO_MANIFEST_MAX_BYTES) fail();
  const response=await downloadMedia(`${api}/${pointer}?alt=media&supportsAllDrives=true`);
  const raw=await response.text();if(new TextEncoder().encode(raw).length>CLASS_PHOTO_MANIFEST_MAX_BYTES) fail();
  try {const data=JSON.parse(raw);if(data.version!==1 || data.classId!==album.classId) fail();
    if((data.policyId||'legacy')!==(policy?.id||'legacy'))return effective;
    return {...effective,published:selection(data.caption,data.photoIds)};
  }catch{fail();}
}
async function createPublication(album:AlbumRecord,published:{caption:string;photoIds:string[]}) {
  const content=JSON.stringify({version:1,classId:album.classId,policyId:album.policyId||'legacy',...published});
  if(new TextEncoder().encode(content).length>CLASS_PHOTO_MANIFEST_MAX_BYTES) fail();
  const boundary='skbc_album_manifest';
  const metadata={name:'Publicación del álbum.json',mimeType:'application/json',parents:[album.folderId],appProperties:{skbcClassAlbumManifest:'1',skbcClassId:album.classId,skbcClassPhotoPolicyId:album.policyId||'legacy'}};
  const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--\r\n`;
  const response=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true',{method:'POST',headers:{'content-type':`multipart/related; boundary=${boundary}`},body});
  const data=await response.json() as {id?:string};if(!data.id || !safeId.test(data.id)) fail();return data.id;
}
type PhotoPolicy = {id:string;published:AlbumRecord['published'];seenPhotoIds:string[]};
function policyTime(file:DriveFile) {
  const match=file.createdTime?.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/);
  if(!match)fail();return `${match[1]}.${(match[2]||'').padEnd(9,'0')}`;
}
async function latestPolicy(album:AlbumRecord):Promise<PhotoPolicy|null> {
  const files=(await listFiles(`'${album.folderId}' in parents and trashed = false and appProperties has { key='skbcClassPhotoPolicy' and value='1' }`)).filter(file=>file.appProperties?.skbcClassPhotoPolicy==='1');
  if(files.length>500)fail();
  for(const file of files){if(file.trashed||file.mimeType!=='application/json'||file.parents?.length!==1||file.parents[0]!==album.folderId||file.appProperties?.skbcClassId!==album.classId||!safeId.test(file.id)||!/^\d+$/.test(file.size||'')||Number(file.size)>30000)fail();policyTime(file);}
  files.sort((a,b)=>{const x=policyTime(a),y=policyTime(b);return x<y?1:x>y?-1:a.id<b.id?1:a.id>b.id?-1:0;});
  if(!files.length)return null;
  const file=files[0];const response=await downloadMedia(`${api}/${file.id}?alt=media&supportsAllDrives=true`);
  const raw=await response.text();if(new TextEncoder().encode(raw).length>30000)fail();
  try{const data=JSON.parse(raw);if(data.version!==1||data.classId!==album.classId||!Array.isArray(data.seenPhotoIds))fail();
    const seenPhotoIds=readSeen({syncSeenPhotoIds:data.seenPhotoIds});
    const published=data.published===null?null:selection(data.published?.caption,data.published?.photoIds);
    return {id:file.id,published,seenPhotoIds};
  }catch{fail();}
}
/** Immutable manual decision: automatic writers can never replace or undo this record. */
async function createPolicy(album:AlbumRecord,published:AlbumRecord['published'],seen:Set<string>) {
  syncDescription({},seen);
  const content=JSON.stringify({version:1,classId:album.classId,published,seenPhotoIds:[...seen]});
  if(new TextEncoder().encode(content).length>30000)fail();
  const boundary='skbc_album_policy';
  const metadata={name:'Decisión de publicación del álbum.json',mimeType:'application/json',parents:[album.folderId],appProperties:{skbcClassPhotoPolicy:'1',skbcClassId:album.classId}};
  const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--\r\n`;
  const response=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true',{method:'POST',headers:{'content-type':`multipart/related; boundary=${boundary}`},body});
  const data=await response.json() as {id?:string};if(!data.id||!safeId.test(data.id))fail();return data.id;
}
export async function saveClassAlbum(input:{classId:string;caption:string;photoIds:string[];intent:'draft'|'publish'|'withdraw';revision:string;preserveDraft?:boolean}):Promise<void> {
  if(!['draft','publish','withdraw'].includes(input.intent)) fail();
  validateClass(input.classId);
  // Read only the album folder here: withdrawal must work even if an original or old manifest was deleted.
  const candidates=await albumCandidates(input.classId);
  if(candidates.length!==1) fail();
  const current=await readFile(candidates[0].id);const album=await scopedAlbum(current.file,current.etag);if(!album) fail();
  if(!input.revision || input.revision!==album.revision) throw new Error('El álbum ha cambiado. Recarga antes de guardar.');
  const previous=JSON.parse(current.file.description||'{}');
  const seen=new Set<string>(readSeen(previous));
  const activePolicy=input.intent==='draft'?null:await latestPolicy(album);
  for(const id of activePolicy?.seenPhotoIds||[])seen.add(id);
  const availablePhotos=input.intent==='withdraw'?null:await listFiles(`'${album.folderId}' in parents and trashed = false`);
  if(input.intent==='publish'&&input.preserveDraft){for(const id of input.photoIds)seen.add(id);}
  else if(input.intent!=='draft')for(const file of availablePhotos??await listFiles(`'${album.folderId}' in parents and trashed = false`))if(validPhoto(file,album.folderId))seen.add(file.id);
  let update:object;
  if(input.intent==='withdraw') {
    await createPolicy(album,null,seen);
    update={description:syncDescription(previous,seen),appProperties:{skbcPublishedAlbum:null}};
  } else {
    const draft=selection(input.caption,input.photoIds);
    const available=new Map((availablePhotos||[]).map(file=>[file.id,file]));
    for(const id of draft.photoIds){const file=available.get(id);if(!file||!validPhoto(file,album.folderId)) throw new Error('Una foto ya no está disponible en este álbum.');}
    const draftData={...previous,version:1,classId:album.classId,...draft,state:'draft'};
    const description=input.intent==='draft'?JSON.stringify(draftData):syncDescription(draftData,seen);
    const preservedDescription=previous.syncSeenPhotoIds===undefined?JSON.stringify(previous):syncDescription(previous,seen);
    if(input.intent==='publish'){
      const policy=input.preserveDraft?activePolicy:null;
      const publication=policy?{caption:policy.published?.caption??'',photoIds:draft.photoIds.filter(id=>!policy.seenPhotoIds.includes(id)||policy.published?.photoIds.includes(id))}:draft;
      const policyId=input.preserveDraft?policy?.id:await createPolicy(album,draft,seen);
      update={description:input.preserveDraft?preservedDescription:description,appProperties:{skbcPublishedAlbum:await createPublication({...album,policyId},publication)}};
    }else update={description};
  }
  const headers:Record<string,string>={'content-type':'application/json'};if(!album.revision.startsWith('version:')) headers['if-match']=album.revision;
  await request(`${api}/${album.folderId}?supportsAllDrives=true`,{method:'PATCH',headers,body:JSON.stringify(update)});
}
export async function fetchClassPhoto(album:AlbumRecord,fileId:string):Promise<Response> {
  await currentAlbum(album);const {file}=await readFile(fileId);if(!validPhoto(file,album.folderId)) fail();return downloadMedia(`${api}/${fileId}?alt=media&supportsAllDrives=true`);
}


/** Adds one private original; publishing remains a separate explicit operation. */
export async function uploadAlbumPhoto(album:AlbumRecord,input:{name:string;bytes:Uint8Array;mimeType:string}):Promise<DrivePhoto> {
  if(!(input.bytes instanceof Uint8Array) || input.bytes.length===0 || input.bytes.length>UPLOAD_MAX_BYTES) throw new Error('La foto debe ocupar como máximo 3 MB.');
  const mimeType=detectPhotoMime(input.bytes);
  if(!mimeType || mimeType!==input.mimeType) throw new Error('Solo se admiten fotos JPEG, PNG o WebP válidas.');
  if(typeof input.name!=='string') throw new Error('Nombre de foto no válido.');
  const name=input.name.replace(/[\u0000-\u001f\u007f-\u009f/\\]/g,'').trim().slice(0,160);
  if(!name) throw new Error('Nombre de foto no válido.');
  await currentAlbum(album);
  const boundary=`skbc_private_photo_${randomUUID()}`;
  const metadata={name,mimeType,parents:[album.folderId]};
  // Blob keeps the original binary bytes intact and exists only for this request.
  const body=new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    new Uint8Array(input.bytes),
    `\r\n--${boundary}--\r\n`
  ]);
  const response=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size&supportsAllDrives=true',{method:'POST',headers:{'content-type':`multipart/related; boundary=${boundary}`},body});
  const result=await response.json() as DrivePhoto;
  if(!safeId.test(result.id||'') || typeof result.name!=='string' || result.mimeType!==mimeType || !/^\d+$/.test(result.size||'') || Number(result.size)!==input.bytes.length) fail();
  return {id:result.id,name:result.name,mimeType:result.mimeType,size:result.size};
}

function readSeen(data:{syncSeenPhotoIds?:unknown}):string[] {
  if(data.syncSeenPhotoIds===undefined)return [];
  if(!Array.isArray(data.syncSeenPhotoIds)||data.syncSeenPhotoIds.length>500||data.syncSeenPhotoIds.some(id=>typeof id!=='string'||!safeId.test(id)))fail();
  return data.syncSeenPhotoIds as string[];
}
function syncDescription(data:Record<string,unknown>,seen:Set<string>) {
  if(seen.size>500)throw new Error('El historial de fotos del álbum está lleno.');
  const content=JSON.stringify({...data,syncSeenPhotoIds:[...seen]});if(new TextEncoder().encode(content).length>30000)throw new Error('El historial de fotos del álbum está lleno.');return content;
}
export type ClassAlbumSyncResult = { album:AlbumRecord; added:number; blocked:number; limitReached:boolean; baseline:boolean; pending:boolean };
/** Discovers originals in the exact class folder, leaving saved editor selections intact. */
export async function syncClassAlbumPhotos(classId:string):Promise<ClassAlbumSyncResult> {
  return withClassPhotoDriveDeadline(15000,async()=>{
    const album=await getClassAlbum(classId);if(!album)throw new Error('No existe álbum para esta clase.');
    const current=await readFile(album.folderId);const verified=await scopedAlbum(current.file,current.etag);if(!verified)fail();
    if(verified.revision!==album.revision)throw new Error('El álbum ha cambiado. Recarga antes de guardar.');
    const data=JSON.parse(current.file.description||'{}');const baseline=data.syncSeenPhotoIds===undefined;
    const seen=new Set(readSeen(data));
    for(const id of [...album.photoIds,...(album.published?.photoIds||[]),...(album.policySeenPhotoIds||[])])seen.add(id);
    const photoIds=[...(album.published?.photoIds||[])];let added=0,blocked=0,limitReached=false;
    const photos=await listAlbumPhotos(album);
    // Retry unavailable media after this discovery run has visited every candidate.
    const deferred=new Set(album.syncPending?readSeen({syncSeenPhotoIds:data.syncDeferredPhotoIds}):[]);
    let examined=0;let pending=false;
    for(const photo of photos){
      if(baseline){seen.add(photo.id);continue;}
      if(seen.has(photo.id)||deferred.has(photo.id))continue;
      if(photoIds.length>=CLASS_PHOTO_ALBUM_LIMIT){limitReached=true;continue;}
      if(examined>=3){pending=true;continue;}
      examined++;
      try{
        const response=await fetchClassPhoto(album,photo.id);
        const mime=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        let readable=!!response.body&&!!mime&&['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(mime);
        if(readable&&response.body){const reader=response.body.getReader();try{const first=await abortable(reader.read(),requestSignal());readable=!first.done&&first.value.length>0;}finally{await reader.cancel();}}
        else await response.body?.cancel();
        if(!readable){blocked++;deferred.add(photo.id);continue;}
      }
      catch(error){if(isDriveFailure(error)&&['api-media','signed-media'].includes((error as Error & {photoDriveStage:string}).photoDriveStage)){blocked++;deferred.add(photo.id);continue;}throw error;}
      seen.add(photo.id);photoIds.push(photo.id);added++;
    }
    const lastSyncedAt=new Date().toISOString();
    const update:{description:string;appProperties:Record<string,string>}={description:syncDescription({...data,syncDeferredPhotoIds:pending?[...deferred]:[]},seen),appProperties:{skbcPhotoLastSync:lastSyncedAt,skbcPhotoSyncPending:pending?'1':'0'}};
    const published={caption:album.published?.caption ?? '',photoIds};
    if(added)update.appProperties.skbcPublishedAlbum=await createPublication(album,published);
    const headers:Record<string,string>={'content-type':'application/json'};if(!verified.revision.startsWith('version:'))headers['if-match']=verified.revision;
    await request(`${api}/${album.folderId}?supportsAllDrives=true`,{method:'PATCH',headers,body:JSON.stringify(update)});
    return {album:{...album,published:added?published:album.published,lastSyncedAt,syncPending:pending},added,blocked,limitReached,baseline,pending};
  });
}


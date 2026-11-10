import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { detectPhotoMime, UPLOAD_MAX_BYTES } from "./class-photo-upload";
import { getGoogleDriveAccessToken } from "./google-drive-api";

export type AlbumRecord = { classId: string; folderId: string; title: string; caption: string; photoIds: string[]; published: { caption: string; photoIds: string[] } | null; revision: string };
export type DrivePhoto = { id: string; name: string; mimeType: string; size?: string };
type DriveFile = DrivePhoto & { parents?: string[]; appProperties?: Record<string,string>; description?: string; version?: string; trashed?: boolean };
export const CLASS_PHOTO_ROOT_FOLDER_ID = process.env.SKBC_CLASS_PHOTOS_FOLDER_ID || '15Fl2RjeqV0ui-xCt8f6esGh6hzCTT5eS';
const api = 'https://www.googleapis.com/drive/v3/files';
const folderMime = 'application/vnd.google-apps.folder';
const safeId = /^[A-Za-z0-9_-]{1,200}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = 'id,name,mimeType,size,parents,appProperties,description,version,trashed';
function fail(stage='validation',status=0,code?:string): never {throw Object.assign(new Error('No se pudo acceder al álbum de clase.'),{photoDriveStage:stage,photoDriveStatus:status,...(code?{photoDriveCode:code}:{})});}
function isDriveFailure(error:unknown):error is Error {return error instanceof Error && 'photoDriveStage' in error;}
function rootId() { const id=process.env.SKBC_CLASS_PHOTOS_FOLDER_ID || '15Fl2RjeqV0ui-xCt8f6esGh6hzCTT5eS'; if(!safeId.test(id)) fail(); return id; }
function validateClass(id:string) { if(!uuid.test(id)) throw new Error('Clase no válida.'); }
function selection(caption:unknown,ids:unknown): {caption:string;photoIds:string[]} {
  if(typeof caption!=='string'||caption.length>2000||!Array.isArray(ids)||ids.length>24||ids.some(id=>typeof id!=='string'||!safeId.test(id))||new Set(ids).size!==ids.length) throw new Error('Texto o selección de fotos no válidos.');
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
function driveToken(): TokenCache {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache;
  const entry: TokenCache = {
    promise: abortable(Promise.resolve().then(() => getGoogleDriveAccessToken()),AbortSignal.timeout(15000)),
    expiresAt: Date.now() + 45 * 60 * 1000
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
  const entry=driveToken();
  try {
    let current=new URL(url);
    if(!trustedMediaDestination(current) || current.origin!=='https://www.googleapis.com') fail();
    const token=await abortable(entry.promise,signal);aborted(signal);
    const seen=new Set<string>();
    for(let redirects=0;redirects<=3;redirects++) {
      if(seen.has(current.href)) fail();seen.add(current.href);
      const headers=new Headers();
      // Signed cross-origin URLs must never receive the Drive OAuth credential.
      if(current.origin==='https://www.googleapis.com') headers.set('authorization',`Bearer ${token}`);
      const response=await abortable(fetch(current.href,{method:'GET',headers,signal,cache:'no-store',redirect:'manual'}),signal);
      if(response.status===401 && current.origin==='https://www.googleapis.com' && tokenCache===entry) tokenCache=null;
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
  if(file.trashed||file.mimeType!==folderMime||!file.parents?.includes(rootId())||file.appProperties?.skbcClassAlbum!=='1'||!safeId.test(file.id)) return null;
  try {const data=JSON.parse(file.description||''); if(data.version!==1||!uuid.test(data.classId)||data.classId!==file.appProperties.skbcClassId||!['draft','published'].includes(data.state)) return null;
    const draft=selection(data.caption,data.photoIds);const published=null;

    return {classId:data.classId,folderId:file.id,title:file.name,...draft,published,revision:etag||`version:${file.version||''}`};
  } catch { return null; }
}
async function listFiles(query:string) {
  const files:DriveFile[]=[];let pageToken='';const seen=new Set<string>();
  do {const params=new URLSearchParams({q:query,fields:`nextPageToken,files(${fields})`,pageSize:'100',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});if(pageToken) params.set('pageToken',pageToken);const response=await request(`${api}?${params}`);const data=await response.json() as {files?:DriveFile[];nextPageToken?:string};if(!Array.isArray(data.files)) fail();files.push(...data.files);pageToken=data.nextPageToken||'';if(pageToken&&seen.has(pageToken)) fail();seen.add(pageToken);}while(pageToken);
  return files;
}
export async function listClassAlbums():Promise<AlbumRecord[]> {
  const files=await listFiles(`'${rootId()}' in parents and trashed = false and mimeType = '${folderMime}' and appProperties has { key='skbcClassAlbum' and value='1' }`);
  const albums: AlbumRecord[] = [];
  for (const file of files) { const album=parse(file); if(album) albums.push(await resolvePublication(file,album)); }
  return albums;
}
export async function getClassAlbum(classId:string):Promise<AlbumRecord|null> {
  validateClass(classId);
  // Media requests need only this class; never download every other published manifest.
  const folders=await listFiles(`'${rootId()}' in parents and trashed = false and mimeType = '${folderMime}' and appProperties has { key='skbcClassAlbum' and value='1' } and appProperties has { key='skbcClassId' and value='${classId}' }`);
  const found=folders.map(file=>parse(file)).filter((album):album is AlbumRecord=>album!==null && album.classId===classId);
  if(found.length>1) throw new Error('Hay varios álbumes para esta clase. Revisa Drive.');if(!found.length) return null;
  const current=await readFile(found[0].folderId);const album=parse(current.file,current.etag);return album?.classId===classId?resolvePublication(current.file,album):null;
}
export async function ensureClassAlbum(input:{classId:string;title:string}):Promise<AlbumRecord> {
  validateClass(input.classId);if(typeof input.title!=='string'||!input.title.trim()||input.title.length>200) throw new Error('Título no válido.');const existing=await getClassAlbum(input.classId);if(existing) return existing;
  const response=await request(`${api}?fields=${fields}&supportsAllDrives=true`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:input.title.trim(),mimeType:folderMime,parents:[rootId()],appProperties:{skbcClassAlbum:'1',skbcClassId:input.classId},description:JSON.stringify({version:1,classId:input.classId,caption:'',photoIds:[],published:null,state:'draft'})})});
  const album=parse(await response.json(),response.headers.get('etag'));if(!album) fail();return album;
}
function validPhoto(file:DriveFile,folderId:string) { return !file.trashed&&file.parents?.includes(folderId)&&['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(file.mimeType)&&typeof file.size==='string'&&/^\d+$/.test(file.size)&&Number(file.size)<=20*1024*1024; }
async function currentAlbum(album:AlbumRecord) {const current=await readFile(album.folderId);const parsed=parse(current.file,current.etag);if(!parsed||parsed.classId!==album.classId) fail();return parsed;}
export async function listAlbumPhotos(album:AlbumRecord):Promise<DrivePhoto[]> {
  await currentAlbum(album);return (await listFiles(`'${album.folderId}' in parents and trashed = false`)).filter(file=>validPhoto(file,album.folderId)).map(({id,name,mimeType,size})=>({id,name,mimeType,size}));
}
async function resolvePublication(folder:DriveFile,album:AlbumRecord):Promise<AlbumRecord> {
  const pointer=folder.appProperties?.skbcPublishedAlbum;
  if(!pointer) return album;
  if(!safeId.test(pointer)) fail();
  const {file}=await readFile(pointer);
  if(file.trashed || file.mimeType!=='application/json' || !file.parents?.includes(album.folderId) || file.appProperties?.skbcClassAlbumManifest!=='1' || file.appProperties?.skbcClassId!==album.classId || !file.size || !/^\d+$/.test(file.size) || Number(file.size)>16384) fail();
  const response=await downloadMedia(`${api}/${pointer}?alt=media&supportsAllDrives=true`);
  const raw=await response.text();if(new TextEncoder().encode(raw).length>16384) fail();
  try {const data=JSON.parse(raw);if(data.version!==1 || data.classId!==album.classId) fail();return {...album,published:selection(data.caption,data.photoIds)};}catch{fail();}
}
async function createPublication(album:AlbumRecord,published:{caption:string;photoIds:string[]}) {
  const content=JSON.stringify({version:1,classId:album.classId,...published});
  if(new TextEncoder().encode(content).length>16384) fail();
  const boundary='skbc_album_manifest';
  const metadata={name:'Publicación del álbum.json',mimeType:'application/json',parents:[album.folderId],appProperties:{skbcClassAlbumManifest:'1',skbcClassId:album.classId}};
  const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--\r\n`;
  const response=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true',{method:'POST',headers:{'content-type':`multipart/related; boundary=${boundary}`},body});
  const data=await response.json() as {id?:string};if(!data.id || !safeId.test(data.id)) fail();return data.id;
}
export async function saveClassAlbum(input:{classId:string;caption:string;photoIds:string[];intent:'draft'|'publish'|'withdraw';revision:string;preserveDraft?:boolean}):Promise<void> {
  if(!['draft','publish','withdraw'].includes(input.intent)) fail();
  validateClass(input.classId);
  // Read only the album folder here: withdrawal must work even if an original or old manifest was deleted.
  const candidates=(await listFiles(`'${rootId()}' in parents and trashed = false and mimeType = '${folderMime}' and appProperties has { key='skbcClassAlbum' and value='1' }`)).filter(file=>parse(file)?.classId===input.classId);
  if(candidates.length!==1) fail();
  const current=await readFile(candidates[0].id);const album=parse(current.file,current.etag);if(!album) fail();
  if(!input.revision || input.revision!==album.revision) throw new Error('El álbum ha cambiado. Recarga antes de guardar.');
  let update:object;
  if(input.intent==='withdraw') {
    update={appProperties:{skbcPublishedAlbum:null}};
  } else {
    const draft=selection(input.caption,input.photoIds);
    for(const id of draft.photoIds){const {file}=await readFile(id);if(!validPhoto(file,album.folderId)) throw new Error('Una foto ya no está disponible en este álbum.');}
    const description=JSON.stringify({version:1,classId:album.classId,...draft,state:'draft'});
    update=input.intent==='publish'?{...(input.preserveDraft ? {} : {description}),appProperties:{skbcPublishedAlbum:await createPublication(album,draft)}}:{description};
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


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
function fail(): never { throw new Error('No se pudo acceder al álbum de clase.'); }
function rootId() { const id=process.env.SKBC_CLASS_PHOTOS_FOLDER_ID || '15Fl2RjeqV0ui-xCt8f6esGh6hzCTT5eS'; if(!safeId.test(id)) fail(); return id; }
function validateClass(id:string) { if(!uuid.test(id)) throw new Error('Clase no válida.'); }
function selection(caption:unknown,ids:unknown): {caption:string;photoIds:string[]} {
  if(typeof caption!=='string'||caption.length>2000||!Array.isArray(ids)||ids.length>24||ids.some(id=>typeof id!=='string'||!safeId.test(id))||new Set(ids).size!==ids.length) throw new Error('Texto o selección de fotos no válidos.');
  return {caption,photoIds:ids as string[]};
}
type TokenCache = { promise: Promise<string>; expiresAt: number };
let tokenCache: TokenCache | null = null;
function driveToken(): TokenCache {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache;
  const entry: TokenCache = {
    promise: Promise.resolve().then(() => getGoogleDriveAccessToken()),
    expiresAt: Date.now() + 45 * 60 * 1000
  };
  tokenCache = entry;
  void entry.promise.catch(() => { if (tokenCache === entry) tokenCache = null; });
  return entry;
}
async function request(url:string,init:RequestInit={}) {
  const entry = driveToken();
  try {
    const token = await entry.promise;
    const headers = new Headers(init.headers);
    headers.set('authorization',`Bearer ${token}`);
    const response = await fetch(url,{...init,headers,cache:'no-store',redirect:'error'});
    if (response.status === 401 && tokenCache === entry) tokenCache = null;
    if (response.status === 412) throw new Error('El álbum ha cambiado. Recarga antes de guardar.');
    if (!response.ok) fail();
    return response;
  } catch(error) {
    if(error instanceof Error && error.message==='El álbum ha cambiado. Recarga antes de guardar.') throw error;
    fail();
  }
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
  const response=await request(`${api}/${pointer}?alt=media&supportsAllDrives=true`);
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
export async function saveClassAlbum(input:{classId:string;caption:string;photoIds:string[];intent:'draft'|'publish'|'withdraw';revision:string}):Promise<void> {
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
    update=input.intent==='publish'?{description,appProperties:{skbcPublishedAlbum:await createPublication(album,draft)}}:{description};
  }
  const headers:Record<string,string>={'content-type':'application/json'};if(!album.revision.startsWith('version:')) headers['if-match']=album.revision;
  await request(`${api}/${album.folderId}?supportsAllDrives=true`,{method:'PATCH',headers,body:JSON.stringify(update)});
}
export async function fetchClassPhoto(album:AlbumRecord,fileId:string):Promise<Response> {
  await currentAlbum(album);const {file}=await readFile(fileId);if(!validPhoto(file,album.folderId)) fail();return request(`${api}/${fileId}?alt=media&supportsAllDrives=true`);
}


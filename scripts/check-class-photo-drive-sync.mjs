import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {AsyncLocalStorage} from 'node:async_hooks';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync('src/lib/class-photo-drive.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const root='15Fl2RjeqV0ui-xCt8f6esGh6hzCTT5eS',classId='11111111-1111-4111-8111-111111111111',folderMime='application/vnd.google-apps.folder';
let files=[],counter=0,blocked=new Set(),downloads=[],mutations=[];
let holdSyncPatch=false,releaseSyncPatch,notifySyncPatch;
const folder={id:'legacy',name:'2026-11-10 Clase',mimeType:folderMime,parents:[root],appProperties:{skbcClassAlbum:'1',skbcClassId:classId},description:JSON.stringify({version:1,classId,caption:'saved draft',photoIds:['draft'],state:'draft'}),version:'1'};
const photo=id=>({id,name:id+'.jpg',mimeType:'image/jpeg',size:'12',parents:['legacy']});
files=[folder,photo('draft'),photo('old-duplicate')];
const fetch=async(url,init={})=>{
  const u=new URL(url),id=u.pathname.split('/').at(-1);
  assert.equal(init.headers.get('authorization'),u.searchParams.get('alt')==='media'?'Bearer media-token':'Bearer token','private metadata stays with the original app; bytes use the read-only media app');
  if(init.method==='POST'&&u.pathname.includes('/upload/')){
    const content=String(init.body).split('Content-Type: application/json; charset=UTF-8\r\n\r\n').at(-1).split('\r\n--')[0];
    const metadata=JSON.parse(String(init.body).split('Content-Type: application/json; charset=UTF-8\r\n\r\n')[1].split('\r\n--')[0]);
    const file={...metadata,id:'manifest'+(++counter),createdTime:new Date(1800000000000+counter).toISOString(),size:String(Buffer.byteLength(content)),content};files.push(file);return Response.json({id:file.id});
  }
  if(init.method==='POST'){const file={...JSON.parse(init.body),id:'folder'+(++counter),version:'1'};files.push(file);mutations.push(file);return Response.json(file);}
  if(init.method==='PATCH'){
    const file=files.find(f=>f.id===id),patch=JSON.parse(init.body);
    if(holdSyncPatch&&patch.appProperties?.skbcPhotoLastSync){holdSyncPatch=false;notifySyncPatch();await new Promise(resolve=>{releaseSyncPatch=resolve;});}
    mutations.push(patch);
    if(u.searchParams.has('addParents'))file.parents=[u.searchParams.get('addParents')];
    if(patch.description)file.description=patch.description;if(patch.appProperties)Object.assign(file.appProperties,patch.appProperties);
    file.version=String(Number(file.version||0)+1);return Response.json(file);
  }
  if(id==='files'){
    const q=u.searchParams.get('q');let found=files.filter(f=>!f.trashed);
    const parent=q.match(/'([^']+)' in parents/);if(parent)found=found.filter(f=>f.parents?.includes(parent[1]));
    if(q.includes('mimeType ='))found=found.filter(f=>f.mimeType===folderMime);
    for(const m of q.matchAll(/key='([^']+)' and value='([^']+)'/g))found=found.filter(f=>f.appProperties?.[m[1]]===m[2]);
    return Response.json({files:found});
  }
  const file=files.find(f=>f.id===id);if(!file)return new Response('',{status:404});
  if(u.searchParams.get('alt')==='media'){downloads.push(id);if(blocked.has(id))return Response.json({error:{status:'PERMISSION_DENIED'}},{status:403});return new Response(file.content||'image',{headers:{'content-type':file.responseMime||file.mimeType}});}
  return Response.json(file);
};
const exports={};vm.runInNewContext(source,{exports,require:id=>id.includes('class-photo-limits')?{CLASS_PHOTO_ALBUM_LIMIT:200,CLASS_PHOTO_MANIFEST_MAX_BYTES:65536}:id==='node:async_hooks'?{AsyncLocalStorage}:{getClassPhotoDriveAccessToken:async()=> 'token',getClassPhotoMediaAccessToken:async()=> 'media-token'},process:{env:{}},fetch,Response,Headers,URL,URLSearchParams,TextEncoder,AbortSignal,AbortController,setTimeout,clearTimeout});
let result=await exports.syncClassAlbumPhotos(classId);
assert.equal(result.baseline,true);assert.equal(result.added,0);assert.equal(downloads.length,0,'legacy baseline never republishes old originals');
files.push(photo('new'),photo('blocked'));blocked.add('blocked');
result=await exports.syncClassAlbumPhotos(classId);assert.equal(result.added,1);assert.equal(result.blocked,1);assert.deepEqual(Array.from(result.album.published.photoIds),['new']);assert.equal(result.album.published.caption,'','sync never publishes a private draft caption');
assert.equal(JSON.parse(folder.description).caption,'saved draft');assert.deepEqual(JSON.parse(folder.description).photoIds,['draft']);assert.ok(result.album.lastSyncedAt);
result=await exports.syncClassAlbumPhotos(classId);assert.equal(result.added,0,'repeated sync deduplicates');
blocked.clear();result=await exports.syncClassAlbumPhotos(classId);assert.equal(result.added,1,'inaccessible new originals can recover');
const html={...photo('html'),responseMime:'text/html'};files.push(html);
result=await exports.syncClassAlbumPhotos(classId);assert.equal(result.added,0);assert.equal(result.blocked,1,'a metadata image returning HTML must never publish');
html.responseMime='image/jpeg';result=await exports.syncClassAlbumPhotos(classId);assert.equal(result.added,1,'corrected media can recover');
let album=await exports.getClassAlbum(classId);await exports.saveClassAlbum({classId,caption:'ignored',photoIds:[],intent:'withdraw',revision:album.revision});
result=await exports.syncClassAlbumPhotos(classId);assert.equal(result.added,0);assert.equal(result.album.published,null,'withdrawn IDs stay excluded');
files.push(photo('direct-before-device'),photo('device'));
album=await exports.getClassAlbum(classId);await exports.saveClassAlbum({classId,caption:'device caption',photoIds:['device'],intent:'publish',revision:album.revision,preserveDraft:true});
result=await exports.syncClassAlbumPhotos(classId);assert.equal(result.added,1);assert.deepEqual(Array.from(result.album.published.photoIds),['device','direct-before-device'],'device auto publication must not swallow an external arrival');
assert.equal(JSON.parse(folder.description).caption,'saved draft');
album=await exports.ensureClassAlbum({classId,title:folder.name,date:'2026-11-10'});
const month=files.find(f=>f.id===folder.parents[0]),year=files.find(f=>f.id===month.parents[0]);
assert.equal(month.appProperties.skbcClassPhotoMonth,'2026-11');assert.equal(year.appProperties.skbcClassPhotoYear,'2026');assert.deepEqual(year.parents,[root]);
assert.equal(album.folderId,'legacy','migration preserves the existing album and originals');
year.parents=['unrelated'];assert.equal(await exports.getClassAlbum(classId),null);await assert.rejects(()=>exports.fetchClassPhoto(album,'new'));
year.parents=[root];month.appProperties.skbcClassPhotoMonth='2026-12';assert.equal(await exports.getClassAlbum(classId),null);month.appProperties.skbcClassPhotoMonth='2026-11';
await assert.rejects(()=>exports.ensureClassAlbum({classId,title:'2026-02-30 Invalid'}),/Fecha/);
const otherId='22222222-2222-4222-8222-222222222222';
const created=await exports.ensureClassAlbum({classId:otherId,title:'2026-11-11 Nueva'});const createdFolder=files.find(f=>f.id===created.folderId);assert.deepEqual(JSON.parse(createdFolder.description).syncSeenPhotoIds,[]);
assert.equal(files.filter(f=>f.appProperties?.skbcClassPhotoYear).length,1);assert.equal(files.filter(f=>f.appProperties?.skbcClassPhotoMonth).length,1,'date folders are reused');
assert.equal(month.name,'11 · Noviembre');
// Date corrections relocate only the exact owned class, and leave its photo IDs unchanged.
await exports.ensureClassAlbum({classId,title:folder.name,date:'2026-12-10'});
const december=files.find(f=>f.id===folder.parents[0]);assert.equal(december.appProperties.skbcClassPhotoMonth,'2026-12');assert.equal((await exports.getClassAlbum(classId)).folderId,'legacy');
await exports.ensureClassAlbum({classId,title:folder.name,date:'2026-11-10'});
// Duplicate buckets from concurrent list/create races converge without deleting either bucket.
const duplicateYear={...year,id:'aaa-year',appProperties:{...year.appProperties}};
const duplicateMonth={...month,id:'aaa-month',parents:['aaa-year'],appProperties:{...month.appProperties}};files.push(duplicateYear,duplicateMonth);
await exports.ensureClassAlbum({classId,title:folder.name,date:'2026-11-10'});assert.deepEqual(folder.parents,['aaa-month']);
assert.ok(files.includes(year));assert.ok(files.includes(month));
const concurrent=await Promise.all(['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'].map(id=>exports.ensureClassAlbum({classId:id,title:'2027-01-02 Concurrente'})));
const concurrentParents=concurrent.map(item=>files.find(f=>f.id===item.folderId).parents[0]);assert.equal(concurrentParents[0],concurrentParents[1],'concurrent date bucket creation converges after readback');
// Exact race: automatic publication has read metadata and created its manifest, but its
// PATCH arrives after a manual withdrawal. No ETag exists in this mock, as on Drive GET.
files.push(photo('late-before-withdraw'));
holdSyncPatch=true;let reached=new Promise(resolve=>{notifySyncPatch=resolve;});let pending=exports.syncClassAlbumPhotos(classId);await reached;
album=await exports.getClassAlbum(classId);await exports.saveClassAlbum({classId,caption:'ignored',photoIds:[],intent:'withdraw',revision:album.revision});
releaseSyncPatch();await pending;
album=await exports.getClassAlbum(classId);assert.equal(album.published,null,'late sync pointer cannot undo withdrawal');
result=await exports.syncClassAlbumPhotos(classId);assert.equal(result.added,0,'immutable withdrawal seen IDs survive stale description overwrite');
// A second late automatic PATCH cannot undo a manual exclusion or replace its caption.
files.push(photo('late-before-manual-selection'));
holdSyncPatch=true;reached=new Promise(resolve=>{notifySyncPatch=resolve;});pending=exports.syncClassAlbumPhotos(classId);await reached;
album=await exports.getClassAlbum(classId);await exports.saveClassAlbum({classId,caption:'manual caption',photoIds:['device'],intent:'publish',revision:album.revision});
releaseSyncPatch();await pending;
album=await exports.getClassAlbum(classId);assert.equal(album.published.caption,'manual caption');assert.deepEqual(Array.from(album.published.photoIds),['device']);
const policies=files.filter(file=>file.appProperties?.skbcClassPhotoPolicy==='1'&&file.parents?.includes('legacy'));
const newestPolicy=policies.sort((a,b)=>a.createdTime>b.createdTime?-1:1)[0];
const correctClass=newestPolicy.appProperties.skbcClassId;newestPolicy.appProperties.skbcClassId=otherId;
await assert.rejects(()=>exports.getClassAlbum(classId),'a guard from another class must fail closed');newestPolicy.appProperties.skbcClassId=correctClass;
const savedTime=newestPolicy.createdTime;delete newestPolicy.createdTime;
await assert.rejects(()=>exports.getClassAlbum(classId),'guard ordering must use Drive server timestamps');newestPolicy.createdTime=savedTime;
result=await exports.syncClassAlbumPhotos(classId);assert.equal(result.added,0,'manual exclusions cannot return through stale sync state');
// An automatic device save that started from old UI selections must respect newer policy.
album=await exports.getClassAlbum(classId);await exports.saveClassAlbum({classId,caption:'stale caption',photoIds:['device','late-before-manual-selection'],intent:'publish',revision:album.revision,preserveDraft:true});
album=await exports.getClassAlbum(classId);assert.equal(album.published.caption,'manual caption');assert.deepEqual(Array.from(album.published.photoIds),['device']);
// Publish more than the former limit, then incrementally discover a complete album.
const ids=Array.from({length:200},(_,i)=>'capacity_'+String(i).padStart(24,'0'));files.push(...ids.slice(0,25).map(photo));
album=await exports.getClassAlbum(classId);await exports.saveClassAlbum({classId,caption:'full',photoIds:ids.slice(0,25),intent:'publish',revision:album.revision});
assert.equal((await exports.getClassAlbum(classId)).published.photoIds.length,25);
files.push(...ids.slice(25).map(photo));
const unavailable=Array.from({length:5},(_,i)=>'unavailable'+i);files.splice(files.indexOf(folder)+1,0,...unavailable.map(photo));for(const id of unavailable)blocked.add(id);
let passes=0,totalAdded=0;do {result=await exports.syncClassAlbumPhotos(classId);passes++;totalAdded+=result.added;assert.ok(result.added+result.blocked<=3,'each pass bounds media probes');assert.equal(result.album.syncPending,result.pending);assert.ok(passes<70,'blocked files do not starve later candidates');}while(result.pending);
assert.equal(totalAdded,175);assert.equal(result.album.published.photoIds.length,200);assert.ok(passes>1);
assert.equal(result.album.published.caption,'full');assert.equal(JSON.parse(folder.description).caption,'full');
assert.ok(!result.album.published.photoIds.includes('late-before-manual-selection'),'exclusions survive all continuation passes');
album=await exports.getClassAlbum(classId);
await exports.saveClassAlbum({classId,caption:'manual 200',photoIds:ids,intent:'publish',revision:album.revision});
assert.equal((await exports.getClassAlbum(classId)).published.photoIds.length,200,'manual publication supports 200');
album=await exports.getClassAlbum(classId);
await assert.rejects(()=>exports.saveClassAlbum({classId,caption:'overflow',photoIds:[...ids,'overflow'],intent:'publish',revision:album.revision}),/selección/);
files.push(photo('overflow'));result=await exports.syncClassAlbumPhotos(classId);assert.equal(result.limitReached,true);assert.equal(result.added,0);assert.equal(result.pending,false);assert.equal(result.album.published.photoIds.length,200);
console.log('Drive sync: 200-photo manual and incremental publication, bounded media probes, exclusions, blocked recovery, overflow and races passed.');

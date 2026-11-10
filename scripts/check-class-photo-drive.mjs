import { AsyncLocalStorage } from 'node:async_hooks';
import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const js=ts.transpileModule(fs.readFileSync('src/lib/class-photo-drive.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const root='15Fl2RjeqV0ui-xCt8f6esGh6hzCTT5eS',classId='11111111-1111-4111-8111-111111111111';
const folder={id:'folder1',name:'Class',mimeType:'application/vnd.google-apps.folder',parents:[root],appProperties:{skbcClassId:classId,skbcClassAlbum:'1'},description:JSON.stringify({version:1,classId,caption:'draft',photoIds:['photo1'],state:'published',published:{caption:'legacy ignored',photoIds:['photo1']}}),version:'1'};
const photo={id:'photo1',name:'a.jpg',mimeType:'image/jpeg',size:'20',parents:['folder1']};
let files=[folder,photo],calls=[],manifestContent='',manifestCount=0,policyCount=0;
const mockFetch=async(url,init={})=>{calls.push([String(url),init]);const u=new URL(url);
if(u.hostname==='www.googleapis.com'&&u.pathname.includes('/upload/')){const body=String(init.body);manifestContent=body.split('Content-Type: application/json; charset=UTF-8\r\n\r\n').at(-1).split('\r\n--')[0];const metadata=JSON.parse(body.split('Content-Type: application/json; charset=UTF-8\r\n\r\n')[1].split('\r\n--')[0]);const id=metadata.appProperties.skbcClassPhotoPolicy?'policy'+(++policyCount):'manifest'+(++manifestCount);files.push({...metadata,id,createdTime:new Date(1800000000000+policyCount).toISOString(),size:String(new TextEncoder().encode(manifestContent).length),content:manifestContent});return Response.json({id});}
const id=u.pathname.split('/').at(-1);if(init.method==='PATCH'){const patch=JSON.parse(init.body);if(patch.description)folder.description=patch.description;if(patch.appProperties)Object.assign(folder.appProperties,patch.appProperties);return Response.json(folder);}
if(id==='files'){const q=u.searchParams.get('q');let result=files;const parent=q.match(/'([^']+)' in parents/);if(parent)result=result.filter(f=>f.parents?.includes(parent[1]));for(const m of q.matchAll(/key='([^']+)' and value='([^']+)'/g))result=result.filter(f=>f.appProperties?.[m[1]]===m[2]);return Response.json({files:result});}
const found=files.find(f=>f.id===id);if(!found)return new Response('',{status:404});if(u.searchParams.get('alt')==='media')return new Response(found.content||'image');return Response.json(found);};
const exports={};vm.runInNewContext(js,{exports,require:id=>id==='node:async_hooks'?{AsyncLocalStorage}:({getClassPhotoDriveAccessToken:async()=> 'secret',getClassPhotoMediaAccessToken:async()=> 'media-secret'}),process:{env:{}},fetch:mockFetch,Response,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,Headers,TextEncoder,console});
let album=await exports.getClassAlbum(classId);assert.equal(album.published,null,'legacy description cannot publish');
await exports.saveClassAlbum({classId,caption:'Public',photoIds:['photo1'],intent:'publish',revision:album.revision});
album=await exports.getClassAlbum(classId);assert.equal(album.published.caption,'Public');assert.equal(manifestCount,1);
await exports.saveClassAlbum({classId,caption:'Edited draft',photoIds:['photo1'],intent:'draft',revision:album.revision});assert.equal((await exports.getClassAlbum(classId)).published.caption,'Public');
// A deleted selected original cannot block withdrawal. No selected file or manifest reads.
files=files.filter(f=>f.id!=='photo1');const before=calls.length;
await exports.saveClassAlbum({classId,caption:'ignored',photoIds:['invalid/url'],intent:'withdraw',revision:album.revision});
assert.equal(calls.slice(before).some(([url])=>url.includes('/photo1')||url.includes('/manifest')),false);
assert.equal(JSON.parse(folder.description).caption,'Edited draft');assert.equal((await exports.getClassAlbum(classId)).published,null);
// No ETag and an old revision: saving a stale draft cannot restore a withdrawn publication.
files.push(photo);await exports.saveClassAlbum({classId,caption:'Stale draft',photoIds:['photo1'],intent:'draft',revision:album.revision});
assert.equal((await exports.getClassAlbum(classId)).published,null);assert.equal(folder.appProperties.skbcPublishedAlbum,null);
const lastPatch=JSON.parse(calls.filter(c=>c[1].method==='PATCH').at(-1)[1].body);assert.equal('appProperties' in lastPatch,false);
photo.parents=['other'];await assert.rejects(()=>exports.fetchClassPhoto(album,'photo1'));photo.parents=['folder1'];
await assert.rejects(()=>exports.saveClassAlbum({classId,caption:'bad',photoIds:['https://evil'],intent:'publish',revision:album.revision}));
await assert.rejects(()=>exports.saveClassAlbum({classId,caption:'bad',photoIds:[],intent:'draft',revision:'old'}));
// A stale pointer cannot override the latest immutable withdrawal decision.
folder.appProperties.skbcPublishedAlbum='manifest1';assert.equal((await exports.getClassAlbum(classId)).published,null);
// Manifest ownership is still enforced for the currently active policy.
album=await exports.getClassAlbum(classId);await exports.saveClassAlbum({classId,caption:'Public',photoIds:['photo1'],intent:'publish',revision:album.revision});
const manifest=files.find(f=>f.id===folder.appProperties.skbcPublishedAlbum);manifest.parents=['other'];await assert.rejects(()=>exports.getClassAlbum(classId));manifest.parents=['folder1'];
assert.equal((await exports.getClassAlbum(classId)).published.caption,'Public');
folder.appProperties.skbcPublishedAlbum=null;
console.log('class photo publication-pointer tests passed');
// Token refresh is deduplicated; album metadata and originals are never cached.
let authCalls=0, authFailure=false, unauthorized=false, clock=0;
const cachedExports={};
vm.runInNewContext(js,{exports:cachedExports,require:id=>id==='node:async_hooks'?{AsyncLocalStorage}:({getClassPhotoMediaAccessToken:async()=> "media-secret",getClassPhotoDriveAccessToken:async()=>{authCalls++;await Promise.resolve();if(authFailure)throw Error('private auth details');return `token-${authCalls}`;}}),process:{env:{}},Date:{now:()=>clock},fetch:async(...args)=>unauthorized?new Response('',{status:401}):mockFetch(...args),Response,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,Headers,TextEncoder,console});
await Promise.all(Array.from({length:24},()=>cachedExports.listClassAlbums()));assert.equal(authCalls,1,'concurrent requests share token refresh');
clock=59*1000;await cachedExports.listClassAlbums();assert.equal(authCalls,1);
clock=61*1000;await cachedExports.listClassAlbums();assert.equal(authCalls,2,'token expires after one minute');
unauthorized=true;await assert.rejects(()=>cachedExports.listClassAlbums());unauthorized=false;
await cachedExports.listClassAlbums();assert.equal(authCalls,3,'401 clears cached token');
clock+=61*1000;authFailure=true;await assert.rejects(()=>cachedExports.listClassAlbums(),/No se pudo/);authFailure=false;
await cachedExports.listClassAlbums();assert.equal(authCalls,5,'failed refresh is not cached');
console.log('class photo OAuth cache tests passed');

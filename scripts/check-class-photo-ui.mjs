import assert from 'node:assert/strict';
import * as limits from '../src/lib/class-photo-limits.ts';
import * as photoGroups from '../src/lib/class-photo-groups.ts';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
let allowed=true,reads=0,writes=0,fail=false,lookupFail=false,received;
let album=null,photos=[],history=[];
const service={getClassPhotoAdmin:async()=>{reads++;if(fail)throw Error('OAuth private-token');return {album,photos};},getMemberClassPhotoHistory:async(token)=>{reads++;assert.equal(token,'own-token');if(fail)throw Error('OAuth private-token');return history;},createClassPhotoAlbum:async(id)=>{writes++;if(fail)throw Error('OAuth secret');return {legacyId:'trusted legacy'};},saveClassPhotos:async(input)=>{writes++;received=input;if(fail)throw Error('OAuth secret');return {legacyId:'trusted legacy'};},syncClassPhotosForAdmin:async()=>({legacyId:'trusted legacy',added:1,blocked:0,limitReached:false}),resolveClassPhotoReturn:async()=>{if(lookupFail)throw Error('secret');return {legacyId:'trusted legacy'};}};
const mocks={'@/lib/class-photo-groups':photoGroups,'@/lib/class-photo-limits':limits,'@/components/class-photo-auto-sync':{ClassPhotoAutoSync:()=>null},'@/components/class-photo-google-connection':{ClassPhotoGoogleConnection:()=>null},'@/components/class-photo-uploader':{ClassPhotoUploader:()=>React.createElement('div',{'data-uploader':'present'},'Subida directa privada')},'@/lib/class-photos':service,'@/lib/class-photo-drive':{CLASS_PHOTO_ROOT_FOLDER_ID:'private-root'},'@/app/clases/photo-actions':{createClassPhotoAlbumAction:()=>writes++,saveClassPhotosAction:()=>writes++},'@/lib/auth':{hasInternalAccess:async()=>allowed},'next/navigation':{redirect:(path)=>{throw Error('REDIRECT:'+path);}},'next/cache':{revalidatePath:()=>{}}};
function load(file){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports:module.exports,module,require:(name)=>name.endsWith('.css')?{}:name in mocks?mocks[name]:require(name)});return module.exports;}
const {ClassPhotoAdmin}=load('src/components/class-photo-admin.tsx');
const gallery=load('src/components/class-photo-gallery.tsx');
mocks['@/components/class-photo-gallery']=gallery;
const {ClassPhotoHistory}=load('src/components/class-photo-history.tsx');
const admin=async()=>renderToStaticMarkup(await ClassPhotoAdmin({classId:'class-id',legacyId:'display-legacy'}));
const family=async()=>renderToStaticMarkup(await ClassPhotoHistory({fichaToken:'own-token'}));
let html=await admin();assert.match(html,/al subir la primera foto/);assert.match(html,/Preparar carpeta en Drive/);assert.match(html,/data-uploader="present"/);assert.doesNotMatch(html,/name="intent"/);assert.equal(writes,0,'GET cannot create a folder');
album={classId:'class-id',folderId:'private-folder',title:'Class',caption:'Private draft',photoIds:['photo-a'],published:null,revision:'version:123'};photos=[{id:'photo-a',name:'Admin-only filename.jpg',mimeType:'image/jpeg'}];
html=await admin();assert.match(html,/data-uploader="present"/);assert.match(html,/Borrador privado/);assert.match(html,/value="draft"/);assert.match(html,/value="publish"/);assert.match(html,/name="revision" value="version:123"/);assert.match(html,/maxLength="2000"/);assert.match(html,/\/api\/class-photos\/class-id\/photo-a/);assert.doesNotMatch(html,/[?]ficha=/);assert.doesNotMatch(html,/value="withdraw"/);
album.published={caption:'Published',photoIds:['photo-a']};album.photoIds=['photo-b'];photos.push({id:'photo-b',name:'Draft-only.jpg',mimeType:'image/jpeg'});html=await admin();assert.match(html,/<input[^>]*checked=""[^>]*value="photo-b"/);assert.doesNotMatch(html,/<input[^>]*checked=""[^>]*value="photo-a"/);assert.match(html,/Publicado en las fichas/);assert.match(html,/value="withdraw"/);
history=[{classId:'empty-prepared',date:'2026-11-10',className:'Training',caption:'',photoIds:[]}];assert.equal(await family(),'','Empty prepared albums must not display an empty gallery');
history=[];assert.equal(await family(),'');history=[{classId:'class-id',date:'2026-11-10',className:'Training',caption:'Family caption',photoIds:['photo-a']}];html=await family();assert.match(html,/Galería de entrenamientos/);assert.match(html,/1 clase con fotos/);assert.doesNotMatch(html,/Clase del 10/);assert.doesNotMatch(html,/<img| open=|Family caption|ficha=own-token/,'Closed capsules must mount no media or caption');assert.doesNotMatch(html,/drive.google|private-folder|filename|image\/jpeg/);
fail=true;html=await admin();assert.match(html,/No se pueden cargar/);assert.doesNotMatch(html,/OAuth|private-token/);html=await family();assert.match(html,/seguir consultando tu ficha/);assert.doesNotMatch(html,/OAuth|private-token/);fail=false;assert.equal(writes,0,'All SSR paths read-only');
const actions=load('src/app/clases/photo-actions.ts');const form=new FormData();form.set('classId','class-id');form.set('legacyId','attacker-url');form.set('revision','version:123');form.set('caption','Caption');form.append('photoIds','photo-a');
for(const intent of ['draft','publish','withdraw']){form.set('intent',intent);await assert.rejects(()=>actions.saveClassPhotosAction(form),new RegExp('REDIRECT:/clases/trusted%20legacy[?]photoSaved='+intent));assert.equal(received.intent,intent);assert.equal(received.revision,'version:123');}
form.set('revision','"opaque-drive-etag"');await assert.rejects(()=>actions.saveClassPhotosAction(form),/photoSaved=withdraw/);assert.equal(received.revision,'"opaque-drive-etag"');form.set('revision','version:123');
await assert.rejects(()=>actions.createClassPhotoAlbumAction(form),/trusted%20legacy[?]photoSaved=folder/);
let before=writes;form.set('caption','x'.repeat(2001));await assert.rejects(()=>actions.saveClassPhotosAction(form),/trusted%20legacy[?]photoError=1/);assert.equal(writes,before);form.set('caption','Caption');form.set('revision','bad\r\nETag');await assert.rejects(()=>actions.saveClassPhotosAction(form),/photoError=1/);assert.equal(writes,before);form.set('revision','3');form.delete('photoIds');for(let i=0;i<201;i++)form.append('photoIds','photo-'+i);await assert.rejects(()=>actions.saveClassPhotosAction(form),/photoError=1/);assert.equal(writes,before);
fail=true;lookupFail=true;await assert.rejects(()=>actions.createClassPhotoAlbumAction(form),/REDIRECT:\/clases[?]photoError=1$/);fail=false;lookupFail=false;
allowed=false;before=writes;await assert.rejects(()=>actions.createClassPhotoAlbumAction(form),/skbc-interno/);await assert.rejects(()=>actions.saveClassPhotosAction(form),/skbc-interno/);assert.equal(writes,before);
console.log('Class photo SSR/actions passed: read-only GET, private draft/publish/withdraw, trusted redirects, validation, auth and family privacy.');

let galleryState=[],galleryCursor=0;
mocks.react={...React,useState(initial){const i=galleryCursor++;if(!(i in galleryState))galleryState[i]=initial;return [galleryState[i],value=>{galleryState[i]=typeof value==='function'?value(galleryState[i]):value;}];}};
const interactive=load('src/components/class-photo-gallery.tsx');delete mocks.react;
const galleryProps={classId:'class-id',date:'2026-11-10',caption:'Only published caption',photoIds:['photo-a','photo-b'],fichaToken:'own-token'};
const renderGallery=()=>{galleryCursor=0;return interactive.ClassPhotoGallery(galleryProps);};
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}return null;}
let tree=renderGallery();assert.equal(find(tree,node=>node.type===interactive.ClassPhotoImage),null);
tree.props.onToggle({currentTarget:{open:true}});tree=renderGallery();
const child=find(tree,node=>node.type===interactive.ClassPhotoImage);assert.ok(child);assert.equal(child.props.src,'/api/class-photos/class-id/photo-a?ficha=own-token');
const imageMarkup=renderToStaticMarkup(React.createElement(gallery.ClassPhotoImage,child.props));assert.match(imageMarkup,/download=1/);assert.match(imageMarkup,/Descargar foto 1/);assert.match(imageMarkup,/loading="lazy"/);assert.match(imageMarkup,/referrerPolicy="no-referrer"/);assert.doesNotMatch(imageMarkup,/drive.google|private-folder/);
assert.ok(find(tree,node=>node.type==='p'&&node.props.children==='Only published caption'));
tree.props.onToggle({currentTarget:{open:false}});assert.equal(find(renderGallery(),node=>node.type===interactive.ClassPhotoImage),null,'Closing unmounts the gallery');
galleryState=[];const renderImage=()=>{galleryCursor=0;return interactive.ClassPhotoImage({src:child.props.src,index:0});};
let image=renderImage();assert.equal(image.type,'figure');find(image,node=>node.type==='img').props.onError();image=renderImage();assert.equal(find(image,node=>node.type==='img'),null,'Failed photo hides raw broken image');let retry=find(image,node=>node.type==='button');assert.ok(retry);assert.equal(galleryState[1],0,'No automatic retry');retry.props.onClick();image=renderImage();assert.equal(image.type,'figure');assert.match(find(image,node=>node.type==='img').props.src,/ficha=own-token&retry=1/);find(image,node=>node.type==='img').props.onError();assert.equal(find(renderImage(),node=>node.type==='img'),null);assert.equal(galleryState[1],1,'Failure cannot cause an automatic retry loop');
console.log('Closed class capsules and explicit gallery/image retry interactions passed without initial image requests.');

galleryState=[];
const renderCollection=()=>{galleryCursor=0;return interactive.ClassPhotoCollection({albums:[galleryProps],fichaToken:'own-token'});};
let collection=renderCollection();assert.equal(find(collection,node=>node.type===interactive.ClassPhotoGallery),null);
collection.props.onToggle({currentTarget:{open:true}});collection=renderCollection();
assert.ok(find(collection,node=>node.type===interactive.ClassPhotoYear));
assert.equal(find(collection,node=>node.type===interactive.ClassPhotoGallery),null);
find(collection,node=>node.type==='button'&&node.props.children==='Ver todas las fotos').props.onClick();collection=renderCollection();assert.ok(find(collection,node=>node.type===interactive.ClassPhotoAll));assert.equal(find(collection,node=>node.type===interactive.ClassPhotoYear),null);
collection.props.onToggle({currentTarget:{open:false}});
assert.equal(find(renderCollection(),node=>node.type===interactive.ClassPhotoGallery),null,'Closing the collection unmounts open class galleries');
console.log('Nested gallery starts closed, shows days on demand and unmounts photos when closed.');

galleryState=[];const smallIds=galleryProps.photoIds;galleryProps.photoIds=Array.from({length:200},(_,i)=>'photo-'+i);
function countImages(node){if(!node||typeof node!=='object')return 0;return (node.type===interactive.ClassPhotoImage?1:0)+[node.props?.children].flat(Infinity).reduce((n,child)=>n+countImages(child),0);}
tree=renderGallery();tree.props.onToggle({currentTarget:{open:true}});tree=renderGallery();assert.equal(countImages(tree),20);
find(tree,node=>node.type==='button'&&node.props.children==='Ver más fotos').props.onClick();tree=renderGallery();assert.equal(countImages(tree),40);
for(let page=0;page<8;page++){find(tree,node=>node.type==='button'&&node.props.children==='Ver más fotos').props.onClick();tree=renderGallery();}
assert.equal(countImages(tree),200);assert.equal(find(tree,node=>node.type==='button'&&node.props.children==='Ver más fotos'),null);
tree.props.onToggle({currentTarget:{open:false}});tree=renderGallery();tree.props.onToggle({currentTarget:{open:true}});assert.equal(countImages(renderGallery()),20,'Reopening resets to one page');
galleryProps.photoIds=smallIds;
console.log('Large gallery: 200 photos paginate by 20, preserve downloads and reset on close.');

galleryState=[];
const yearGroup=photoGroups.groupClassPhotoAlbums([galleryProps])[0];
const renderYear=()=>{galleryCursor=0;return interactive.ClassPhotoYear({group:yearGroup,fichaToken:'own-token'});};
let y=renderYear();assert.equal(find(y,node=>node.type===interactive.ClassPhotoMonthGroup),null);y.props.onToggle({currentTarget:{open:true}});assert.ok(find(renderYear(),node=>node.type===interactive.ClassPhotoMonthGroup));
galleryState=[];const renderMonth=()=>{galleryCursor=0;return interactive.ClassPhotoMonthGroup({group:yearGroup.months[0],fichaToken:'own-token'});};
let month=renderMonth();assert.equal(find(month,node=>node.type===interactive.ClassPhotoGallery),null);month.props.onToggle({currentTarget:{open:true}});assert.ok(find(renderMonth(),node=>node.type===interactive.ClassPhotoGallery));
galleryState=[];const allAlbums=[{...galleryProps,classId:'older',date:'2025-12-01',photoIds:Array.from({length:30},(_,i)=>'older-'+i)},{...galleryProps,classId:'newer',date:'2027-01-02',photoIds:Array.from({length:30},(_,i)=>'newer-'+i)}];
const renderAll=()=>{galleryCursor=0;return interactive.ClassPhotoAll({albums:allAlbums,fichaToken:'own-token'});};
let all=renderAll();assert.equal(countImages(all),20);assert.match(find(all,node=>node.type===interactive.ClassPhotoImage).props.src,/newer/);
find(all,node=>node.type==='button'&&node.props.children==='Ver más fotos').props.onClick();all=renderAll();assert.equal(countImages(all),40);
function images(node){if(!node||typeof node!=='object')return [];return [...(node.type===interactive.ClassPhotoImage?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(images)];}
assert.match(images(all)[30].props.src,/older/);assert.equal(images(all)[30].props.classDate,'01-12-2025');
console.log('Year/month/day disclosures and all-photo cross-class pagination remain scoped to supplied albums.');

import assert from 'node:assert/strict';
import * as limits from '../src/lib/class-photo-limits.ts';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
function load(file,mocks={},globals={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports:module.exports,module,File,Blob,FormData,URL,...globals,require:(name)=>name==='@/lib/class-photo-limits'?limits:name in mocks?mocks[name]:require(name)});return module.exports;}
let closed=0,qualities=[],calls=[],active=0,maxActive=0;
const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toBlob(callback,type,quality){qualities.push(quality);callback(new Blob([new Uint8Array(quality>.72?2700000:1000)],{type}));}};
const client=load('src/lib/class-photo-client.ts',{}, {createImageBitmap:async()=>({width:4000,height:2000,close(){closed++;}}),document:{createElement:()=>canvas},fetch:async(url,options)=>{active++;maxActive=Math.max(active,maxActive);calls.push({url,options});await Promise.resolve();active--;return {ok:true,json:async()=>({id:'uploaded',name:'ok.jpg'})};}});
assert.deepEqual({...client.fitPhotoDimensions(4000,2000)},{width:2048,height:1024});assert.deepEqual({...client.fitPhotoDimensions(100,50)},{width:100,height:50});assert.throws(()=>client.fitPhotoDimensions(0,5));
const photo=new File(['photo'],'camera.png',{type:'image/png'});
const optimized=await client.optimizeClassPhoto(photo);assert.equal(optimized.type,'image/jpeg');assert.equal(optimized.name,'camera.jpg');assert.ok(optimized.size<=client.CLASS_PHOTO_CLIENT_LIMIT);assert.equal(canvas.width,2048);assert.equal(canvas.height,1024);assert.deepEqual(qualities,[.85,.72]);assert.equal(closed,1);
const progress=[];const result=await client.uploadClassPhotoBatch([photo,new File(['x'],'second.jpg',{type:'image/jpeg'})],'class-id',(done,uploaded)=>progress.push([done,uploaded]));assert.equal(result.length,2);assert.ok(result.every(item=>item.ok));assert.equal(maxActive,1);assert.deepEqual(progress,[[1,1],[2,2]]);assert.equal(calls[0].url,'/api/class-photos/class-id/upload');assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[0].options.body.get('photo').type,'image/jpeg');await assert.rejects(()=>client.uploadClassPhotoBatch(Array(51).fill(photo),'class',()=>{}),/50/);
let decodeFetches=0;
const badDecode=load('src/lib/class-photo-client.ts',{}, {createImageBitmap:async()=>{throw Error('unsupported');},Image:class{async decode(){throw Error('unsupported');}},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},fetch:async()=>decodeFetches++});const failed=await badDecode.uploadClassPhotoBatch([new File(['heic'],'phone.heic',{type:'image/heic'})],'class',()=>{});assert.equal(failed[0].ok,false);assert.match(failed[0].error,/HEIC\/HEIF.*JPEG/);assert.equal(decodeFetches,0);
let attempts=0;const tooLarge=load('src/lib/class-photo-client.ts',{}, {createImageBitmap:async()=>({width:4000,height:2000,close(){}}),document:{createElement:()=>({...canvas,toBlob(callback){attempts++;callback(new Blob([new Uint8Array(2700000)],{type:'image/jpeg'}));}})}});await assert.rejects(()=>tooLarge.optimizeClassPhoto(photo),/demasiado grande/);assert.equal(attempts,20,'Compression loop bounded');
const jsx=require('react/jsx-runtime');const ui=load('src/components/class-photo-uploader.tsx',{'next/navigation':{useRouter:()=>({refresh(){}})},'@/lib/class-photo-client':client});const html=renderToStaticMarkup(React.createElement(ui.ClassPhotoUploader,{classId:'class-id'}));assert.match(html,/type="file"/);assert.match(html,/accept="image\/\*"/);assert.match(html,/multiple=""/);assert.match(html,/Se publican automáticamente/);assert.doesNotMatch(html,/<button[^>]*type="submit"/);
let state=[],refs=[],cursor=0,refCursor=0,refreshes=0,uploads=0,finish;
const hookReact={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},useRef(initial){const i=refCursor++;refs[i]??={current:initial};return refs[i];}};
const handlers=load('src/components/class-photo-uploader.tsx',{'react':hookReact,'next/navigation':{useRouter:()=>({refresh(){refreshes++;}})},'@/lib/class-photo-client':{uploadClassPhotoBatch:async()=>{uploads++;return await new Promise(resolve=>finish=resolve);}}});
const render=()=>{cursor=0;refCursor=0;return handlers.ClassPhotoUploader({classId:'class-id'});};
function find(node,type){if(!node||typeof node!=='object')return null;if(node.type===type)return node;for(const child of [node.props?.children].flat(Infinity)){const result=find(child,type);if(result)return result;}return null;}
let tree=render();find(tree,'input').props.onChange({target:{files:[photo,photo]}});tree=render();refs[0].current={value:'selected'};const first=find(tree,'button').props.onClick();await find(tree,'button').props.onClick();assert.equal(uploads,1,'Synchronous lock prevents double upload');finish([{file:photo,ok:true},{file:photo,ok:false,error:'Synthetic failure'}]);await first;assert.equal(refreshes,1);assert.equal(state[0].length,1,'Only failed files remain selected');assert.equal(refs[0].current.value,'selected','Partial failure does not clear input');assert.equal(uploads,1,'No automatic retry');
tree=render();const retry=find(tree,'button').props.onClick();finish([{file:photo,ok:true}]);await retry;assert.equal(refs[0].current.value,'');assert.equal(state[0].length,0);assert.equal(refreshes,2);
console.log('Class photo uploader passed: compression dimensions/size/limits, HEIC feedback, sequential authenticated uploads, SSR, busy lock, failure retention and refresh.');

assert.equal((await client.uploadClassPhotoBatch(Array(25).fill(photo),'class-id',()=>{})).length,25,'Uploads beyond the old limit must work');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
function load(path, dependencies, extras={}) {
  const mod={exports:{}};
  vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:mod.exports,Buffer,URL,URLSearchParams,AbortSignal,process,fetch:async()=>{throw Error('Unexpected network')},require:name=>{assert.ok(name in dependencies,name);return dependencies[name]},...extras});
  return mod.exports;
}
process.env.GOOGLE_OAUTH_CLIENT_SECRET='test-secret'; process.env.GOOGLE_OAUTH_CLIENT_ID='test-client';
let network=[]; let files=[]; let media='';
const auth=load('src/lib/class-photo-google-auth.ts',{'node:crypto':crypto,'./google-drive-api':{getGoogleDriveAccessToken:async()=> 'old-token'}},{fetch:async(url,options)=>{network.push([url,options]);if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'new-token'});if(url.includes('alt=media'))return new Response(media);return Response.json({files});}});
const encrypted=auth.encryptPhotoGoogleCredential('private-refresh');
assert.ok(!encrypted.includes('private-refresh'));
assert.equal(auth.decryptPhotoGoogleCredential(encrypted),'private-refresh');
const tampered=JSON.parse(encrypted);tampered.tag=Buffer.alloc(16).toString('base64');assert.throws(()=>auth.decryptPhotoGoogleCredential(JSON.stringify(tampered)),/No se pudo/);
process.env.GOOGLE_OAUTH_CLIENT_SECRET='wrong';assert.throws(()=>auth.decryptPhotoGoogleCredential(encrypted));process.env.GOOGLE_OAUTH_CLIENT_SECRET='test-secret';
assert.ok(auth.validPhotoGoogleState('a'.repeat(64),'a'.repeat(64)));
for(const value of [null,'a','b'.repeat(64),'a'.repeat(65)])assert.equal(auth.validPhotoGoogleState(value,'a'.repeat(64)),false);
assert.equal(await auth.getClassPhotoDriveAccessToken(),'old-token');
const record={id:'credential',mimeType:'application/json',parents:['15Fl2RjeqV0ui-xCt8f6esGh6hzCTT5eS'],size:String(encrypted.length),appProperties:{skbcClassPhotosOAuth:'1'}};
files=[record,record];await assert.rejects(auth.getClassPhotoDriveAccessToken());
files=[record];media=encrypted;assert.equal(await auth.getClassPhotoDriveAccessToken(),'new-token');
media='invalid';await assert.rejects(auth.getClassPhotoDriveAccessToken());
for (const rootResponse of [new Response('',{status:403}),Response.json({id:'other-root',mimeType:'application/vnd.google-apps.folder',trashed:false}),Response.json({id:record.parents[0],mimeType:'application/vnd.google-apps.folder',trashed:false,capabilities:{canAddChildren:false,canEdit:false}})]) {
  let writes=0;
  const wrongAccount=load('src/lib/class-photo-google-auth.ts',{'node:crypto':crypto,'./google-drive-api':{getGoogleDriveAccessToken:async()=> 'old-token'}},{fetch:async(url,options)=>{
    if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'wrong-account',refresh_token:'replacement',scope:auth.PHOTO_GOOGLE_SCOPES.join(' ')});
    if(options.method==='PATCH'||url.includes('/upload/'))writes++;
    return rootResponse;
  }});
  await assert.rejects(wrongAccount.saveClassPhotoGoogleCode('test'));assert.equal(writes,0,'wrong account must preserve existing credentials');
}
let internal=true,saved=0;
class Reply extends Response {cookies={set:(name,value,options)=>{this.cookie={name,value,options}}};static json(body,options){return new Reply(JSON.stringify(body),options)}static redirect(url,status){return new Reply(null,{status,headers:{location:String(url)}})}}
let reset=0,saveFails=true;
const dependencies={'node:crypto':crypto,'next/server':{NextResponse:Reply},'@/lib/auth':{hasInternalAccess:async()=>internal},'@/lib/class-photo-drive':{resetClassPhotoDriveToken:()=>reset++},'@/lib/class-photo-google-auth':{...auth,saveClassPhotoGoogleCode:async()=>{saved++;if(saveFails)throw Error('secret-token')}}};
const connect=load('src/app/api/admin/class-photos/google/connect/route.ts',dependencies);
let response=await connect.POST(new Request('https://skbc.vercel.app',{headers:{origin:'https://evil.example'}}));assert.equal(response.status,403);
internal=false;response=await connect.POST(new Request('https://skbc.vercel.app'));assert.equal(response.status,401);internal=true;
response=await connect.POST(new Request('https://skbc.vercel.app',{headers:{origin:'https://skbc.vercel.app'}}));assert.equal(response.status,303);assert.equal(response.cookie.options.httpOnly,true);assert.equal(response.cookie.options.secure,true);assert.equal(response.cookie.options.maxAge,600);
const callback=load('src/app/api/admin/class-photos/google/callback/route.ts',dependencies);
function callbackRequest(state){return {nextUrl:new URL(`https://skbc.vercel.app/callback?code=test&state=${state}`),cookies:{get:()=>({value:'a'.repeat(64)})}}}
response=await callback.GET(callbackRequest('wrong'));assert.equal(saved,0);assert.equal(response.cookie.options.maxAge,0);
response=await callback.GET(callbackRequest('a'.repeat(64)));assert.equal(saved,1);assert.equal(response.headers.get('location'),'https://skbc.vercel.app/clases?photoGoogle=error');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('cache-control'),'no-store');
assert.equal(reset,0);saveFails=false;response=await callback.GET(callbackRequest('a'.repeat(64)));assert.equal(reset,1);assert.equal(response.headers.get('location'),'https://skbc.vercel.app/clases?photoGoogle=connected');
console.log('Photo Google OAuth: encryption/tamper, fail-closed storage, fallback, auth, state, CSRF and sanitized callback passed.');

process.env.GOOGLE_OAUTH_CLIENT_ID="\uFEFFclient-id ";response=await connect.POST(new Request("https://skbc.vercel.app",{headers:{origin:"https://skbc.vercel.app"}}));assert.equal(new URL(response.headers.get("location")).searchParams.get("client_id"),"client-id");

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getGoogleDriveAccessToken } from "./google-drive-api";

export const PHOTO_GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];
export const PHOTO_GOOGLE_COOKIE = "skbc_photo_google_state";
export const PHOTO_GOOGLE_PATH = "/api/admin/class-photos/google";
const api = "https://www.googleapis.com/drive/v3/files";
const marker = { skbcClassPhotosOAuth: "1" };
const maxBytes = 16384;
function fail(): never { throw new Error("No se pudo conectar Google para las fotos."); }
function env(name: string) { const value = process.env[name]?.trim(); if (!value) fail(); return value; }
function root() { const id = process.env.SKBC_CLASS_PHOTOS_FOLDER_ID || "15Fl2RjeqV0ui-xCt8f6esGh6hzCTT5eS"; if (!/^[\w-]{1,200}$/.test(id)) fail(); return id; }
export function photoGoogleOrigin() { const url = new URL(process.env.SKBC_PUBLIC_URL || "https://skbc.vercel.app"); if (url.protocol !== "https:" || url.username || url.password) fail(); return url.origin; }
export function photoGoogleRedirectUri() { return `${photoGoogleOrigin()}${PHOTO_GOOGLE_PATH}/callback`; }
export function validPhotoGoogleState(value: string | null, expected?: string) { return Boolean(value && expected && /^[a-f0-9]{64}$/.test(value) && /^[a-f0-9]{64}$/.test(expected) && timingSafeEqual(Buffer.from(value), Buffer.from(expected))); }
function key() { return createHash("sha256").update("skbc-class-photos-oauth-v1\0").update(env("SUPABASE_SERVICE_ROLE_KEY")).digest(); }
export function encryptPhotoGoogleCredential(refreshToken: string) {
  if (!refreshToken || Buffer.byteLength(refreshToken)>11264) fail();
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(root()));
  const ciphertext = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") });
}
export function decryptPhotoGoogleCredential(text: string) {
  try {
    if (Buffer.byteLength(text) > maxBytes) fail();
    const data = JSON.parse(text); if (data.v !== 1 || typeof data.iv !== "string" || typeof data.tag !== "string" || typeof data.ciphertext !== "string") fail();
    const iv = Buffer.from(data.iv, "base64"), tag = Buffer.from(data.tag, "base64"); if (iv.length !== 12 || tag.length !== 16) fail();
    const cipher = createDecipheriv("aes-256-gcm", key(), iv); cipher.setAAD(Buffer.from(root())); cipher.setAuthTag(tag);
    const token = Buffer.concat([cipher.update(Buffer.from(data.ciphertext, "base64")), cipher.final()]).toString("utf8");
    if (!token || token.length > 11000) fail(); return token;
  } catch { return fail(); }
}
async function request(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) fail(); return response;
}
type CredentialFile = { id: string; mimeType: string; parents: string[]; size: string; appProperties: Record<string, string>; trashed?: boolean };
async function credentialFile(token: string) {
  const query = `'${root()}' in parents and trashed = false and appProperties has { key='skbcClassPhotosOAuth' and value='1' }`;
  const response = await request(`${api}?q=${encodeURIComponent(query)}&pageSize=100&fields=nextPageToken,files(id,mimeType,parents,size,appProperties,trashed)&supportsAllDrives=true&includeItemsFromAllDrives=true`, token);
  const data = await response.json() as { files?: CredentialFile[]; nextPageToken?: string };
  if (!Array.isArray(data.files) || data.nextPageToken || data.files.length > 1) fail();
  const file = data.files[0];
  if (file && (!/^[\w-]{1,200}$/.test(file.id) || file.mimeType !== "application/json" || file.trashed || file.parents?.length !== 1 || file.parents[0] !== root() || file.appProperties?.skbcClassPhotosOAuth !== "1" || !/^\d+$/.test(file.size) || Number(file.size) > maxBytes)) fail();
  return file;
}
async function readCredential(token: string, id: string) {
  const response = await request(`${api}/${id}?alt=media&supportsAllDrives=true`, token);
  const reader = response.body?.getReader(); if (!reader) fail();
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > maxBytes) fail(); chunks.push(part.value); } } finally { await reader.cancel(); }
  return decryptPhotoGoogleCredential(Buffer.concat(chunks).toString("utf8"));
}
type PhotoGoogleClient = { clientId: string; clientSecret: string; refreshToken?: string };
function validateClient(value: unknown): PhotoGoogleClient {
  const data = value as Partial<PhotoGoogleClient>;
  if (!data || typeof data.clientId !== "string" || !/^[A-Za-z0-9_-]{10,200}\.apps\.googleusercontent\.com$/.test(data.clientId) || typeof data.clientSecret !== "string" || !data.clientSecret || data.clientSecret.length > 1000 || (data.refreshToken !== undefined && (typeof data.refreshToken !== "string" || !data.refreshToken || data.refreshToken.length > 8192))) fail();
  return { clientId: data.clientId, clientSecret: data.clientSecret, ...(data.refreshToken ? {refreshToken: data.refreshToken} : {}) };
}
async function storedClient(original: string) {
  const file = await credentialFile(original);
  if (!file) return { file, client: null };
  return { file, client: validateClient(JSON.parse(await readCredential(original, file.id))) };
}
function envClient(): PhotoGoogleClient | null {
  const custom = process.env.SKBC_CLASS_PHOTOS_GOOGLE_CLIENT_ID || process.env.SKBC_CLASS_PHOTOS_GOOGLE_CLIENT_SECRET;
  const clientId = (custom ? process.env.SKBC_CLASS_PHOTOS_GOOGLE_CLIENT_ID : process.env.YOUTUBE_OAUTH_CLIENT_ID)?.trim();
  const clientSecret = (custom ? process.env.SKBC_CLASS_PHOTOS_GOOGLE_CLIENT_SECRET : process.env.YOUTUBE_OAUTH_CLIENT_SECRET)?.trim();
  if (!clientId && !clientSecret) return null;
  return validateClient({clientId, clientSecret});
}
export async function getClassPhotoGoogleClientConfiguration(): Promise<PhotoGoogleClient> {
  env("SUPABASE_SERVICE_ROLE_KEY");
  const {client} = await storedClient(await getGoogleDriveAccessToken());
  return client || envClient() || fail();
}
export async function getClassPhotoGoogleStatus() {
  try {
    const {client} = await storedClient(await getGoogleDriveAccessToken());
    return { connected: Boolean(client?.refreshToken), configured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && (client || envClient())), error: false, redirectUri: photoGoogleRedirectUri() };
  } catch { return { connected: false, configured: false, error: true, redirectUri: photoGoogleRedirectUri() }; }
}
async function exchange(body: URLSearchParams) {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) fail(); return await response.json() as { access_token?: string; refresh_token?: string; scope?: string };
}
// Drive appProperties are private to the original OAuth application.
export async function getClassPhotoDriveAccessToken(): Promise<string> { return getGoogleDriveAccessToken(); }
let mediaCache: { token: string; expires: number } | null = null;
let mediaPending: Promise<string> | null = null;
let mediaGeneration = 0;
export function resetClassPhotoMediaAccessToken() { mediaCache = null; mediaPending = null; mediaGeneration++; }
export async function getClassPhotoMediaAccessToken(): Promise<string> {
  if (mediaCache && mediaCache.expires > Date.now()) return mediaCache.token;
  if (mediaPending) return mediaPending;
  const generation = mediaGeneration;
  const pending = (async () => {
    const original = await getGoogleDriveAccessToken();
    const {client} = await storedClient(original);
    if (!client?.refreshToken) {
      if (generation === mediaGeneration) mediaCache = { token: original, expires: Date.now() + 60000 };
      return original;
    }
    const data = await exchange(new URLSearchParams({client_id: client.clientId, client_secret: client.clientSecret, refresh_token: client.refreshToken, grant_type: "refresh_token"}));
    if (!data.access_token) fail();
    if (generation === mediaGeneration) mediaCache = { token: data.access_token, expires: Date.now() + 60000 };
    return data.access_token;
  })();
  mediaPending = pending;
  try { return await pending; } finally { if (mediaPending === pending) mediaPending = null; }
}
async function writeClient(client: PhotoGoogleClient, original: string, existing?: CredentialFile) {
  const encrypted = encryptPhotoGoogleCredential(JSON.stringify(validateClient(client)));
  if (existing) { await request(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media&supportsAllDrives=true`, original, { method: "PATCH", headers: { "content-type": "application/json" }, body: encrypted }); resetClassPhotoMediaAccessToken(); return; }
  const boundary = `skbc_${randomBytes(16).toString("hex")}`;
  const metadata = JSON.stringify({ name: ".skbc-class-photos-oauth.json", mimeType: "application/json", parents: [root()], appProperties: marker });
  await request("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", original, { method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body: `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${encrypted}\r\n--${boundary}--` });
  resetClassPhotoMediaAccessToken();
}
export async function saveClassPhotoGoogleClientConfiguration(clientId: string, clientSecret: string) {
  env("SUPABASE_SERVICE_ROLE_KEY");
  const next = validateClient({clientId: clientId.trim(), clientSecret: clientSecret.trim()});
  const original = await getGoogleDriveAccessToken(); const {file,client} = await storedClient(original);
  if (client?.clientId === next.clientId && client.clientSecret === next.clientSecret) next.refreshToken = client.refreshToken;
  await writeClient(next, original, file);
}
export async function saveClassPhotoGoogleCode(code: string) {
  const client = await getClassPhotoGoogleClientConfiguration();
  const data = await exchange(new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, code, grant_type: "authorization_code", redirect_uri: photoGoogleRedirectUri() }));
  const scopes = new Set(data.scope?.split(" ") || []);
  if (!data.access_token || !data.refresh_token || data.refresh_token.length > 8192 || !(scopes.has("https://www.googleapis.com/auth/drive") || scopes.has(PHOTO_GOOGLE_SCOPES[0]))) fail();
  const response = await request(`${api}/${root()}?fields=id,mimeType,trashed&supportsAllDrives=true`, data.access_token);
  const selected = await response.json() as {id?: string; mimeType?: string; trashed?: boolean};
  if (selected.id !== root() || selected.mimeType !== "application/vnd.google-apps.folder" || selected.trashed !== false) fail();
  const original = await getGoogleDriveAccessToken(); const existing = await credentialFile(original);
  await writeClient({...client, refreshToken: data.refresh_token}, original, existing);
}

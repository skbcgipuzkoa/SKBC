import { createSign } from "crypto";

const driveScope = "https://www.googleapis.com/auth/drive";

export async function getGoogleDriveAccessToken() {
  if (process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    return getGoogleOAuthAccessToken();
  }

  const clientEmail = requiredEnv("GOOGLE_CLIENT_EMAIL");
  const privateKey = requiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const jwtClaim = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: driveScope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }));
  const unsigned = `${jwtHeader}.${jwtClaim}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey);
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) throw new Error(`Google auth error ${response.status}: ${await response.text()}`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("Google no devolvio access_token.");
  return data.access_token;
}

export async function uploadJsonToDrive({
  accessToken,
  folderId,
  fileName,
  json
}: {
  accessToken: string;
  folderId: string;
  fileName: string;
  json: string;
}) {
  const boundary = `skbc_${Date.now()}`;
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId],
    mimeType: "application/json"
  });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(json, "utf8"),
    Buffer.from(`\r\n--${boundary}--`)
  ]);

  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": `multipart/related; boundary=${boundary}`
    },
    body
  });

  if (!response.ok) throw new Error(`Google upload error ${response.status}: ${await response.text()}`);
  return await response.json() as { id: string };
}

export async function uploadPdfToDrive({
  accessToken,
  folderId,
  fileName,
  pdf
}: {
  accessToken: string;
  folderId: string;
  fileName: string;
  pdf: Buffer;
}) {
  const boundary = `skbc_${Date.now()}`;
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId],
    mimeType: "application/pdf"
  });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\ncontent-type: application/pdf\r\n\r\n`),
    pdf,
    Buffer.from(`\r\n--${boundary}--`)
  ]);

  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": `multipart/related; boundary=${boundary}`
    },
    body
  });

  if (!response.ok) throw new Error(`Google upload error ${response.status}: ${await response.text()}`);
  return await response.json() as { id: string };
}

export async function makeDriveFilePublic(accessToken: string, fileId: string) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ role: "reader", type: "anyone" })
  });

  if (!response.ok) throw new Error(`Google permission error ${response.status}: ${await response.text()}`);
}

export async function ensureDriveFolder({
  accessToken,
  parentFolderId,
  name
}: {
  accessToken: string;
  parentFolderId: string;
  name: string;
}) {
  const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const query = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `'${parentFolderId}' in parents`,
    `name = '${escapedName}'`
  ].join(" and ");
  const listUrl = `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(query)}&fields=files(id,name)`;
  const listResponse = await fetch(listUrl, {
    headers: { authorization: `Bearer ${accessToken}` }
  });

  if (!listResponse.ok) throw new Error(`Google folder lookup error ${listResponse.status}: ${await listResponse.text()}`);
  const list = await listResponse.json() as { files?: Array<{ id: string; name: string }> };
  const existing = list.files?.[0];
  if (existing?.id) return existing.id;

  const createResponse = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      name,
      parents: [parentFolderId],
      mimeType: "application/vnd.google-apps.folder"
    })
  });

  if (!createResponse.ok) throw new Error(`Google folder create error ${createResponse.status}: ${await createResponse.text()}`);
  const created = await createResponse.json() as { id?: string };
  if (!created.id) throw new Error("Google no devolvio la carpeta creada.");
  return created.id;
}

export async function downloadDriveFile(accessToken: string, fileId: string) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`Google download error ${response.status}: ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function deleteDriveFiles(accessToken: string, fileIds: string[]) {
  for (const fileId of fileIds) {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Google delete error ${response.status}: ${await response.text()}`);
    }
  }
}

async function getGoogleOAuthAccessToken() {
  const body = new URLSearchParams({
    client_id: requiredEnv("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret: requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
    refresh_token: requiredEnv("GOOGLE_OAUTH_REFRESH_TOKEN"),
    grant_type: "refresh_token"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) throw new Error(`Google OAuth error ${response.status}: ${await response.text()}`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("Google OAuth no devolvio access_token.");
  return data.access_token;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name}.`);
  return value;
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

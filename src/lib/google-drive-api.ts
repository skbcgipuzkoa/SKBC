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

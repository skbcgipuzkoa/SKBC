import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const derive = promisify(scrypt);
const cookieName = "skbc_anandi_access";
const lifetime = 365 * 24 * 60 * 60;
const slug = "anandi";
const tokenPattern = /^[a-f0-9]{64}$/;

type Access = {
  token: string | null;
  revision: string;
  username: string | null;
  password_hash: string | null;
};

export async function readAnandiAccess() {
  const { data, error } = await createAdminClient().from("anandi_access")
    .select("token,revision,username,password_hash").eq("dojo_slug", slug).maybeSingle<Access>();
  if (error) throw error;
  return data;
}

export async function rotateAnandiLink(revoke: boolean) {
  const { error } = await createAdminClient().from("anandi_access").upsert({
    dojo_slug: slug, token: revoke ? null : randomBytes(32).toString("hex"),
    revision: randomUUID(), attempts: 0, window_started: new Date().toISOString()
  });
  if (error) throw error;
}

function equal(a: string, b: string) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function sign(token: string, revision: string, expires: string) {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(token + ":" + revision + ":" + expires).digest("hex");
}

async function session(access: Access) {
  const expires = String(Math.floor(Date.now() / 1000) + lifetime);
  (await cookies()).set(cookieName, expires + "." + sign(access.token!, access.revision, expires), {
    secure: process.env.NODE_ENV === "production", httpOnly: true, sameSite: "lax",
    path: "/portal", maxAge: lifetime
  });
}

export async function hasAnandiAccess() {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value || !/^\d{1,12}\.[a-f0-9]{64}$/.test(value)) return false;
  const [expires, mac] = value.split(".");
  if (Number(expires) <= Date.now() / 1000) return false;
  const access = await readAnandiAccess();
  return Boolean(access?.token && equal(mac, sign(access.token, access.revision, expires)));
}

export async function enterAnandi(token: string, username: string, password: string) {
  if (!tokenPattern.test(token) || password.length > 256) return "invalid";
  const access = await readAnandiAccess();
  if (!access?.token || !equal(token, access.token)) return "invalid";
  if (access.password_hash) {
    if (!username && !password) return "credentials";
    const { data, error } = await createAdminClient().rpc("reserve_anandi_attempt", {
      p_revision: access.revision
    });
    if (error) throw error;
    if (!data) return "limited";
    if (username !== access.username || !(await matches(password, access.password_hash))) return "credentials";
  }
  await session(access);
  return "ok";
}

async function matches(password: string, hash: string) {
  if (password.length > 256) return false;
  const [salt, digest] = hash.split(".");
  return equal((await derive(password, salt, 64) as Buffer).toString("hex"), digest);
}

export async function setAnandiCredentials(username: string, password: string, current: string, disable: boolean) {
  if (!(await hasAnandiAccess())) return false;
  const access = await readAnandiAccess();
  if (!access?.token || (access.password_hash && !(await matches(current, access.password_hash)))) return false;
  if (!disable && (!/^[\p{L}\p{N}_.-]{2,40}$/u.test(username) || password.length < 8 || password.length > 256)) return false;
  const salt = randomBytes(16).toString("hex");
  const next = {
    username: disable ? null : username,
    password_hash: disable ? null : salt + "." + (await derive(password, salt, 64) as Buffer).toString("hex"),
    revision: randomUUID()
  };
  const { data, error } = await createAdminClient().from("anandi_access").update({
    ...next, attempts: 0, window_started: new Date().toISOString()
  }).eq("dojo_slug", slug).eq("revision", access.revision).select("revision").maybeSingle();
  if (error || !data) return false;
  await session({ ...access, ...next });
  return true;
}

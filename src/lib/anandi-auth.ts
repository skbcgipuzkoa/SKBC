import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const cookieName = "skbc_anandi_access";
const lifetime = 8 * 60 * 60;

function secret() {
  const value = process.env.SKBC_ANANDI_ACCESS_CODE;
  return value && value.length >= 20 && value !== process.env.SKBC_INTERNAL_ACCESS_CODE ? value : null;
}

function signature(key: string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function grantAnandiAccess(password: string) {
  const key = secret();
  if (!key || password.length > 256 || !equal(signature(key, password), signature(key, key))) {
    return false;
  }

  const expires = String(Math.floor(Date.now() / 1000) + lifetime);
  (await cookies()).set(cookieName, expires + "." + signature(key, expires), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/portal",
    maxAge: lifetime
  });
  return true;
}

export async function hasAnandiAccess() {
  const key = secret();
  const token = (await cookies()).get(cookieName)?.value;
  if (!key || !token || !/^\d{1,12}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expires, mac] = token.split(".");
  return Number(expires) > Date.now() / 1000 && equal(signature(key, expires), mac);
}

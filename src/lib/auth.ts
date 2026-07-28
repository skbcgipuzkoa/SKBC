import { cookies } from "next/headers";

const cookieName = "skbc_internal_access";
const fallbackAccessCode = "SKBC2026";

export async function hasInternalAccess() {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(cookieName)?.value;
  return cookieValue === (process.env.SKBC_INTERNAL_ACCESS_CODE ?? fallbackAccessCode);
}

export async function grantInternalAccess() {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, process.env.SKBC_INTERNAL_ACCESS_CODE ?? fallbackAccessCode, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export async function revokeInternalAccess() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

import { cookies } from "next/headers";

const cookieName = "skbc_internal_access";

export async function hasInternalAccess() {
  const cookieStore = await cookies();
  return cookieStore.get(cookieName)?.value === process.env.SKBC_INTERNAL_ACCESS_CODE;
}

export async function grantInternalAccess() {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, process.env.SKBC_INTERNAL_ACCESS_CODE ?? "", {
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

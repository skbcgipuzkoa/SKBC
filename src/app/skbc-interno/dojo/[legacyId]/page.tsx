import { redirect } from "next/navigation";

export default async function InternalDojoClassPage({
  params,
  searchParams
}: {
  params: Promise<{ legacyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ legacyId }, query] = await Promise.all([params, searchParams]);
  const queryString = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (typeof value === "string") queryString.set(key, value);
  });

  redirect(`/dojo/${legacyId}${queryString.size ? `?${queryString.toString()}` : ""}`);
}

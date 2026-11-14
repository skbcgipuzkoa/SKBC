import type { Metadata } from "next";
import type { ReactNode } from "react";

export async function generateMetadata({ params }: {
  params: Promise<{ dojo: string }>;
}): Promise<Metadata> {
  return (await params).dojo === "anandi" ? { manifest: null } : {};
}

export default async function DojoLayout({ children, params }: { children: ReactNode; params: Promise<{ dojo: string }> }) {
  return <>{(await params).dojo === "anandi" && <link rel="manifest" href="/portal/anandi-manifest" crossOrigin="use-credentials" />}{children}</>;
}

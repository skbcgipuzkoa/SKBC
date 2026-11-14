import type { Metadata } from "next";
import type { ReactNode } from "react";

export async function generateMetadata({ params }: {
  params: Promise<{ dojo: string }>;
}): Promise<Metadata> {
  return (await params).dojo === "anandi" ? { manifest: "/anandi.webmanifest" } : {};
}

export default function DojoLayout({ children }: { children: ReactNode }) {
  return children;
}

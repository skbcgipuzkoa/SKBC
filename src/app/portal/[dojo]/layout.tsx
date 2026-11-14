import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { requireDojo } from "@/lib/dojo-access";

export async function generateMetadata({ params }: {
  params: Promise<{ dojo: string }>;
}): Promise<Metadata> {
  return (await params).dojo === "anandi" ? { manifest: null } : {};
}

export default async function DojoLayout({ children, params }: { children: ReactNode; params: Promise<{ dojo: string }> }) {
  const { dojo } = await requireDojo((await params).dojo);
  const theme = {
    "--brand": dojo.accent_color,
    "--brand-strong": `color-mix(in srgb, ${dojo.accent_color}, black 25%)`
  } as CSSProperties;
  return <div style={theme}>
    {dojo.slug === "anandi" && <link rel="manifest" href="/portal/anandi-manifest" crossOrigin="use-credentials" />}
    {children}
  </div>;
}

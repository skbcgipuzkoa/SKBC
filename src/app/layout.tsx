import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SKBC Gipuzkoa",
  description: "Nueva plataforma de gestion de SKBC Gipuzkoa"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

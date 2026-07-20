import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ETYECU DAP",
  description: "Sistema integrado de gestión de inventario y etiquetado",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

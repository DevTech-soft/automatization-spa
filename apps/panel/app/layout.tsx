import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";

const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Panel de operador",
  description: "Gestión multi-cliente",
};

/**
 * Aplica el modo elegido en el header antes del primer pintado (sin elección,
 * manda `prefers-color-scheme`). Va inline porque tiene que correr antes de
 * hidratar; la clave es `THEME_STORAGE_KEY` de components/theme-toggle.tsx.
 */
const themeScript = `try{var t=localStorage.getItem("panel-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={publicSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verdyn | Campus CSV Analytics",
  description: "Upload campus energy and water readings to generate consumption analytics, forecasts, and review actions.",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

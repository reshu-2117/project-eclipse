import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/cormorant-garamond/latin-400-italic.css";
import "@fontsource/cormorant-garamond/latin-500.css";
import "@fontsource/cormorant-garamond/latin-500-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Eclipse — Lantern 17 is failing",
  description:
    "A sunless rogue planet kept alive by orbital Lanterns. One is failing. Design the mission that finds out why.",
};

export const viewport: Viewport = {
  themeColor: "#05070B",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
